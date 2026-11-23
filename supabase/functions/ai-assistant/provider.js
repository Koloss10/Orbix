// Orbix AI: адаптер мовної моделі (AIProvider).
// Один адаптер для будь-якого сервісу з OpenAI-сумісним Chat Completions API: Groq (безкоштовний тариф,
// за замовчуванням), OpenAI, OpenRouter тощо. Адреса, модель і ключ — лише з секретів серверної функції.
// Чиста логіка без Deno: fetch і очікування передаються ззовні (тестується в Node: tests/ai.test.mjs).
//
// AIProvider: { name, model, chat({ messages, tools, toolChoice }) → { text, toolCalls, usage } }
//   toolCalls — [{ id, name, args }] (args — уже розібраний JSON або {} для зіпсованого)
//   usage     — { input, output } токенів

export class AIError extends Error {
  /** @param {'timeout'|'quota'|'unavailable'|'auth'|'bad_response'} code */
  constructor(code, message) { super(message); this.code = code; }
}

const TRANSIENT = new Set([408, 409, 500, 502, 503, 504]);
const defSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {{ baseUrl: string, apiKey: string, model: string, fetchImpl?: typeof fetch, timeoutMs?: number,
 *           retries?: number, maxOutputTokens?: number, sleep?: (ms:number)=>Promise<void> }} o
 */
export function createProvider(o) {
  if (!o || !o.baseUrl || !o.apiKey || !o.model) throw new AIError("auth", "AI не налаштовано: немає адреси, моделі або ключа");
  const f = o.fetchImpl || fetch, sleep = o.sleep || defSleep;
  const timeoutMs = o.timeoutMs ?? 30000, retries = o.retries ?? 2, url = o.baseUrl.replace(/\/+$/, "") + "/chat/completions";

  async function once(body) {
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      return await f(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${o.apiKey}` },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
    } catch (e) {
      throw new AIError(e && e.name === "AbortError" ? "timeout" : "unavailable", "AI-сервіс не відповів");
    } finally { clearTimeout(timer); }
  }

  async function chat({ messages, tools, toolChoice }) {
    const body = { model: o.model, messages, temperature: 0.2, max_tokens: o.maxOutputTokens ?? 1200 };
    if (tools && tools.length) { body.tools = tools; body.tool_choice = toolChoice || "auto"; }
    let last;
    for (let a = 0; a <= retries; a++) {
      if (a && !(last && last.code === "quota")) await sleep(800 * 2 ** (a - 1));
      let r;
      try { r = await once(body); } catch (e) { last = e; continue; }
      if (r.status === 401 || r.status === 403) throw new AIError("auth", "AI-сервіс відхилив ключ");
      if (r.status === 429) {
        // ліміт за хвилину: чекаємо, лише якщо сервіс сам каже, що недовго; інакше відмова одразу (не палимо денний ліміт)
        const wait = +((r.headers && r.headers.get && r.headers.get("retry-after")) || NaN);
        last = new AIError("quota", "Вичерпано ліміт AI-сервісу — спробуйте за хвилину");
        if (!(wait >= 0 && wait <= 20) || a >= retries) throw last;
        await sleep(wait * 1000); continue;
      }
      if (TRANSIENT.has(r.status)) { last = new AIError("unavailable", `AI-сервіс тимчасово недоступний (${r.status})`); continue; }
      if (!r.ok) throw new AIError("bad_response", `AI-сервіс повернув помилку ${r.status}`);
      return parse(await r.json().catch(() => null));
    }
    throw last || new AIError("unavailable", "AI-сервіс недоступний");
  }

  return { name: "openai-compatible", model: o.model, chat };
}

function parse(j) {
  const m = j && j.choices && j.choices[0] && j.choices[0].message;
  if (!m) throw new AIError("bad_response", "AI-сервіс повернув порожню відповідь");
  const toolCalls = (Array.isArray(m.tool_calls) ? m.tool_calls : []).filter((c) => c && c.function && c.function.name).map((c) => {
    let args = {};
    try { const v = JSON.parse(c.function.arguments || "{}"); if (v && typeof v === "object" && !Array.isArray(v)) args = v; } catch { /* зіпсовані аргументи → {} */ }
    return { id: String(c.id || ""), name: String(c.function.name), args };
  });
  const u = j.usage || {};
  return { text: typeof m.content === "string" ? m.content : "", toolCalls, usage: { input: +u.prompt_tokens || 0, output: +u.completion_tokens || 0 } };
}
