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
  if (s) { b.pos = s.pos ?? null; b.tr = Array.isArray(s.tr) ? s.tr : []; b.cd = s.cd ?? 0; b.cum = s.cum ?? 0; b.nd = s.nd ?? b.tr.length; b.pe = s.pe ?? null; } // бот зі збереженим станом без лічильника (до оновлення): рахуємо наявні угоди
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
 * @param addCap   стеля вартості позиції (USDT, з плечем) для ручної докупівлі: 0 — без обмеження (ліміти ризику, runner/risk.js addCap)
 * @param cmd      ручна команда з інтерфейсу (config._cmd): {id, k: "close" | "add" | "resync" | "adopt", n?: маржа USDT, q?, px?: позиція з біржі, t: мс}.
 *                 "resync" (перезапуск угоди після помилки) моделі не змінює — handleBot відновлює ордери бота на біржі. Виконується один раз
 *                 (id запам'ятовується в state.mc) після закритих свічок, за останньою ціною; старша за CMD_TTL ігнорується.
 * Новий бот починає з поточного моменту: історія не «програється» заднім числом.
 */
export const CMD_TTL = 24 * 36e5;
export function processBot({ g, state, candles, funding = null, filters = null, now = Date.now(), keepTrades = 200, spans = null, entryOk = true, cmd = null, addCap = 0 }) {
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
    const pe0 = b.pe, n0 = b.tr.length, p0 = b.pos, o0 = p0 ? p0.n : 0, c0 = p0 ? p0.cost : 0, q0 = p0 ? p0.q : 0, h0 = p0 ? !!p0.t1 : false;
    let en = e[i];
    if (en && !p0 && !entryOk) { en = false; skipped++; } // ліміт ризику: нову угоду не відкривати
    b.step(Math.floor(c.t / W), c, en, undefined, e.x && e.x[i]);
    const v = b.eqv(c); pk = Math.max(pk, v); dd = Math.min(dd, v - pk);
    const p = b.pos;
    if (b.tr.length > n0) { const l = b.tr[b.tr.length - 1]; events.push({ kind: l.liq ? "liq" : l.sl ? "sl" : "close", pnl: l.pnl, price: l.f[l.f.length - 1].p, t: ct, ...(l.xs ? { xs: 1 } : {}) }); }
    // pt — час виставлення лімітного входу: той самий ідентифікатор ордера, що й у події pend
    else if (!p0 && p) events.push({ kind: "open", notional: p.cost, price: p.pt != null ? p.first : c.c, t: ct, ...(p.bf > 1 ? { bf: p.bf } : {}), ...(p.pt != null ? { pt: p.pt + W } : {}) }); // bf — множник реінвесту (драбина на біржі)
    else if (p0 && p && p.n > o0) events.push({ kind: "dca", notional: p.cost - c0, price: p.last, n: p.n, t: ct });
    // часткова фіксація TP (g.s1): модель зменшила позицію — цю частку треба закрити й на біржі
    else if (p0 && p && !h0 && p.t1 && q0 > 0) events.push({ kind: "part", share: 1 - p.q / q0, price: p.f[p.f.length - 1].p, t: ct });
    // лімітний вхід з відступом (g.fo): скасовано (ціна пішла / минув час) і / або виставлено новий
    if (pe0 && !p && (!b.pe || b.pe.t !== pe0.t)) events.push({ kind: "pcan", t: ct, pt: pe0.t + W });
    if (b.pe && (!pe0 || pe0.t !== b.pe.t)) events.push({ kind: "pend", price: b.pe.px, notional: b.pe.q * b.pe.px, t: b.pe.t + W, ...(b.pe.bf > 1 ? { bf: b.pe.bf } : {}) });
  }
  // ручна команда: після закритих свічок, за останньою ціною (свічка, що формується, теж дає поточну ціну)
  let mc = state?.mc ?? null, manual = null;
  if (cmd && typeof cmd.id === "string" && cmd.id.length <= 40 && cmd.id !== mc && (cmd.k === "close" || cmd.k === "add" || cmd.k === "resync" || cmd.k === "adopt")
    && Number.isFinite(cmd.t) && cmd.t <= now + 6e4 && now - cmd.t <= CMD_TTL) {
    mc = cmd.id;
    if (cmd.k === "resync") manual = { id: cmd.id, k: cmd.k, ok: true, why: null }; // перезапуск угоди: модель не змінюється, біржею займається handleBot
    else if (cmd.k === "adopt") { // позиція з біржі (кількість і ціна — зі знімка сервера state.xs, який показала картка)
      const q = +cmd.q, px = +cmd.px, s = q * px;
      const why = b.pos ? "бот уже веде угоду" : b.pe ? "бот чекає лімітного входу" : !(q > 0 && px > 0 && s <= 1e7) ? "некоректні дані позиції"
        : addCap > 0 && s > addCap + 1e-9 ? "перевищить ліміт ризику (позиція не може бути більшою за " + Math.round(addCap) + " USDT)" : null;
      const ev = why ? null : b.adopt(px, q, now);
      if (ev) events.push(ev);
      manual = { id: cmd.id, k: cmd.k, ok: !!ev, why: ev ? null : why || "некоректні дані позиції" };
    }
    else {
      const px = candles.length ? +candles[candles.length - 1].c : 0, n = +cmd.n;
      const over = cmd.k === "add" && addCap > 0 && b.pos && b.pos.cost + n * (g.lev || 1) > addCap + 1e-9;
      const ev = (cmd.k === "add" && !(n > 0 && n <= 1e6)) || over ? null : b.manual(cmd.k, px, now, cmd.k === "add" ? n : 0);
      if (ev) events.push(ev);
      manual = { id: cmd.id, k: cmd.k, ok: !!ev, why: ev ? null : !b.pos ? "позиції немає" : over ? "перевищить ліміт ризику (позиція не може бути більшою за " + Math.round(addCap) + " USDT)" : "сума некоректна або ордер замалий для біржі" };
    }
  }
  const tr = b.tr.slice(-keepTrades);
  return { manual, state: { b: { pos: b.pos, tr, cd: b.cd, cum: b.cum, nd: b.nd, ...(b.pe ? { pe: b.pe } : {}) }, ...(mc ? { mc } : {}), pk, dd, lt, equity: A.length ? b.eqv(A[A.length - 1]) : b.cum }, events, skipped };
}

/* текст події для журналу й Telegram */
export function eventText(ev, g) {
  const pair = g.pair + (g.d < 0 ? " Short" : " Long");
  const f = (x) => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(2);
  if (ev.kind === "open") return `Orbix (сервер): ${pair} — відкрито позицію по ${ev.price}`;
  if (ev.kind === "dca") return `Orbix (сервер): ${pair} — докупівля №${ev.n} по ${ev.price}`;
  if (ev.kind === "part") return `Orbix (сервер): ${pair} — часткова фіксація TP: закрито ${Math.round(ev.share * 100)} % позиції по ${ev.price}`;
  if (ev.kind === "close") return `Orbix (сервер): ${pair} — угоду закрито${ev.mn ? " вручну за ринком по " + ev.price : ev.xs ? " за сигналом виходу по " + ev.price : ""}, PnL ${f(ev.pnl)} USDT`;
  if (ev.kind === "adopt") return `Orbix (сервер): ${pair} — бот підхопив позицію з біржі: ${+(ev.notional / ev.price).toPrecision(6)} за ${ev.price}`;
  if (ev.kind === "pend") return `Orbix (сервер): ${pair} — сигнал входу: лімітний ордер по ${ev.price}, чекає на ціну`;
  if (ev.kind === "pcan") return `Orbix (сервер): ${pair} — лімітний вхід скасовано (ціна пішла або минув час), бот чекає новий сигнал`;
  if (ev.kind === "madd") return `Orbix (сервер): ${pair} — позапланова докупівля на ${ev.notional.toFixed(2)} USDT по ${ev.price}`;
  return `Orbix (сервер): ${pair} — ${ev.kind === "liq" ? "ліквідація" : "Stop-Loss"}, PnL ${f(ev.pnl)} USDT`;
}
