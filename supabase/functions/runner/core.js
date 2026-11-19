// Ядро серверного запуску бота: чиста функція без мережі й бази (тестується в Node: tests/runner-core.test.mjs).
// Відновлює стан бота, проганяє закриті свічки після останньої обробленої (lt) і повертає новий стан і події.
import { Bot, DEF, entry, normG, tfMs } from "./engine.js";

/* інтервали бірж для таймфреймів бота (години → рядок API) */
export const INTERVAL = { 1: "1h", 4: "4h", 12: "12h", 24: "1d", 168: "1w" };

/* налаштування бота з конфігу хмари (службові поля _t0, _sp, _tn, _srv, _ex прибираються) */
export function botConfig(config) {
  const g = {};
  for (const [k, v] of Object.entries(config || {})) if (!k.startsWith("_")) g[k] = v;
  return normG({ ...DEF, ...g });
}

export function restoreBot(g, state, funding = null, filters = null) {
  const b = new Bot(g, funding, filters);
  // глибока копія: обробка не змінює переданий стан
  const s = state && state.b ? JSON.parse(JSON.stringify(state.b)) : null;
  if (s) { b.pos = s.pos ?? null; b.tr = Array.isArray(s.tr) ? s.tr : []; b.cd = s.cd ?? 0; b.cum = s.cum ?? 0; b.nd = s.nd ?? 0; }
  return b;
}

/**
 * @param g        налаштування бота (botConfig)
 * @param state    збережений стан {b:{pos,tr,cd,cum,nd}, pk, dd, lt} або null для нового бота (nd — закритих угод, для g.maxd)
 * @param candles  свічки таймфрейму бота в порядку зростання {t,o,h,l,c,v,ml?,mh?} (t — час відкриття, мс)
 * @param now      поточний час, мс (обробляються лише закриті свічки)
 * @param spans    інтервали роботи бота [[від, до|null], …] (config._sp): свічки, що закрилися під час паузи,
 *                 пропускаються — як і в браузері, після зняття з паузи нічого не «дограється» заднім числом
 * @param entryOk  false — нових угод не відкривати (ліміт ризику, runner/risk.js): сигнал входу пропускається й рахується
 *                 в skipped, а позиція, що вже є, обробляється як завжди (докупівлі, TP, SL, трейлінг)
 * Новий бот починає з поточного моменту: історія не «програється» заднім числом.
 */
export function processBot({ g, state, candles, funding = null, filters = null, now = Date.now(), keepTrades = 200, spans = null, entryOk = true }) {
  const act = (t) => !Array.isArray(spans) || !spans.length || spans.some(([a, b]) => t > a && (b == null || t <= b));
  const W = tfMs(g.tf || 1), A = candles.filter((c) => c.t + W <= now);
  const b = restoreBot(g, state, funding, filters);
  let lt = state && Number.isFinite(state.lt) ? state.lt : (A.length ? A[A.length - 1].t + W : now);
  let pk = state?.pk ?? 0, dd = state?.dd ?? 0;
  const events = [], e = A.length ? entry(A, g) : [];
  let skipped = 0;
  for (let i = 0; i < A.length; i++) {
    const c = A[i], ct = c.t + W;
    if (ct <= lt) continue;
    lt = ct;
    if (!act(ct)) continue;
    const n0 = b.tr.length, p0 = b.pos, o0 = p0 ? p0.n : 0, c0 = p0 ? p0.cost : 0, q0 = p0 ? p0.q : 0, h0 = p0 ? !!p0.t1 : false;
    let en = e[i];
    if (en && !p0 && !entryOk) { en = false; skipped++; } // ліміт ризику: нову угоду не відкривати
    b.step(Math.floor(c.t / W), c, en);
    const v = b.eqv(c); pk = Math.max(pk, v); dd = Math.min(dd, v - pk);
    const p = b.pos;
    if (b.tr.length > n0) { const l = b.tr[b.tr.length - 1]; events.push({ kind: l.liq ? "liq" : l.sl ? "sl" : "close", pnl: l.pnl, price: l.f[l.f.length - 1].p, t: ct }); }
    else if (!p0 && p) events.push({ kind: "open", notional: p.cost, price: c.c, t: ct, ...(p.bf > 1 ? { bf: p.bf } : {}) }); // bf — множник реінвесту (драбина на біржі)
    else if (p0 && p && p.n > o0) events.push({ kind: "dca", notional: p.cost - c0, price: p.last, n: p.n, t: ct });
    // часткова фіксація TP (g.s1): модель зменшила позицію — цю частку треба закрити й на біржі
    else if (p0 && p && !h0 && p.t1 && q0 > 0) events.push({ kind: "part", share: 1 - p.q / q0, price: p.f[p.f.length - 1].p, t: ct });
  }
  const tr = b.tr.slice(-keepTrades);
  return { state: { b: { pos: b.pos, tr, cd: b.cd, cum: b.cum, nd: b.nd }, pk, dd, lt, equity: A.length ? b.eqv(A[A.length - 1]) : b.cum }, events, skipped };
}

/* текст події для журналу й Telegram */
export function eventText(ev, g) {
  const pair = g.pair + (g.d < 0 ? " Short" : " Long");
  const f = (x) => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(2);
  if (ev.kind === "open") return `Orbix (сервер): ${pair} — відкрито позицію по ${ev.price}`;
  if (ev.kind === "dca") return `Orbix (сервер): ${pair} — докупівля №${ev.n} по ${ev.price}`;
  if (ev.kind === "part") return `Orbix (сервер): ${pair} — часткова фіксація TP: закрито ${Math.round(ev.share * 100)} % позиції по ${ev.price}`;
  if (ev.kind === "close") return `Orbix (сервер): ${pair} — угоду закрито, PnL ${f(ev.pnl)} USDT`;
  return `Orbix (сервер): ${pair} — ${ev.kind === "liq" ? "ліквідація" : "Stop-Loss"}, PnL ${f(ev.pnl)} USDT`;
}
