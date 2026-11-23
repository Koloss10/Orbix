// Оркестрація запиту до Orbix AI: ліміти, діалог, історія, виклик моделі з інструментами, збереження.
// Усе, що торкається бази й мережі, передається ззовні (store, provider, db): логіка тестується в Node без мережі,
// tests/ai-agent.test.mjs. Помічник не впливає на ботів: збій тут нічого не зупиняє.
import { buildSystemPrompt } from "./prompt.js";
import { AIProviderError, providerErrorText } from "./provider.js";
import { cleanContext, cleanText, estimateTokens, makeTitle, rateDecision } from "./security.js";
import { runTool, toolSpecs } from "./tools.js";

const LIMIT_TEXT = {
  user_minute: "Забагато повідомлень за хвилину. Зачекайте трохи.",
  user_daily: "Денний ліміт повідомлень до AI вичерпано. Він оновиться з нової доби (UTC).",
  global_daily: "Безкоштовна квота AI на сьогодні вичерпана для всієї платформи. Спробуйте завтра.",
};

/** Виконує допоміжну дію (облік, збереження): збій лише пишеться в журнал і не обриває відповідь. */
async function soft(fn) {
  try { await fn(); return true; } catch (e) { console.warn("ai bookkeeping failed", String(e?.message ?? e).slice(0, 80)); return false; }
}

/** Історія під бюджет токенів: найстаріші повідомлення відкидаються першими. */
export function fitHistory(history, budgetTokens) {
  const out = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const t = estimateTokens(history[i].content) + 4;
    if (used + t > budgetTokens) break;
    used += t;
    out.unshift(history[i]);
  }
  while (out.length && out[0].role !== "user") out.shift(); // діалог для моделі починається з повідомлення користувача
  return out;
}

/**
 * @param {object} p
 * @param {object} p.cfg      — результат readConfig().cfg
 * @param {object} p.provider — AIProvider
 * @param {object} p.store    — доступ до таблиць ai_* (через сервісний ключ, з перевіркою власника)
 * @param {object} p.toolCtx  — { db, userId, now } для інструментів
 * @param {{ message?: unknown, conversation_id?: unknown, context?: unknown }} p.req
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function handleChat({ cfg, provider, store, toolCtx, req }) {
  const now = toolCtx.now;
  const text = cleanText(req.message, cfg.maxMessageChars);
  if (!text) return { status: 400, body: { error: "empty_message", message: "Напишіть запитання." } };

  const counts = await store.usageCounts(now);
  const dec = rateDecision({ now, ...counts, minuteLimit: cfg.minuteLimit, dailyLimit: cfg.dailyLimit, globalLimit: cfg.globalDailyLimit });
  if (!dec.ok) return { status: 429, body: { error: dec.code, message: LIMIT_TEXT[dec.code], retry_after: dec.retryAfter } };

  const context = cleanContext(req.context);
  let convId = typeof req.conversation_id === "string" ? req.conversation_id : null;
  if (convId) {
    if (!(await store.ownsConversation(convId))) return { status: 404, body: { error: "conversation_not_found", message: "Діалог не знайдено." } };
  } else {
    convId = await store.createConversation({ title: makeTitle(text), context });
  }

  // резервуємо запит у лічильнику до виклику моделі: так паралельні спроби не обходять ліміт
  const usageId = await store.reserveUsage({ model: cfg.model, requestType: "chat" });
  const system = buildSystemPrompt(context, now);
  const specs = toolSpecs();
  const fixed = estimateTokens(system) + estimateTokens(JSON.stringify(specs)) + estimateTokens(text) + cfg.maxOutputTokens;
  const history = fitHistory(await store.loadHistory(convId, cfg.historyMessages), Math.max(0, cfg.maxInputTokens - fixed));
  const messages = [{ role: "system", content: system }, ...history, { role: "user", content: text }];

  let result;
  try {
    result = await provider.continueConversation({
      messages, tools: specs, maxRounds: cfg.maxToolRounds, maxTokens: cfg.maxOutputTokens,
      run: async (name, args) => runTool(name, args, toolCtx, cfg.toolResultChars),
    });
  } catch (e) {
    await soft(() => store.finishUsage(usageId, { input: 0, output: 0 }));
    await soft(() => store.saveMessages(convId, [{ role: "user", content: text, metadata: { context } }]));
    const err = e instanceof AIProviderError ? e : new AIProviderError("unavailable", "збій");
    const status = err.code === "quota" ? 429 : err.code === "auth" ? 503 : 502;
    if (!(e instanceof AIProviderError)) console.warn("ai failure", e?.message);
    return { status, body: { error: `provider_${err.code}`, message: providerErrorText(err), conversation_id: convId, retry_after: err.retryAfter || undefined } };
  }

  const reply = result.text || "Не вдалося сформувати відповідь. Спробуйте переформулювати запитання.";
  const sources = result.steps.filter((s) => s.ok).map(({ name, label, as_of }) => ({ name, label, as_of }));
  // збій обліку чи збереження не має «з'їсти» вже отриману відповідь
  await soft(() => store.finishUsage(usageId, result.usage));
  for (let i = 1; i < result.rounds; i++) await soft(() => store.recordToolRound(cfg.model)); // кожне коло — окреме звернення до провайдера
  const saved = await soft(() => store.saveMessages(convId, [
    { role: "user", content: text, metadata: { context } },
    { role: "assistant", content: reply, metadata: { sources, failed_tools: result.steps.filter((s) => !s.ok).map((s) => s.name), model: cfg.model } },
  ]));
  return {
    status: 200,
    body: { conversation_id: convId, reply, saved, sources, as_of: sources.map((s) => s.as_of).filter(Boolean).sort().pop() ?? null, usage: { input_tokens: result.usage.input, output_tokens: result.usage.output } },
  };
}
