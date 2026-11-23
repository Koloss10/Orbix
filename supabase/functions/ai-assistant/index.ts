// Orbix AI: помічник платформи. Лише читання та рекомендації: ордери, запуск і зупинка ботів, зміна налаштувань
// для AI недоступні. Ключ провайдера лежить у секретах функції й ніколи не потрапляє в браузер.
// Виклик: POST /functions/v1/ai-assistant з JWT користувача.
//   { "message": "...", "conversation_id"?: "uuid", "context"?: { "type": "bot", "id"?: "uuid", "pair"?: "ETH/USDT" } }
//   { "action": "status" } — чи доступний AI й скільки повідомлень лишилось сьогодні.
// Якщо AI вимкнено чи недоступний, боти й решта платформи працюють як завжди: функція нічого з ними не робить.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { handleChat } from "./agent.js";
import { readConfig } from "./config.js";
import { OpenAIProvider } from "./provider.js";
import { dayStartUtc } from "./security.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
const MAX_BODY = 20_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") ?? "";
    // клієнт від імені користувача: перевіряє JWT, а читання даних іде під RLS (разом із вимогою 2FA)
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u, error: ue } = await asUser.auth.getUser();
    if (ue || !u?.user) return json({ error: "unauthorized", message: "Увійдіть в акаунт Orbix." }, 401);
    const uid = u.user.id;

    const conf = readConfig((n) => Deno.env.get(n));
    if (!conf.ok) {
      const off = conf.reason === "disabled";
      return json({ error: off ? "ai_disabled" : "ai_not_configured", message: off ? "AI-помічник зараз вимкнено." : "AI-помічник ще не налаштовано на сервері." }, 503);
    }
    const cfg = conf.cfg;

    const { data: can, error: ce } = await asUser.rpc("ai_can_use");
    if (ce) { console.warn("ai_can_use failed", ce.code); return json({ error: "ai_not_ready", message: "AI-помічник ще не підготовлено в базі даних." }, 503); }
    if (can !== true) return json({ error: "ai_forbidden", message: "Потрібен вхід із кодом 2FA, або AI вимкнено у ваших налаштуваннях." }, 403);

    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ error: "too_large", message: "Запит завеликий." }, 413);
    let body: Record<string, unknown> = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch (_e) { return json({ error: "bad_json" }, 400); }

    // запис у ai_* — лише від імені сервера, завжди з перевіркою власника
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const must = <T>(r: { data: T | null; error: unknown }, what: string): T => {
      if (r.error || r.data === null) { console.warn("ai store failed", what); throw new Error(what); }
      return r.data;
    };
    const mustOk = (r: { error: unknown }, what: string) => { if (r.error) { console.warn("ai store failed", what); throw new Error(what); } };

    const store = {
      async usageCounts(now: number) {
        const day = new Date(dayStartUtc(now)).toISOString(), minute = new Date(now - 60_000).toISOString();
        const base = () => admin.from("ai_usage").select("id", { count: "exact", head: true });
        const [m, d, g] = await Promise.all([
          base().eq("user_id", uid).eq("request_type", "chat").gte("created_at", minute),
          base().eq("user_id", uid).eq("request_type", "chat").gte("created_at", day),
          base().gte("created_at", day),
        ]);
        if (m.error || d.error || g.error) throw new Error("usage counts");
        return { usedMinute: m.count ?? 0, usedToday: d.count ?? 0, globalToday: g.count ?? 0 };
      },
      async ownsConversation(id: string) {
        const r = await admin.from("ai_conversations").select("id").eq("id", id).eq("user_id", uid).limit(1);
        mustOk(r, "conversation lookup");
        return (r.data?.length ?? 0) > 0;
      },
      async createConversation({ title, context }: { title: string; context: { type: string; id?: string } }) {
        const r = await admin.from("ai_conversations").insert({ user_id: uid, title, context_type: context.type, context_id: context.id ?? null }).select("id").single();
        return must(r, "conversation insert").id as string;
      },
      async loadHistory(convId: string, n: number) {
        const r = await admin.from("ai_messages").select("role,content").eq("conversation_id", convId).eq("user_id", uid).order("created_at", { ascending: false }).limit(n);
        return must(r, "history").reverse().map((m: { role: string; content: string }) => ({ role: m.role, content: m.content }));
      },
      async reserveUsage({ model, requestType }: { model: string; requestType: string }) {
        const r = await admin.from("ai_usage").insert({ user_id: uid, model, request_type: requestType }).select("id").single();
        return must(r, "usage reserve").id as number;
      },
      async finishUsage(id: number, usage: { input: number; output: number }) {
        mustOk(await admin.from("ai_usage").update({ input_tokens: usage.input, output_tokens: usage.output }).eq("id", id).eq("user_id", uid), "usage finish");
      },
      async recordToolRound(model: string) {
        mustOk(await admin.from("ai_usage").insert({ user_id: uid, model, request_type: "tool_round" }), "usage round");
      },
      async saveMessages(convId: string, msgs: { role: string; content: string; metadata?: unknown }[]) {
        const t0 = Date.now();
        // різні мітки часу, щоб порядок «питання → відповідь» зберігався
        const rows = msgs.map((m, i) => ({ conversation_id: convId, user_id: uid, role: m.role, content: m.content, metadata: m.metadata ?? {}, created_at: new Date(t0 + i).toISOString() }));
        mustOk(await admin.from("ai_messages").insert(rows), "messages insert");
        mustOk(await admin.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId).eq("user_id", uid), "conversation touch");
      },
    };

    if (body.action === "status") {
      const c = await store.usageCounts(Date.now());
      return json({ ok: true, enabled: true, daily_limit: cfg.dailyLimit, left_today: Math.max(0, cfg.dailyLimit - c.usedToday) });
    }

    const provider = new OpenAIProvider({ baseUrl: cfg.baseUrl!, apiKey: cfg.apiKey, model: cfg.model, maxOutputTokens: cfg.maxOutputTokens, timeoutMs: cfg.timeoutMs });
    const r = await handleChat({
      cfg, provider, store,
      toolCtx: { db: asUser, userId: uid, now: Date.now() },
      req: { message: body.message, conversation_id: body.conversation_id, context: body.context },
    });
    return json(r.body, r.status);
  } catch (e) {
    // у журнал — лише причина, без тексту повідомлень і даних користувача
    console.warn("ai-assistant error", String((e as Error)?.message ?? e).slice(0, 120));
    return json({ error: "server_error", message: "Не вдалося обробити запит. Спробуйте пізніше." }, 500);
  }
});
