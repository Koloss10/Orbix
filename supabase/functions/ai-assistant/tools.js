// Orbix AI: інструменти читання даних, які модель може викликати (function calling).
// Лише читання: жоден інструмент не змінює ботів, лімітів, ключів і не надсилає ордерів.
//
// Дані читає reader — у серверній функції він працює від імені користувача (його JWT), тож рядки
// інших акаунтів і дані без 2FA відсікає сама база (RLS). Тут — друга лінія захисту:
//   * білий список полів: моделі йде лише торгове (пара, налаштування, угоди, PnL, ризики);
//     ні пошти, ні імен, ні id акаунта, ні id ботів чи ордерів, ні ключів;
//   * боти мають псевдоніми B1, B2… (відповідність id ↔ псевдонім лишається на сервері);
//   * тексти, які ввів користувач або біржа (помилки, журнал), позначені як недовірені й обрізані;
//   * розрахунки ризику — та сама логіка, що й у runner (risk.js), модель їх не рахує сама.
import { DEF_LIMITS, dayStart, ladderNotional, limitsOf, realizedSince, riskBlock } from "./risk.js";
import { searchDocs } from "./docs.js";

const r2 = (x, d = 2) => (Number.isFinite(+x) ? Math.round(+x * 10 ** d) / 10 ** d : null);
const iso = (t) => (t == null || t === "" ? null : new Date(typeof t === "number" ? t : String(t)).toISOString());
/* недовірений текст (журнал, помилки біржі): лише як дані, без керувальних символів, обрізаний */
export const untrusted = (s, max = 300) => (s == null ? null : String(s).replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, max));

const BOT = { type: "object", properties: { bot: { type: "string", description: "Псевдонім бота (B1, B2…) або пара, напр. SOL/USDT" } }, required: ["bot"], additionalProperties: false };
const NONE = { type: "object", properties: {}, additionalProperties: false };
const fn = (name, description, parameters) => ({ type: "function", function: { name, description, parameters } });

export const TOOL_DEFS = [
  fn("get_account_overview", "Загальний стан акаунта: кількість ботів, які працюють, підсумковий PnL моделі й біржі, ліміти ризику.", NONE),
  fn("list_user_bots", "Список ботів користувача з псевдонімами (B1, B2…), парою, статусом, основними налаштуваннями й результатом.", NONE),
  fn("get_bot_details", "Налаштування одного бота: сума, ордери, мартингейл, плече, TP/SL, сигнали, режим (сервер, біржа).", BOT),
  fn("get_bot_state", "Поточний стан бота на сервері: відкрита позиція, середня ціна, докупівлі, просадка, звірка з біржею, час останньої обробки.", BOT),
  fn("get_bot_events", "Останні записи журналу бота (події, попередження, помилки біржі).", { ...BOT, properties: { ...BOT.properties, limit: { type: "integer", minimum: 1, maximum: 30 } } }),
  fn("get_bot_trade_history", "Закриті угоди бота за моделлю Orbix і закриття за даними біржі.", { ...BOT, properties: { ...BOT.properties, limit: { type: "integer", minimum: 1, maximum: 50 } } }),
  fn("get_risk_snapshot", "Ризики, пораховані логікою Orbix: ліміти профілю, повна драбина кожного бота, зайнята експозиція, збиток за добу, чи заблоковано нові угоди.", NONE),
  fn("get_backtest_results", "Останні збережені бектести: пара, період, прибуток, просадка, кількість угод, win rate, profit factor.", { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 20 } }, additionalProperties: false }),
  fn("search_orbix_docs", "Пошук у довідці Orbix: як працюють налаштування й функції платформи.", { type: "object", properties: { query: { type: "string", maxLength: 200 } }, required: ["query"], additionalProperties: false }),
];

/* ---------- що саме бачить модель ---------- */
const ladderSum = (g) => { const n = Math.max(1, Math.round(+g.orders || 1)), m = +g.mult || 1; let u = 0; for (let k = 0; k < n; k++) u += m ** k; return u; };
const cfgOf = (b) => { const c = b.config && typeof b.config === "object" ? b.config : {}; const g = {}; for (const [k, v] of Object.entries(c)) if (!k.startsWith("_")) g[k] = v; return { c, g }; };
const mode = (c) => (c._srv ? (c._tn ? (c._ex === "binance" ? "сервер + Binance Testnet" : "сервер + Bybit Demo") : "сервер, лише модель") : "лише в браузері (сервер не веде)");

function settings(g) {
  return {
    pair: g.pair || null, side: +g.d === -1 ? "Short" : "Long", market: +g.fut ? "Futures" : "Spot", timeframe_h: +g.tf || 1,
    sum_margin_usdt: r2((+g.base || 0) * ladderSum(g)), first_order_usdt: r2(g.base), orders: +g.orders || 1, martingale: +g.mult || 1,
    step_pct: r2((+g.step || 0) * 100, 3), step_mult: +g.smul || 1, leverage: +g.fut ? +g.lev || 1 : 1,
    tp_pct: r2((+g.tp || 0) * 100, 3), sl_pct: r2((+g.sl || 0) * 100, 3), trailing_pct: r2((+g.trail || 0) * 100, 3),
    signals: Array.isArray(g.sg) ? g.sg.map(String).slice(0, 12) : [], min_signals: +g.k || 1, pause_after_deal_candles: +g.cd || 0,
    full_ladder_notional_usdt: r2(+g.fut ? ladderNotional(g) : (+g.base || 0) * ladderSum(g), 0),
  };
}

function modelStats(st) {
  const b = st && st.b; if (!b) return null;
  const tr = Array.isArray(b.tr) ? b.tr : [];
  const wins = tr.filter((t) => +t.pnl > 0).length;
  return { closed_deals: tr.length, wins, pnl_usdt: r2(b.cum), drawdown_usdt: r2(st.dd), open_position: !!b.pos };
}
function exchangeStats(st) {
  const xr = st && st.xr; if (!xr || !Array.isArray(xr.l)) return null;
  return { closed: xr.l.length, pnl_usdt: r2(xr.l.reduce((a, x) => a + (+x.pnl || 0), 0)), entries: Array.isArray(xr.en) ? xr.en.length : 0, since: iso(xr.from) };
}

/**
 * @param {{ reader: { load(): Promise<any>, events(id:string, n:number): Promise<any[]>, backtests(n:number): Promise<any[]> },
 *           now?: () => number }} o
 */
export function createTools({ reader, now = () => Date.now() }) {
  let cache = null;
  const data = async () => {
    if (cache) return cache;
    const d = await reader.load();
    const bots = [...(d.bots || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const states = new Map((d.states || []).map((s) => [s.bot_id, s]));
    const list = bots.map((b, i) => { const { c, g } = cfgOf(b); return { alias: "B" + (i + 1), id: b.id, row: b, c, g, st: states.get(b.id) || null }; });
    cache = { profile: d.profile || null, list, at: now() };
    return cache;
  };
  const find = async (q) => {
    const { list } = await data(), s = String(q || "").trim().toUpperCase();
    const hit = list.find((x) => x.alias === s) || (() => { const m = list.filter((x) => String(x.g.pair || "").toUpperCase() === s); return m.length === 1 ? m[0] : null; })();
    if (!hit) return { error: `Бота «${untrusted(q, 40)}» не знайдено. Викличте list_user_bots і візьміть псевдонім (B1, B2…).` };
    return hit;
  };
  const head = (x) => ({ bot: x.alias, pair: x.g.pair || null, status: x.row.status || null, mode: mode(x.c) });

  const impl = {
    async get_account_overview() {
      const { list, profile } = await data();
      const run = list.filter((x) => x.row.status === "running");
      const m = list.map((x) => modelStats(x.st)).filter(Boolean), e = list.map((x) => exchangeStats(x.st)).filter(Boolean);
      return {
        bots_total: list.length, running: run.length, on_server: list.filter((x) => x.c._srv).length,
        on_exchange: list.filter((x) => x.c._srv && x.c._tn).length, open_positions: m.filter((s) => s.open_position).length,
        model_pnl_usdt: r2(m.reduce((a, s) => a + (s.pnl_usdt || 0), 0)), exchange_pnl_usdt: e.length ? r2(e.reduce((a, s) => a + (s.pnl_usdt || 0), 0)) : null,
        limits_usdt: profile ? limitsOf(profile) : { ...DEF_LIMITS, note: "профіль не прочитано — діють ліміти за замовчуванням" },
      };
    },
    async list_user_bots() {
      const { list } = await data();
      return { bots: list.map((x) => ({ ...head(x), settings: settings(x.g), model: modelStats(x.st), exchange: exchangeStats(x.st), server_processed_at: x.st ? iso(x.st.updated_at) : null })) };
    },
    async get_bot_details({ bot }) {
      const x = await find(bot); if (x.error) return x;
      return { ...head(x), settings: settings(x.g), started_at: iso(x.row.started_at), updated_at: iso(x.row.updated_at), last_error: untrusted(x.row.last_error) };
    },
    async get_bot_state({ bot }) {
      const x = await find(bot); if (x.error) return x;
      if (!x.st) return { ...head(x), note: "Сервер не веде цього бота (або ще жодного разу не обробив): стану на сервері немає. Не вигадуйте позицію чи PnL." };
      const s = x.st.state || {}, b = s.b || {}, p = b.pos;
      const pos = p ? { fills: +p.n || 0, of_orders: +x.g.orders || 1, avg_price: p.q ? r2(p.cost / p.q, 6) : null, first_price: r2(p.first, 6), last_fill_price: r2(p.last, 6), peak_price: r2(p.peak, 6), qty: r2(p.q, 6), notional_usdt: r2(p.cost), margin_usdt: r2(p.cost / (+x.g.fut ? +x.g.lev || 1 : 1)), realized_partial_usdt: r2(p.real), funding_usdt: r2(p.fd, 4), tp1_done: !!p.t1 } : null;
      return {
        ...head(x), server_processed_at: iso(x.st.updated_at), last_candle_processed: iso(s.lt), open_position: pos,
        model: modelStats(s), equity_peak_usdt: r2(s.pk), exchange: exchangeStats(s), pending_exchange_actions: Array.isArray(s.pend) ? s.pend.length : 0,
        note: "PnL моделі — розрахунок Orbix за свічками; exchange — фактичні закриття на демо-біржі. Це різні джерела.",
      };
    },
    async get_bot_events({ bot, limit }) {
      const x = await find(bot); if (x.error) return x;
      const n = Math.min(30, Math.max(1, Math.round(+limit || 10)));
      const ev = await reader.events(x.id, n);
      return { ...head(x), events: (ev || []).map((e) => ({ at: iso(e.created_at), level: untrusted(e.level, 10), text_untrusted: untrusted(e.message) })) };
    },
    async get_bot_trade_history({ bot, limit }) {
      const x = await find(bot); if (x.error) return x;
      const n = Math.min(50, Math.max(1, Math.round(+limit || 15)));
      if (!x.st) return { ...head(x), note: "Сервер не веде цього бота: історії угод на сервері немає." };
      const s = x.st.state || {}, tr = Array.isArray(s.b && s.b.tr) ? s.b.tr : [];
      const xr = s.xr && Array.isArray(s.xr.l) ? s.xr.l : null;
      return {
        ...head(x),
        model_trades: tr.slice(-n).map((t) => ({ closed_at: iso(t.ts), pnl_usdt: r2(t.pnl, 4), fills: +t.n || 0, by_sl: !!t.sl, liquidation: !!t.liq })),
        exchange_closes: xr ? xr.slice(-n).map((c) => ({ at: iso(c.t), price: r2(c.px, 6), qty: r2(c.q, 6), pnl_usdt: r2(c.pnl, 4) })) : null,
      };
    },
    async get_risk_snapshot() {
      const { list, profile } = await data(), t = now(), lim = profile ? limitsOf(profile) : { ...DEF_LIMITS };
      const ex = list.filter((x) => x.row.status === "running" && x.c._srv && x.c._tn && +x.g.fut);
      const st = (x) => (x.st && x.st.state) || null;
      const busy = ex.reduce((a, x) => a + (st(x) && st(x).b && st(x).b.pos ? ladderNotional(x.g) : 0), 0);
      const day = ex.reduce((a, x) => a + realizedSince(x.g, st(x), dayStart(t)), 0);
      return {
        computed_by: "логіка Orbix (risk.js), як у сервері runner", at: iso(t), limits_usdt: lim, profile_read: !!profile,
        exposure_open_usdt: r2(busy, 0), realized_today_utc_usdt: r2(day),
        bots: ex.map((x) => {
          const blk = riskBlock({ limits: lim, self: { g: x.g, state: st(x) }, peers: ex.filter((y) => y !== x).map((y) => ({ g: y.g, state: st(y) })), now: t });
          return { ...head(x), full_ladder_notional_usdt: r2(ladderNotional(x.g), 0), has_position: !!(st(x) && st(x).b && st(x).b.pos), new_deals_blocked: blk ? { kind: blk.k, reason: blk.t } : null };
        }),
        note: "Лише боти, що торгують на демо-біржі (сервер + біржа). Якщо на одній парі кілька ботів, на біржі торгує лише один із них.",
      };
    },
    async get_backtest_results({ limit }) {
      const n = Math.min(20, Math.max(1, Math.round(+limit || 5)));
      const rows = await reader.backtests(n);
      const K = ["roi", "pnl", "dd", "ddp", "n", "wr", "pf", "liq", "dep", "per", "source"];
      return {
        backtests: (rows || []).map((b) => {
          const res = {}; for (const k of K) if (b.results && b.results[k] != null) res[k] = typeof b.results[k] === "number" ? r2(b.results[k], 4) : untrusted(b.results[k], 40);
          const g = b.config && typeof b.config === "object" ? b.config : {};
          return { pair: untrusted(b.symbol || g.pair, 20), timeframe: untrusted(b.timeframe, 10), from: iso(b.period_start), to: iso(b.period_end), status: untrusted(b.status, 20), created_at: iso(b.created_at), results: res, settings: g.pair ? settings(g) : null };
        }),
        legend: "roi — дохідність, pnl — прибуток USDT, dd/ddp — макс. просадка USDT/частка, n — угод, wr — частка прибуткових, pf — profit factor, liq — ліквідацій, dep — депозит, per — період",
      };
    },
    async search_orbix_docs({ query }) { return { results: searchDocs(String(query || "").slice(0, 200)) }; },
  };

  /** виклик інструмента: невідомі назви й помилки читання повертаються як { error }, а не падають */
  async function call(name, args) {
    if (!Object.prototype.hasOwnProperty.call(impl, name)) return { error: `Невідомий інструмент ${untrusted(name, 40)}. Доступні лише інструменти читання.` };
    try { return await impl[name](args && typeof args === "object" ? args : {}); }
    catch (e) { return { error: "Не вдалося прочитати дані Orbix: " + untrusted(e && e.message, 120) }; }
  }
  /** псевдонім бота за його id (для контексту «відкрито з картки бота») */
  async function aliasOf(id) { const { list } = await data(); const x = list.find((y) => y.id === id); return x ? x.alias : null; }
  const dataAt = () => (cache ? iso(cache.at) : null);
  return { defs: TOOL_DEFS, call, aliasOf, dataAt };
}
