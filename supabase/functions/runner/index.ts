// Orbix runner: боти на сервері 24/7. Викликається розкладом бази (pg_cron) кожні 5 хвилин.
// Для кожного бота з позначкою «Сервер 24/7» бере свіжі закриті свічки з біржі, проганяє той самий
// торговий рушій, що й у браузері (engine.js, згенерований з src/js), зберігає стан, пише події,
// за потреби виконує угоди на Bybit Demo / Binance Testnet (mirror.js) і надсилає сповіщення в Telegram.
// Порядок: стан (разом із чергою дій для біржі) зберігається першим із перевіркою версії — лише потім біржа.
// Доступ лише з секретом розкладу (x-runner-secret), перевірка — RPC runner_check.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { botConfig, INTERVAL, processBot } from "./core.js";
import { binance, bybit } from "./exchanges.ts";
import { handleBot, owners, park } from "./mirror.js";
import { limitsOf, riskBlock } from "./risk.js";
import { htfNeed } from "./engine.js";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const BYIV: Record<string, string> = { "1h": "60", "4h": "240", "12h": "720", "1d": "D", "1w": "W" };
type C = { t: number; o: number; h: number; l: number; c: number; v: number; bv?: number; nt?: number; ml?: number; mh?: number };

async function getJson(u: string) { const r = await fetch(u); if (!r.ok) throw new Error(`HTTP ${r.status} ${u.split("?")[0]}`); return r.json(); }
/* ринкові дані: Binance (ф'ючерси з mark price і funding або спот), резерв — Bybit */
async function market(symbol: string, iv: string, fut: boolean, lim = 400) {
  try {
    const base = fut ? "https://fapi.binance.com/fapi/v1" : "https://api.binance.com/api/v3";
    const k = await getJson(`${base}/klines?symbol=${symbol}&interval=${iv}&limit=${lim}`);
    const candles: C[] = k.map((r: any[]) => ({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5], bv: +r[9], nt: +r[8] })); // bv — об'єм покупців (taker buy) для фільтра китів, nt — кількість угод (сплеск активності)
    let funding: { t: number; r: number }[] | null = null;
    if (fut) {
      const m = await getJson(`${base}/markPriceKlines?symbol=${symbol}&interval=${iv}&limit=${lim}`).catch(() => []);
      const mm = new Map(m.map((r: any[]) => [+r[0], r]));
      for (const c of candles) { const x: any = mm.get(c.t); if (x) { c.ml = +x[3]; c.mh = +x[2]; } }
      const f = await getJson(`${base}/fundingRate?symbol=${symbol}&startTime=${Date.now() - 45 * 864e5}&limit=1000`).catch(() => []);
      funding = f.map((x: any) => ({ t: +x.fundingTime, r: +x.fundingRate }));
    }
    return { candles, funding, src: "binance" };
  } catch (_e) {
    const cat = fut ? "linear" : "spot";
    const j = await getJson(`https://api.bybit.com/v5/market/kline?category=${cat}&symbol=${symbol}&interval=${BYIV[iv]}&limit=${lim}`);
    const candles: C[] = (j.result?.list ?? []).map((r: any[]) => ({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] })).reverse();
    let funding: { t: number; r: number }[] | null = null;
    if (fut) {
      const m = await getJson(`https://api.bybit.com/v5/market/mark-price-kline?category=linear&symbol=${symbol}&interval=${BYIV[iv]}&limit=${lim}`).catch(() => ({}));
      const mm = new Map((m.result?.list ?? []).map((r: any[]) => [+r[0], r]));
      for (const c of candles) { const x: any = mm.get(c.t); if (x) { c.ml = +x[3]; c.mh = +x[2]; } }
      const f = await getJson(`https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${symbol}&limit=200`).catch(() => ({}));
      funding = (f.result?.list ?? []).map((x: any) => ({ t: +x.fundingRateTimestamp, r: +x.fundingRate })).reverse();
    }
    return { candles, funding, src: "bybit" };
  }
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: ok } = await admin.rpc("runner_check", { p_token: req.headers.get("x-runner-secret") ?? "" });
  if (ok !== true) return json({ error: "forbidden" }, 403);
  const started = Date.now();
  // серверні боти: ті, що працюють (обробляються рушієм), і ті, що на паузі (знімаються їхні ордери на біржі)
  const { data: all, error } = await admin.from("bots").select("id,user_id,config,status").in("status", ["running", "paused"]).eq("config->>_srv", "true");
  if (error) return json({ error: error.message }, 500);
  const ids = (all ?? []).map((b: any) => b.id);
  // стани й їхні версії для збереження з перевіркою (compare-and-swap): паралельний запуск не продублює ордери
  const ver = new Map<string, string>(), stOf = new Map<string, any>();
  if (ids.length) {
    const { data: vs, error: ve } = await admin.from("bot_state").select("bot_id,state,updated_at").in("bot_id", ids);
    if (ve) return json({ error: ve.message }, 500);
    for (const v of vs ?? []) { ver.set(v.bot_id, v.updated_at); stOf.set(v.bot_id, v.state); }
  }
  for (const b of all ?? []) (b as any).state = stOf.get(b.id) ?? null;
  const rows = (all ?? []).filter((b: any) => b.status === "running"), paused = (all ?? []).filter((b: any) => b.status === "paused");

  const mcache = new Map<string, Promise<any>>(), keys = new Map<string, Promise<any>>(), tgs = new Map<string, Promise<any>>();
  const log = (bot: any, level: string, message: string, data: unknown = null) =>
    admin.from("bot_events").insert({ bot_id: bot.id, user_id: bot.user_id, level, message: message.slice(0, 500), data });
  const exFor = (uid: string, exName: string) => {
    const k = `${uid}|${exName}`;
    if (!keys.has(k)) keys.set(k, admin.rpc("ex_secret_for", { p_uid: uid, p_exchange: exName }).then(({ data }) => {
      const s = Array.isArray(data) ? data[0] : data;
      return s?.api_key ? (exName === "bybit" ? bybit(s.api_key, s.api_secret) : binance(s.api_key, s.api_secret)) : null;
    }));
    return keys.get(k)!;
  };
  const tgFor = (uid: string) => {
    if (!tgs.has(uid)) tgs.set(uid, admin.rpc("tg_secret_for", { p_uid: uid }).then(({ data }) => (Array.isArray(data) ? data[0] : data) ?? null));
    return tgs.get(uid)!;
  };

  let done = 0, evCount = 0;
  // один рахунок біржі — одна позиція на символ: другий бот із «Тестнет» на тій самій парі угод не дублює
  const owner = owners(rows ?? []);
  // ліміти ризику (profiles.risk_*) і боти кожного користувача, що торгують на біржі, — для загального й денного ліміту
  const lims = new Map<string, any>(), tnBots = new Map<string, { uid: string; g: any; state: any }>();
  {
    const uids = [...new Set((rows ?? []).map((b: any) => b.user_id))];
    const { data: pr, error: pe } = uids.length ? await admin.from("profiles").select("id,risk_max_pos,risk_max_total,risk_day_loss").in("id", uids) : { data: [], error: null };
    if (pe) console.warn("runner: profiles", pe.message); // ліміти за замовчуванням (limitsOf(undefined))
    for (const p of pr ?? []) lims.set(p.id, p);
    for (const b of rows ?? []) {
      try {
        const g: any = botConfig(b.config), cfg = b.config || {};
        if (cfg._tn && g.fut && owner.get(`${b.user_id}|${cfg._ex === "binance" ? "binance" : "bybit"}|${g.pair}`) === b.id) tnBots.set(b.id, { uid: b.user_id, g, state: b.state });
      } catch (_e) { /* бот із пошкодженим конфігом обробиться (і запишеться помилка) нижче */ }
    }
  }
  const saver = (bot: any) => async (state: unknown) => {
    const at = new Date().toISOString(), old = ver.get(bot.id);
    if (old) {
      const { data, error } = await admin.from("bot_state").update({ state, updated_at: at }).eq("bot_id", bot.id).eq("updated_at", old).select("bot_id");
      if (error || !data?.length) return false;
    } else {
      const { error } = await admin.from("bot_state").insert({ bot_id: bot.id, user_id: bot.user_id, state, updated_at: at });
      if (error) return false;
    }
    ver.set(bot.id, at);
    return true;
  };

  for (const bot of rows ?? []) {
    if (Date.now() - started > 100e3) break; // запас до ліміту часу функції
    try {
      const g: any = botConfig(bot.config), cfg = bot.config || {};
      if (!/^[A-Z0-9]{2,20}\/USDT$/.test(g.pair || "")) continue;
      const iv = (INTERVAL as Record<number, string>)[g.tf || 1];
      if (!iv) continue;
      // фільтр тренду старшого таймфрейму потребує довшої історії: до 1000 свічок (ліміт Bybit)
      const lim = Math.min(1000, Math.max(400, htfNeed(g) + 30));
      const symbol = g.pair.replace("/", ""), mk = `${symbol}|${iv}|${g.fut ? 1 : 0}|${lim}`;
      if (!mcache.has(mk)) mcache.set(mk, market(symbol, iv, !!g.fut, lim));
      const m = await mcache.get(mk);
      const exName = cfg._ex === "binance" ? "binance" : "bybit";
      const want = !!(cfg._tn && g.fut);
      const mirror = want && owner.get(`${bot.user_id}|${exName}|${g.pair}`) === bot.id;
      // ліміт ризику: перевищено — нових угод не відкривати (позиції, що вже є, бот веде далі)
      const peers = mirror ? [...tnBots.entries()].filter(([id, x]) => id !== bot.id && x.uid === bot.user_id).map(([, x]) => x) : [];
      const blk = mirror ? riskBlock({ limits: limitsOf(lims.get(bot.user_id)), self: { g, state: bot.state }, peers, now: Date.now() }) : null;
      const r = processBot({ g, state: bot.state, candles: m.candles, funding: m.funding, now: Date.now(), spans: cfg._sp, entryOk: !blk });
      evCount += r.events.length;
      if (tnBots.has(bot.id)) tnBots.get(bot.id)!.state = { ...(bot.state || {}), ...r.state }; // нова угода цього запуску займає ліміт для наступних ботів
      if (want && !mirror && r.events.length) await log(bot, "warn", `На демо-рахунку вже торгує інший бот ${g.pair} — угоду не продубльовано (позиції злилися б в одну)`);
      const ex = mirror ? await exFor(bot.user_id, exName) : null;
      await handleBot({
        bot, g, r, symbol, mirror, native: !!ex?.native, ex, risk: mirror ? { blk } : null,
        save: saver(bot),
        log: (level: string, text: string, data: unknown = null) => log(bot, level, text, data && typeof data === "object" ? { ...(data as object), src: m.src } : data),
        notify: async (text: string) => {
          try {
            const t = await tgFor(bot.user_id);
            if (t?.token && t?.chat_id) await fetch(`https://api.telegram.org/bot${t.token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: t.chat_id, text, disable_web_page_preview: true }) });
          } catch (_e) { /* сповіщення не критичні */ }
        },
      });
      done++;
    } catch (e) {
      console.warn("runner bot failed", bot.id, (e as Error).message);
      await log(bot, "error", `Сервер: ${(e as Error).message}`);
    }
  }
  // боти на паузі, яких сервер уже вів із «Тестнет»: один раз зняти їхні лімітні докупівлі на біржі
  let parked = 0;
  for (const bot of paused) {
    if (Date.now() - started > 110e3) break;
    try {
      const cfg = bot.config || {}, st = bot.state;
      if (!st || st.fl?.parked || !cfg._tn || !(cfg.fut ?? 1) || typeof cfg.pair !== "string") continue;
      const exName = cfg._ex === "binance" ? "binance" : "bybit", symbol = cfg.pair.replace("/", "");
      const busy = owner.has(`${bot.user_id}|${exName}|${cfg.pair}`); // на цій парі вже працює інший бот — його ордери не чіпаємо
      const ex = await exFor(bot.user_id, exName);
      const msg = ex?.native ? await park(ex, { symbol, botId: bot.id }) : null;
      if (!(await saver(bot)({ ...st, pend: [], fl: { ...(st.fl || {}), parked: 1 } }))) continue;
      parked++;
      if (msg && !busy) {
        await log(bot, "warn", msg);
        try {
          const t = await tgFor(bot.user_id);
          if (t?.token && t?.chat_id) await fetch(`https://api.telegram.org/bot${t.token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: t.chat_id, text: `Orbix (сервер): ${cfg.pair} — ${msg}`, disable_web_page_preview: true }) });
        } catch (_e) { /* сповіщення не критичні */ }
      }
    } catch (e) {
      console.warn("runner park failed", bot.id, (e as Error).message);
      await log(bot, "error", `Сервер (пауза): ${(e as Error).message}`);
    }
  }
  return json({ ok: true, bots: rows?.length ?? 0, processed: done, events: evCount, paused: paused.length, parked, ms: Date.now() - started });
});
