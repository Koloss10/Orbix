// Orbix AI: серверна функція помічника (етап 1 — лише читання й рекомендації).
// POST /functions/v1/ai-assistant { message, conversationId?, context?: { type, id } }
//
// 1. JWT і 2FA (як у функції exchange). 2. AI_ENABLED і денний ліміт запитів (ai_usage).
// 3. Історія діалогу. 4. Цикл моделі з інструментами читання (tools.js): дані читаються ВІД ІМЕНІ
//    користувача, тож RLS і 2FA бази відсікають чуже. 5. Збереження повідомлень і обліку (service_role).
// Секрети (лише в Edge Function Secrets, у браузер не повертаються):
//   AI_API_KEY (обов'язковий), AI_BASE_URL (за замовчуванням Groq), AI_DEFAULT_MODEL, AI_MAX_OUTPUT_TOKENS,
//   AI_DAILY_LIMIT, AI_ENABLED ("false" вимикає помічника; торгівля від нього не залежить).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { createProvider, AIError } from "./provider.js";
import { createTools } from "./tools.js";
import { contextNote, LIMITS, overLimit, parseRequest, runConversation, titleOf, trimHistory } from "./agent.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
const env = (k: string, d = "") => Deno.env.get(k) ?? d;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (env("AI_ENABLED", "true") === "false") return json({ error: "Orbix AI вимкнено", code: "disabled" }, 503);
  try {
    const url = env("SUPABASE_URL");
    const asUser = createClient(url, env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u, error: ue } = await asUser.auth.getUser();
    if (ue || !u?.user) return json({ error: "unauthorized" }, 401);
    const { data: mfa, error: me } = await asUser.rpc("mfa_ok_now");
    if (me) return json({ error: "Не вдалося перевірити 2FA" }, 500);
    if (!mfa) return json({ error: "Потрібен вхід із кодом 2FA", code: "mfa" }, 403);
    const uid = u.user.id;

    const p = parseRequest(await req.json().catch(() => null));
    if ("error" in p) return json({ error: p.error }, 400);

    const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"));
    // атомарний денний ліміт (UTC): номер запиту за добу або null, якщо ліміт вичерпано
    const daily = Math.min(500, Math.max(1, Math.round(+env("AI_DAILY_LIMIT", String(LIMITS.dailyRequests))) || LIMITS.dailyRequests));
    const { data: used, error: qe } = await admin.rpc("ai_claim_daily_quota", { p_user_id: uid, p_limit: daily });
    if (qe) return json({ error: "Не вдалося перевірити ліміт" }, 503);
    if (used == null || overLimit(used - 1, daily)) return json({ error: `Ліміт Orbix AI: ${daily} запитів на добу (UTC). Спробуйте пізніше.`, code: "limit" }, 429);

    // діалог: власний (перевірка user_id) або новий
    let convId = p.conversationId, history: { role: string; content: string }[] = [];
    if (convId) {
      const { data: c } = await admin.from("ai_conversations").select("id").eq("id", convId).eq("user_id", uid).maybeSingle();
      if (!c) convId = null;
      else {
        const { data: rows } = await admin.from("ai_messages").select("role,content").eq("conversation_id", convId).order("created_at", { ascending: false }).limit(LIMITS.maxHistory);
        history = trimHistory((rows || []).reverse());
      }
    }

    // дані Orbix — від імені користувача (RLS + 2FA), лише потрібні стовпці; ключів бірж тут немає
    const reader = {
      async load() {
        const [b, s, pr] = await Promise.all([
          asUser.from("bots").select("id,status,config,last_error,created_at,updated_at,started_at").limit(100),
          asUser.from("bot_state").select("bot_id,state,updated_at").limit(100),
          asUser.from("profiles").select("risk_max_pos,risk_max_total,risk_day_loss").eq("id", uid).maybeSingle(),
        ]);
        if (b.error || s.error) throw new Error("читання ботів");
        return { bots: b.data, states: s.data, profile: pr.data };
      },
      async events(id: string, n: number) {
        const { data, error } = await asUser.from("bot_events").select("level,message,created_at").eq("bot_id", id).order("created_at", { ascending: false }).limit(n);
        if (error) throw new Error("читання журналу");
        return data;
      },
      async backtests(n: number) {
        const { data, error } = await asUser.from("backtests").select("symbol,timeframe,period_start,period_end,status,results,config,created_at").order("created_at", { ascending: false }).limit(n);
        if (error) throw new Error("читання бектестів");
        return data;
      },
    };
    const tools = createTools({ reader });
    const alias = p.context?.type === "bot" && p.context.id ? await tools.aliasOf(p.context.id).catch(() => null) : null;

    const model = env("AI_DEFAULT_MODEL", "openai/gpt-oss-120b");
    const logUse = (input: number, output: number, ok: boolean) =>
      admin.from("ai_usage").insert({ user_id: uid, model, input_tokens: input, output_tokens: output, ok, request_type: p.context?.type || "chat" });
    let out;
    try {
      const provider = createProvider({
        baseUrl: env("AI_BASE_URL", "https://api.groq.com/openai/v1"), apiKey: env("AI_API_KEY"), model,
        maxOutputTokens: Math.round(+env("AI_MAX_OUTPUT_TOKENS", "1200")) || 1200, timeoutMs: 30000, retries: 2,
      });
      out = await runConversation({ provider, tools, history, message: p.message, note: contextNote(p.context, alias) });
    } catch (e) {
      await logUse(0, 0, false);
      const code = e instanceof AIError ? e.code : "unavailable";
      console.error("ai-assistant:", code, e instanceof Error ? e.message : e);
      const msg = e instanceof AIError ? e.message : "Orbix AI тимчасово недоступний";
      return json({ error: msg, code }, code === "quota" ? 429 : 503);
    }

    if (!convId) {
      const { data: c, error: ie } = await admin.from("ai_conversations")
        .insert({ user_id: uid, title: titleOf(p.message), context_type: p.context?.type ?? null, context_id: p.context?.id ?? null }).select("id").single();
      if (ie) return json({ error: "Не вдалося зберегти діалог" }, 500);
      convId = c.id;
    }
    const dataAt = tools.dataAt();
    const meta = { tools: out.tools, data_at: dataAt, model };
    const ins = await admin.from("ai_messages").insert([
      { conversation_id: convId, user_id: uid, role: "user", content: p.message },
      { conversation_id: convId, user_id: uid, role: "assistant", content: out.text.slice(0, 20000), metadata: meta },
    ]);
    if (ins.error) console.error("ai-assistant: messages", ins.error.message);
    await admin.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId).eq("user_id", uid);
    await logUse(out.usage.input, out.usage.output, true);
    return json({ ok: true, conversationId: convId, text: out.text, tools: out.tools, dataAt, usedToday: used, dailyLimit: daily });
  } catch (e) {
    console.error("ai-assistant:", e instanceof Error ? e.message : e);
    return json({ error: "Orbix AI тимчасово недоступний" }, 500);
  }
});
