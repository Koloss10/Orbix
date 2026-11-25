// Orbix v18: картка сигналу в Telegram — PNG із графіком, ордерами, TP/SL і логікою відкриття.
// Виклики:
//   * runner: POST { uid, spec, caption } з заголовком x-runner-secret (той самий секрет розкладу, перевірка — RPC runner_check);
//   * користувач: POST { action: "test" } з його JWT — пробна картка в його чат (потрібна 2FA, якщо ввімкнена).
// Токен Telegram читається з Vault (tg_secret_for) і нікуди не повертається. verify_jwt вимкнено: автентифікація тут, у коді.
// Малювання: card.js (SVG) → resvg (WebAssembly) → PNG; шрифт DejaVu Sans (кирилиця). Усе безкоштовне, без зовнішніх сервісів малювання.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";
import { cardSvg, demoSpec, W } from "./card.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const env = (k: string) => Deno.env.get(k) ?? "";
const CDN = "https://cdn.jsdelivr.net/npm/";
const bytes = async (u: string) => { const r = await fetch(u); if (!r.ok) throw new Error(`HTTP ${r.status} ${u}`); return new Uint8Array(await r.arrayBuffer()); };

// WebAssembly і шрифти завантажуються один раз на екземпляр функції
let ready: Promise<Uint8Array[]> | null = null;
const boot = () => ready ??= (async () => {
  await initWasm(await bytes(CDN + "@resvg/resvg-wasm@2.6.2/index_bg.wasm"));
  return Promise.all(["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"].map((f) => bytes(CDN + "dejavu-fonts-ttf@2.37.3/ttf/" + f)));
})().catch((e) => { ready = null; throw e; });

async function png(spec: unknown) {
  const fonts = await boot();
  const r = new Resvg(cardSvg(spec), { font: { fontBuffers: fonts, loadSystemFonts: false, defaultFontFamily: "DejaVu Sans" }, fitTo: { mode: "width", value: W } });
  return r.render().asPng();
}

async function sendPhoto(token: string, chat: string, img: Uint8Array, caption: string) {
  const fd = new FormData();
  fd.append("chat_id", chat);
  fd.append("caption", caption.slice(0, 1024));
  fd.append("photo", new Blob([img], { type: "image/png" }), "orbix-card.png");
  const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (!j?.ok) { console.warn("tg-card: telegram rejected", r.status, j?.error_code, j?.description); throw new Error(j?.description || `Telegram HTTP ${r.status}`); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  try {
    const body = await req.json().catch(() => ({}));
    let uid = "", spec: unknown, caption = "";
    const rs = req.headers.get("x-runner-secret");
    if (rs) {
      const { data: ok } = await admin.rpc("runner_check", { p_token: rs });
      if (ok !== true) return json({ error: "forbidden" }, 403);
      if (typeof body?.uid !== "string" || !/^[0-9a-f-]{36}$/i.test(body.uid) || !body?.spec || typeof body.spec !== "object") return json({ error: "bad request" }, 400);
      uid = body.uid; spec = body.spec; caption = typeof body.caption === "string" ? body.caption : "";
    } else {
      const asUser = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
      const { data: u, error: ue } = await asUser.auth.getUser();
      if (ue || !u?.user) return json({ error: "unauthorized" }, 401);
      const { data: can, error: ce } = await asUser.rpc("tg_can_send");
      if (ce) return json({ error: "Не вдалося перевірити доступ" }, 500);
      if (!can) return json({ error: "Telegram не підключено або потрібен вхід із кодом 2FA" }, 403);
      if (body?.action !== "test") return json({ error: "bad request" }, 400);
      const { data: pr } = await asUser.from("tg_card_prefs").select("theme,parts,candles").eq("user_id", u.user.id).maybeSingle();
      const th = body?.theme === "light" || body?.theme === "dark" ? body.theme : pr?.theme === "light" ? "light" : "dark";
      uid = u.user.id; spec = demoSpec({ theme: th, parts: body?.parts && typeof body.parts === "object" ? body.parts : pr?.parts ?? null, n: [40, 80, 150].includes(+pr?.candles) ? +pr.candles : 80 });
      caption = "Orbix: пробна картка сигналу. Так виглядатимуть сповіщення про вхід, докупівлі й закриття угод.";
    }
    const { data, error } = await admin.rpc("tg_secret_for", { p_uid: uid });
    if (error) return json({ error: "Не вдалося прочитати налаштування Telegram" }, 500);
    const t = Array.isArray(data) ? data[0] : data;
    if (!t?.token || !t?.chat_id) return json({ error: "Telegram не підключено" }, 404);
    await sendPhoto(t.token, t.chat_id, await png(spec), caption);
    return json({ ok: true });
  } catch (e) {
    console.error("tg-card:", (e as Error)?.message ?? e);
    return json({ error: "Не вдалося надіслати картку: " + String((e as Error)?.message ?? e).slice(0, 200) }, 502);
  }
});
