// Виконання угод серверного бота на демо-біржі (Bybit Demo / Binance Testnet).
// Чиста логіка без мережі й бази: біржа, збереження стану, журнал і сповіщення передаються ззовні
// (тестується в Node: tests/mirror.test.mjs).
//
// Bybit Demo («рідний» режим): після входу на біржі одразу стоять лімітні ордери докупівлі (DCA),
// а TP і SL — на самій позиції; для ботів із трейлінгом замість TP ставиться трейлінг-стоп біржі
// з активацією на рівні TP. Біржа виконує їх миттєво, не чекаючи закриття свічки; сервер щоразу
// звіряє захист із фактичною середньою ціною (після докупівлі він перевиставляється), а якщо ціна
// вже пройшла TP або SL — закриває позицію ринком.
// Binance Testnet: угоди дублюються ринковими ордерами з сервера (TP/SL — за закриттям свічки).
//
// Захист від повторних ордерів: кожен ордер має незмінний ідентифікатор (orderLinkId / newClientOrderId),
// перед відправкою перевіряється, чи такий ордер уже є; дії спершу зберігаються в стані бота
// (з перевіркою, що інший запуск не змінив його), і лише потім ідуть на біржу.
import { lv, ocOn, rnd } from "./engine.js";
import { eventText } from "./core.js";
import { tfMs } from "./engine.js";
import { floorStep } from "./sign.js";
import { dayStart } from "./risk.js";

export const MAX_TRIES = 5;
/* вхід або докупівля за сигналом, старшим за цей час, на біржу не надсилається (сервер простоював) */
export const STALE_MS = 30 * 60e3;
const hex = (id) => String(id).replace(/-/g, "").slice(0, 12);
/* лімітні ордери бота на парі (за префіксом ідентифікатора); без botId — будь-які ордери Orbix ("ox…"), але ніколи не ручні */
const mineOf = async (ex, symbol, botId) => (await ex.openOrders(symbol)).filter((o) => String(o.link || "").startsWith(botId ? "ox" + hex(botId) : "ox"));
/* зняти лише ордери цього бота — ручні ордери користувача на тій самій парі не чіпаються (замість cancelAll) */
export async function cancelMine(ex, symbol, botId) {
  const mine = await mineOf(ex, symbol, botId);
  for (const o of mine) await ex.cancel(symbol, o.link);
  return mine.length;
}
/* ідентифікатор ордера: незмінний для тієї самої події бота, ≤36 символів, лише [A-Za-z0-9-] */
export const linkBase = (botId, t) => `ox${hex(botId)}-${Math.floor(t / 1000).toString(36)}-`;
export const linkId = (botId, t, kind) => linkBase(botId, t) + kind;

/* події рушія → дії на біржі */
export function actionsFor(events, botId, native, g = null) {
  const out = [], mk = !!(g && ocOn(g)); // бот з умовами докупівлі: докупівлі на біржі — ринковими ордерами й у рідному режимі
  for (const ev of events) {
    if (ev.kind === "open") out.push({ id: linkId(botId, ev.t, "o"), kind: "open", t: ev.t, notional: ev.notional, price: ev.price, ...(ev.bf > 1 ? { bf: ev.bf } : {}), tries: 0 });
    else if (ev.kind === "dca") { if (!native || mk) out.push({ id: linkId(botId, ev.t, "a" + ev.n), kind: "dca", t: ev.t, notional: ev.notional, tries: 0 }); }
    else if (ev.kind === "bz") out.push({ id: linkId(botId, ev.t, "z"), kind: "bz", t: ev.t, share: ev.share, tries: 0 });
    else if (ev.kind === "part") out.push({ id: linkId(botId, ev.t, "p"), kind: "part", t: ev.t, share: ev.share, tries: 0 });
    else out.push({ id: linkId(botId, ev.t, "c"), kind: "close", t: ev.t, tries: 0 });
  }
  return out;
}

/* ціни й кількості докупівель від ціни входу моделі — той самий розрахунок, що й у рушії (lv; на сервері рушій працює
   без правил біржі, тож рівні не округлені). Ціна лімітного ордера округлюється до кроку ціни в бік виконання
   (Long — вгору, Short — вниз): ордер виконується щоразу, коли модель зараховує докупівлю. */
export function ladder(g, px, F) {
  // бот з умовами докупівлі: лімітних ордерів на біржі немає — докупівлі ринковими, коли модель їх зарахує (рівні наступних
  // ордерів залежать від фактичної ціни ордера з умовами, тож заздалегідь їх не виставити)
  if (ocOn(g)) return [];
  const R = lv(g, px, F ? { step: F.step, minQty: F.minQty, minN: F.minN } : null);
  return R.L.slice(1).map((x, i) => ({ k: i + 1, price: F && F.tick ? rnd(x.p, F.tick, g.d > 0 ? "ceil" : "floor") : x.p, qty: F && F.step ? floorStep(x.s / x.p, F.step) : x.s / x.p })).filter((x) => x.qty > 0);
}

/* Захист позиції від середньої ціни; округлення до кроку ціни в гірший бік, як у рушії.
   tp — тейк-профіт; sl — стоп-лосс; з трейлінгом замість TP: ap — ціна активації (рівень TP),
   ts — відстань трейлінгу в ціні (частка g.trail від рівня активації).
   З частковою фіксацією TP веде сервер (на біржі лише SL); mp — позиція моделі: після TP1 з беззбитком (g.be)
   стоп переноситься туди ж, куди й у рушії (mp.be). */
export function protect(g, avg, F, mp = null, stopAt = 0) {
  const d = g.d, tk = F && F.tick, part = g.s1 > 0, has = g.tp > 0 && !part;
  const lvl = has ? rnd(avg * (1 + d * g.tp), tk, d > 0 ? "ceil" : "floor") : 0;
  const sl = mp && mp.t1 && mp.be > 0 ? rnd(mp.be, tk, d > 0 ? "floor" : "ceil")
    : g.sl > 0 ? rnd(stopAt > 0 ? stopAt : avg * (1 - d * g.sl), tk, d > 0 ? "floor" : "ceil") : 0;
  if (has && g.trail > 0) return { tp: 0, sl, ap: lvl, ts: Math.max(rnd(lvl * g.trail, tk, "ceil"), tk || 0) };
  return { tp: lvl, sl, ap: 0, ts: 0 };
}
/* Стоп, на якому реально зупиниться модель. SL рахується від середньої ціни, а середня зсувається з кожною
   докупівлею: модель докуповує, поки наступний рівень лежить вище за поточний SL (і ліквідацію), і лише потім
   виходить за стопом. Лімітні докупівлі бота стоять на біржі й виконуються всередині свічки, тож ціна, що йде до
   стопу, неминуче проходить їх раніше. Тому на біржі одразу ставиться кінцевий стоп — після останньої досяжної
   докупівлі (rest — лімітні ордери бота, що стоять зараз). Інакше стоп біржі, який сервер оновлює раз на 5 хв,
   при різкому русі закрив би позицію раніше, ніж модель, і останні докупівлі не встигли б. */
export function slStop(g, { q, avg }, rest = []) {
  if (!(g.sl > 0) || !(q > 0) || !(avg > 0)) return 0;
  const d = g.d, L = +g.fut ? g.lev || 1 : 1;
  let cost = q * avg;
  const R = rest.filter((o) => o.price > 0 && o.qty > 0).sort((a, b) => (d > 0 ? b.price - a.price : a.price - b.price));
  for (const o of R) {
    const a = cost / q, slp = a * (1 - d * g.sl), lqp = L > 1 ? a * (1 - d * Math.max(1 / L - 0.005, 0)) : 0;
    const lim = lqp && (d > 0 ? lqp > slp : lqp < slp) ? lqp : slp;
    if (d > 0 ? o.price <= lim : o.price >= lim) break; // цей рівень за стопом — модель вийде раніше
    q += o.qty; cost += o.qty * o.price;
  }
  return (cost / q) * (1 - d * g.sl);
}
const lev = (g) => Math.min(20, Math.max(1, Math.round(g.lev || 1)));
/* Часткове виставлення (g.live > 0): на біржі одночасно стоять лише live найближчих лімітних докупівель.
   Рівні: 1…orders−1; модель уже зробила рівні < mp.n, тож мають стояти рівні до mp.n − 1 + live.
   fl.lt — найвищий рівень, уже виставлений на біржу в цій угоді (рівні вище ще ніколи не ставились). */
export const liveN = (g) => { const n = Math.round(+g.live || 0); return n > 0 ? n : Infinity; };
const liveTop = (g, n) => Math.min((g.orders || 1) - 1, n - 1 + liveN(g));
const near = (a, b, tick) => Math.abs((+a || 0) - (+b || 0)) <= (tick || 0) / 2 + 1e-12;

/* ордер з ідентифікатором: якщо такий уже є на біржі — повторно не надсилається.
   Біржа не відповіла на перевірку — статус невідомий: ордер НЕ надсилається, помилка йде нагору, дія лишається
   в черзі й повториться наступного запуску (null від byLink означає лише «біржа підтвердила, що ордера немає»).
   Відповідь на сам ордер загубилась, а перевірка теж не вдалася — так само: наступний запуск спершу знайде ордер. */
async function once(ex, symbol, id, place) {
  const had = await ex.byLink(symbol, id);
  if (had) return { ...had, existed: true };
  try { return await place(); }
  catch (e) {
    let o;
    try { o = await ex.byLink(symbol, id); } catch (_e) { throw e; }
    if (o) return { ...o, existed: true };
    throw e;
  }
}
async function marketNotional(ex, symbol, side, notional, id) {
  const F = await ex.filt(symbol);
  if (!F) throw new Error("пари немає на демо-біржі");
  const px = await ex.mark(symbol), qty = floorStep(notional / px, F.step);
  if (!(qty > 0) || qty < F.minQty || qty * px < F.minN) throw new Error(`ордер замалий: мінімум ${Math.max(F.minN, F.minQty * px).toFixed(2)} USDT`);
  const o = await ex.market(symbol, side, qty, false, id);
  return o.price > 0 ? o : { ...o, price: px, approx: true };
}

const protText = (w) => `${w.tp ? ` · TP ${w.tp}` : ""}${w.ts ? ` · трейлінг ${w.ts} від ${w.ap}` : ""}${w.sl ? ` · SL ${w.sl}` : ""}`;
/* Привести захист позиції на біржі до потрібного (рідний режим). Повертає текст для журналу або null, якщо змін немає.
   fl — прапорці бота, що зберігаються в стані (nots: біржа не прийняла трейлінг — лишаємо SL, TP веде сервер). */
export async function guard(ex, { g, symbol, botId, fl = {}, mp = null }, p, F) {
  const d = g.d;
  // кінцевий стоп з урахуванням лімітних докупівель бота, що стоять на біржі (крім беззбитку після TP1)
  let stopAt = 0;
  if (g.sl > 0 && !(mp && mp.t1 && mp.be > 0) && typeof ex.openOrders === "function") {
    const rest = (await mineOf(ex, symbol, botId)).filter((o) => !o.reduceOnly && (d > 0 ? /^buy$/i : /^sell$/i).test(String(o.side))).map((o) => ({ price: +o.price, qty: +o.qty }));
    stopAt = slStop(g, { q: Math.abs(+p.amt), avg: +p.entry }, rest);
  }
  const want = protect(g, p.entry, F, mp, stopAt), m = +p.mark || 0, lvl = want.tp || want.ap;
  const closeNow = async (why) => {
    await cancelMine(ex, symbol, botId);
    const o = await ex.market(symbol, p.amt > 0 ? "SELL" : "BUY", Math.abs(p.amt), true);
    return `Bybit Demo: ціна вже пройшла ${why} — позицію закрито ринком${o.price > 0 ? ` за ${o.price}` : ""}`;
  };
  if (m > 0 && want.sl && (d > 0 ? m <= want.sl : m >= want.sl)) return { msg: await closeNow(`SL ${want.sl}`), closed: true };
  if (m > 0 && want.tp && (d > 0 ? m >= want.tp : m <= want.tp)) return { msg: await closeNow(`TP ${want.tp}`), closed: true };
  if (fl.nots) { want.ts = 0; want.ap = 0; }
  if (want.ts && m > 0 && (d > 0 ? m >= want.ap : m <= want.ap)) want.ap = 0; // рівень активації вже пройдено — трейлінг діє одразу
  const tk = F && F.tick;
  // трейлінг біржі вже активний і підтягнув стоп у зону прибутку — не чіпаємо, щоб не відкинути його назад
  if (want.ts && near(p.ts, want.ts, tk) && p.sl > 0 && (d > 0 ? p.sl > p.entry : p.sl < p.entry)) return null;
  if (near(p.tp, want.tp, tk) && near(p.sl, want.sl, tk) && near(p.ts, want.ts, tk)) return null;
  try { await ex.tradingStop(symbol, want); }
  catch (e) {
    if (!want.ts) throw e;
    await ex.tradingStop(symbol, { tp: 0, sl: want.sl, ts: 0, ap: 0 });
    fl.nots = 1;
    return { msg: `Bybit Demo: біржа не прийняла трейлінг (${e.message}) — на біржі лише SL ${want.sl}, TP веде сервер` };
  }
  return { msg: `Bybit Demo: захист від середньої ${p.entry}${protText(want)}` };
}

/* ціна виконання для журналу: біржа не завжди встигає повернути середню ціну ринкового ордера — тоді приблизно за mark price */
const pxOf = (o, p) => (o && o.price > 0 ? o.price : p && p.mark > 0 ? "≈" + p.mark : "ринковою ціною");
/* одна дія на біржі; повертає текст для журналу */
export async function execute(ex, a, { g, symbol, native, botId, fl = {} }) {
  const side = g.d > 0 ? "BUY" : "SELL", name = native ? "Bybit Demo" : "Binance Testnet";
  if (a.kind === "open") {
    let o = await ex.byLink(symbol, a.id);
    if (!o) {
      if ((await ex.positions(symbol))[0]) return `${name}: на біржі вже є позиція ${symbol} — вхід не дубльовано`;
      await ex.leverage(symbol, lev(g));
      o = await once(ex, symbol, a.id, () => marketNotional(ex, symbol, side, a.notional, a.id));
    }
    let msg = `${name}: вхід ${o.qty} за ${o.approx ? "≈" : ""}${o.price}`;
    if (!native) return msg;
    const F = await ex.filt(symbol), p = (await ex.positions(symbol))[0];
    if (!p) return msg + " (позиції вже немає)";
    const base = a.id.slice(0, -1);
    // драбина — від ціни входу моделі (закриття свічки), а не від фактичної ціни на біржі: інакше прослизання входу
    // зсуває всі рівні, і біржа докуповує не там, де модель (дії старих версій без ціни — від ціни на біржі)
    const e0 = a.price > 0 ? a.price : p.entry;
    let n = 0, lt = 0, gap = false;
    const top = liveTop(g, 1);
    const gl = a.bf > 1 ? { ...g, base: g.base * a.bf } : g; // реінвест: драбина у тому ж масштабі, що й угода моделі
    for (const r of ladder(gl, e0, F)) {
      if (r.k > top) break;
      try { await once(ex, symbol, base + "d" + r.k, () => ex.limit(symbol, side, r.qty, r.price, base + "d" + r.k)); n++; if (!gap) lt = r.k; }
      catch (e) { gap = true; msg += ` · докупівля ${r.k}: ${e.message}`; }
    }
    delete fl.nots; delete fl.rg; delete fl.lt;
    if (liveN(g) < Infinity) fl.lt = lt; // наступні рівні докладе topUp, щойно модель зарахує докупівлю
    fl.lb = base; fl.e0 = e0; fl.ex = p.entry; // e0 — база драбини (для відновлення після паузи), ex — ціна входу на біржі
    const gd = await guard(ex, { g, symbol, botId, fl }, p, F);
    return msg + (ocOn(g) ? " · докупівлі — ринковими ордерами, коли виконаються умови" : ` · на біржі: ${n} лімітн. докупівель${liveN(g) < Infinity && top < (g.orders || 1) - 1 ? ` (з ${(g.orders || 1) - 1}; решта — по одній після виконання)` : ""}`) + `${gd ? " · " + gd.msg.replace("Bybit Demo: ", "") : ""}`;
  }
  if (a.kind === "dca") {
    const o = await once(ex, symbol, a.id, () => marketNotional(ex, symbol, side, a.notional, a.id));
    return `${name}: докупівля ${o.qty} за ${o.approx ? "≈" : ""}${o.price}`;
  }
  if (a.kind === "bz") {
    // закриття в беззбиток: модель закрила останні ордери — закрити ту саму частку на біржі (reduceOnly); на Bybit закриті рівні
    // виставляються знову (restore): виконані ордери попередніх циклів (покоління < fl.zg) більше не блокують рівень
    const had = await ex.byLink(symbol, a.id);
    if (had) return `${name}: закрито в беззбиток ${had.qty} за ${had.price}`;
    const p = (await ex.positions(symbol))[0];
    if (!p) return `${name}: позиції вже немає — закриття в беззбиток пропущено`;
    const F = await ex.filt(symbol), q = floorStep(Math.abs(p.amt) * a.share, F && F.step);
    if (!(q > 0) || (F && q < F.minQty)) return `${name}: частка ${Math.round(a.share * 100)} % замала для біржі — закриття в беззбиток пропущено`;
    const o = await once(ex, symbol, a.id, () => ex.market(symbol, p.amt > 0 ? "SELL" : "BUY", q, true, a.id));
    if (native) { fl.zg = (fl.rg || 0) + 1; fl.rs = 1; }
    return `${name}: закрито в беззбиток ${o.qty} за ${pxOf(o, p)}${native ? " · закриті рівні докупівель буде виставлено знову" : ""}`;
  }
  if (a.kind === "part") {
    // часткова фіксація TP: модель закрила частку позиції — закрити ту саму частку на біржі (reduceOnly)
    const had = await ex.byLink(symbol, a.id);
    if (had) return `${name}: частково зафіксовано ${had.qty} за ${had.price}`;
    const p = (await ex.positions(symbol))[0];
    if (!p) return `${name}: позиції вже немає — часткову фіксацію пропущено`;
    if (native) await cancelMine(ex, symbol, botId); // після TP1 модель більше не докуповує
    const F = await ex.filt(symbol), q = floorStep(Math.abs(p.amt) * a.share, F && F.step);
    if (!(q > 0) || (F && q < F.minQty)) return `${name}: частка ${Math.round(a.share * 100)} % замала для біржі — часткову фіксацію пропущено`;
    const o = await once(ex, symbol, a.id, () => ex.market(symbol, p.amt > 0 ? "SELL" : "BUY", q, true, a.id));
    return `${name}: частково зафіксовано ${o.qty} за ${pxOf(o, p)}${native ? " · лімітні докупівлі знято" : ""}`;
  }
  // ручні дії з кнопок картки (runner/commands.js): повертають { msg, px }
  if (a.kind === "mcancel") {
    const n = native ? await cancelMine(ex, symbol, botId) : 0;
    return { msg: `${name}: угоду скасовано вручну — знято ${n} лімітн. ордер(ів) бота, позиція лишилась на біржі`, px: null };
  }
  if (a.kind === "madd") { // «Докупити зараз»: ринковий ордер; лімітна драбина бота лишається як є
    const p = (await ex.positions(symbol))[0];
    if (!p || Math.sign(p.amt) !== Math.sign(g.d)) return { msg: `${name}: позиції бота на біржі немає — докупівлю пропущено`, px: null, qty: 0 };
    let o;
    try { o = await once(ex, symbol, a.id, () => marketNotional(ex, symbol, g.d > 0 ? "BUY" : "SELL", a.notional, a.id)); }
    catch (e) { if (/^ордер замалий/.test(e.message)) return { msg: `${name}: докупівлю не виконано — ${e.message}`, px: null, qty: 0 }; throw e; }
    const px = o.price > 0 ? o.price : a.price;
    return { msg: `${name}: докуплено вручну ${o.qty} за ${o.approx ? "≈" : ""}${px}`, px, qty: +o.qty || 0 };
  }
  if (a.kind === "mclose") {
    if (native) await cancelMine(ex, symbol, botId);
    const had = await ex.byLink(symbol, a.id);
    if (had) return { msg: `${name}: угоду закрито вручну за ринком за ${had.price}`, px: had.price > 0 ? had.price : null };
    const p = (await ex.positions(symbol))[0];
    if (!p || Math.sign(p.amt) !== Math.sign(g.d)) return { msg: `${name}: позиції бота на біржі вже немає — угоду моделі закрито за поточною ціною`, px: null };
    const o = await once(ex, symbol, a.id, () => ex.market(symbol, p.amt > 0 ? "SELL" : "BUY", Math.abs(p.amt), true, a.id));
    return { msg: `${name}: угоду закрито вручну за ринком за ${pxOf(o, p)}`, px: o.price > 0 ? o.price : p.mark > 0 ? p.mark : null };
  }
  // close
  if (native) await cancelMine(ex, symbol, botId);
  const done = await ex.byLink(symbol, a.id);
  if (done) return `${name}: позицію закрито за ${done.price}`;
  const p = (await ex.positions(symbol))[0];
  if (!p) return `${name}: позиції вже немає${native ? " (закрито біржею за TP/SL)" : ""}`;
  const o = await once(ex, symbol, a.id, () => ex.market(symbol, p.amt > 0 ? "SELL" : "BUY", Math.abs(p.amt), true, a.id));
  return `${name}: позицію закрито за ${pxOf(o, p)}`;
}

/* щоразу (рідний режим): захист відповідає фактичній середній ціні; без позиції — знімаються залишки ордерів бота */
export async function sync(ex, { g, symbol, botId, fl = {}, out = {}, mp = null }) {
  const p = (await ex.positions(symbol))[0];
  out.pos = p || null; out.seen = !!p; // що побачили на біржі — для звірки з моделлю (reconcile)
  if (p) {
    const r = await guard(ex, { g, symbol, botId, fl, mp }, p, await ex.filt(symbol));
    if (r && r.closed) out.pos = null;
    else if (r) out.pos = (await ex.positions(symbol))[0] || null; // захист змінено — для моніторингу беремо свіжий стан
    out.ord = out.pos ? (await mineOf(ex, symbol, botId)).length : 0;
    return r ? r.msg : null;
  }
  out.ord = 0;
  const n = await cancelMine(ex, symbol, botId);
  if (!n) return null;
  return `Bybit Demo: позиції немає (закрито біржею за TP/SL) — знято ${n} ордер(ів) бота`;
}

/* Знімок стану біржі для моніторингу (state.xs): позиція, її захист і кількість лімітних ордерів бота; null — порожньо */
export function snapshot(out) {
  const p = out && out.pos;
  if (!p) return null;
  return { amt: p.amt, entry: p.entry, sl: +p.sl || 0, tp: +p.tp || 0, ts: +p.ts || 0, ord: out.ord || 0 };
}

/* Звірка моделі бота з позицією на біржі. mp — позиція рушія ({q, first, t1, …}) або null; xp — позиція біржі ({amt, …}) або null.
   Повертає null, якщо збігаються, або { k, t }: nopos — у моделі є, на біржі немає; orphan — на біржі є, у моделі немає;
   size — напрям інший або кількість відрізняється більш ніж на 25 %.
   Більший обсяг на біржі — норма, поки він не перевищує всю драбину докупівель: лімітна докупівля на біржі
   виконується всередині свічки, а модель зараховує її лише після закриття свічки. */
export const MIS_TOL = 0.25;
const side = (x) => (x > 0 ? "Long" : "Short");
export function reconcile(mp, xp, g) {
  if (mp && !xp) return { k: "nopos", t: `модель бота веде позицію ${g.pair}, а на Bybit Demo її немає` };
  if (!mp && xp) return { k: "orphan", t: `на Bybit Demo відкрита позиція ${g.pair} ${side(xp.amt)} (${Math.abs(xp.amt)})${Math.sign(xp.amt) !== Math.sign(g.d) ? " — проти напрямку бота" : ""}, а модель бота позиції не має` };
  if (!mp || !xp) return null;
  if (Math.sign(xp.amt) !== Math.sign(g.d)) return { k: "size", t: `напрям позиції на Bybit Demo (${side(xp.amt)}) не збігається з ботом (${side(g.d)})` };
  const q = Math.abs(xp.amt), m = +mp.q || 0;
  if (!(m > 0)) return null;
  let hi = m * (1 + MIS_TOL);
  if (!mp.t1 && mp.first > 0) { const L = lv(g, mp.first, null).L; hi = Math.max(hi, L.reduce((a, x) => a + x.s / x.p, 0) * (1 + MIS_TOL)); }
  if (q < m * (1 - MIS_TOL) || q > hi) return { k: "size", t: `обсяг на Bybit Demo ${q}, у моделі бота ${+m.toPrecision(6)} (різниця ${Math.round(Math.abs(q - m) / m * 100)} %)` };
  return null;
}
/* реакція на звірку: розбіжність, що тримається 2 запуски поспіль, — один запис у журнал і одне сповіщення
   (fl.mis.on = 1 — картка бота показує попередження); позицію, яку закрила сама біржа (TP/SL/трейлінг),
   модель закриє після своєї свічки — це не тривога (k: "xc").
   fl.tid — угода моделі, до якої належать fl.had (біржа мала позицію за цієї угоди) і fl.xc (біржа її вже закрила). */
export const MIS_RUNS = 2;
export const RUN_GAP = 12 * 60e3; // запуски йдуть кожні 5 хв; більший проміжок — лічильник починається знову
export const clearMis = (fl) => { delete fl.mis; delete fl.had; delete fl.xc; delete fl.tid; };
/* «Біржа головна»: якщо біржа вже закрила позицію бота (TP/SL/трейлінг, fl.xc), модель не чекає власного виходу за свічками,
   а закриває свою угоду за фактичною ціною закриття на біржі (state.xr.l[].px). Тоді картка, статистика й журнал показують те,
   що сталося на біржі. Закриття шукається серед записів біржі після входу в угоду (вхід на біржі — закриття свічки входу). */
export function exchangeExit(xr, mp, g) {
  const t0 = mp && mp.f && mp.f[0] && mp.f[0].t;
  if (!xr || !Array.isArray(xr.l) || !(t0 > 0)) return null;
  const from = t0 + tfMs(g.tf || 1);
  const L = xr.l.filter((x) => x.t > from && x.px > 0).sort((a, b) => a.t - b.t);
  return L.length ? L[L.length - 1] : null;
}
/* закрити позицію моделі за ціною px у момент t: той самий розрахунок, що й вихід рушія (v. Bot.step), зі збереженням угоди в b.tr */
export function closeByExchange(b, g, { px, t, tag = "xc" }) {
  const p = b.pos, d = p.d || g.d, ft = g.ftk != null ? g.ftk : g.fee, v = p.q * px;
  const pnl = p.real + d * (v - p.cost) - ft * v, W = tfMs(g.tf || 1), i = Math.floor(t / W);
  const tr = [...b.tr, { i, ts: t, pnl, n: p.n, ...(p.d ? { d: p.d } : {}), liq: false, sl: false, [tag]: 1, fd: p.fd, f: p.f.concat({ t, p: px, k: "x" }) }];
  return { ...b, pos: null, tr, cum: b.cum + pnl, cd: i + g.cd + 1 };
}
/* ручна докупівля в моделі: кількість q за ціною px (тейкер), рівні драбини не змінюються */
export function addModel(b, g, { px, q, t }) {
  const p = b.pos, ft = g.ftk != null ? g.ftk : g.fee, s = q * px;
  return { ...b, pos: { ...p, q: p.q + q, cost: p.cost + s, real: p.real - ft * s, f: [...p.f, { t, p: px, k: "m" }] } };
}
/* угода моделі, до якої належать прапорці звірки */
const tidOf = (mp) => (mp ? (mp.f && mp.f[0] && mp.f[0].t) || mp.first || 1 : null);
export async function onReconcile({ fl, mp, out, g, log, notify, now = Date.now() }) {
  const tid = tidOf(mp);
  if (fl.tid !== tid) { delete fl.had; delete fl.xc; if (tid == null) delete fl.tid; else fl.tid = tid; }
  if (mp && out.seen) fl.had = 1;
  let d = reconcile(mp, out.pos, g);
  if (d && d.k === "nopos" && (fl.had || fl.xc)) { fl.xc = 1; d = { k: "xc", t: "позицію вже закрила біржа (TP/SL/трейлінг); модель бота закриє угоду після закриття свічки" }; }
  const prev = fl.mis;
  if (!d) {
    if (prev && prev.on) await log("info", `Звірка з біржею: розбіжність усунено (${prev.t})`);
    delete fl.mis;
    return null;
  }
  const same = prev && prev.k === d.k && now - (prev.ls || 0) <= RUN_GAP;
  const n = same ? prev.n + 1 : 1;
  fl.mis = { k: d.k, t: d.t, n, at: same ? prev.at : now, ls: now, ...(d.k !== "xc" && n >= MIS_RUNS ? { on: 1 } : {}) };
  if (n === MIS_RUNS && d.k !== "xc") {
    const hint = d.k === "orphan" ? " Бот нею не керує: перевірте позицію в Bybit Demo і за потреби закрийте її там." : d.k === "nopos" ? " Нові ордери за цією угодою на біржу не надсилатимуться; бот продовжить після її закриття в моделі." : " Перевірте позицію в Bybit Demo.";
    const m = `Звірка з біржею: ${d.t}.${hint}`;
    await log("warn", m);
    await notify(`Orbix (сервер): ${g.pair} — ${m}`, "other");
  }
  return fl.mis;
}

/* Бот знято з паузи (рідний режим): повернути на біржу лімітні докупівлі, яких модель ще не зробила.
   Драбина — від ціни входу на біржі (fl.e0), як і при вході; рівні 1…n-1 модель уже докупила.
   Нові ідентифікатори: <база>e<покоління>x<рівень> (скасований orderLinkId повторно не використовується). */
export async function restore(ex, { g, symbol, fl, mp }) {
  if (!mp || mp.t1 || !(mp.n < g.orders)) return null;
  const p = (await ex.positions(symbol))[0];
  if (!p || Math.sign(p.amt) !== Math.sign(g.d)) return null;
  if (!fl.lb || !(fl.e0 > 0)) return "Bybit Demo: бот знову працює, але драбину докупівель не відновлено (угоду відкрито до оновлення сервера) — докупівлі цієї угоди лише в моделі";
  const side = g.d > 0 ? "BUY" : "SELL", F = await ex.filt(symbol), gen = (fl.rg || 0) + 1;
  const was = (k) => [fl.lb + "d" + k, ...Array.from({ length: gen - 1 }, (_, i) => fl.lb + "e" + (i + 1) + "x" + k)];
  let n = 0, firstMiss = 0;
  const miss = [];
  const top = liveTop(g, mp.n);
  const gl = mp.bf > 1 ? { ...g, base: g.base * mp.bf } : g; // реінвест — як при вході
  for (const r of ladder(gl, fl.e0, F)) {
    if (r.k < mp.n) continue;
    if (r.k > top) break;
    // перевірка не вдалася — відновлення переривається (fl.rs лишається, повтор наступного запуску): інакше нове покоління продублювало б сходинку
    const prev = await Promise.all(was(r.k).map((id) => ex.byLink(symbol, id)));
    // ще стоїть або вже виконаний; виконаний до закриття в беззбиток (покоління < fl.zg; 0 — початкова драбина) рівень не блокує
    if (prev.some((o, j) => o && (/^(New|PartiallyFilled|Untriggered)$/.test(o.status) || (o.status === "Filled" && j >= (fl.zg || 0))))) continue;
    const id = fl.lb + "e" + gen + "x" + r.k;
    try { await once(ex, symbol, id, () => ex.limit(symbol, side, r.qty, r.price, id)); n++; }
    catch (e) { miss.push(`${r.k}: ${e.message}`); if (!firstMiss) firstMiss = r.k; }
  }
  fl.rg = gen;
  if (liveN(g) < Infinity) fl.lt = Math.max(mp.n - 1, firstMiss ? firstMiss - 1 : top); // невдалий рівень і вище докладе topUp
  if (!n && !miss.length) return null;
  return `Bybit Demo: бот знову працює — відновлено ${n} лімітн. докупівель${miss.length ? ` · не вдалося: ${miss.join("; ")}` : ""}`;
}

/* Часткове виставлення: модель зарахувала докупівлю — докласти наступні рівні драбини, щоб на біржі знову стояло live ордерів.
   Ідентифікатор — як у поточного покоління драбини (<база>d<рівень> або <база>e<покоління>x<рівень> після паузи);
   рівні вище fl.lt ще не ставились, тож повтору немає, а once не надішле ордер двічі. Рівень, який модель уже
   докупила, але на біржі його не було (ціна проскочила кілька рівнів за свічку), ставиться так само: лімітний ордер
   за ціною, гіршою за ринок, виконується одразу, і біржа наздоганяє модель. Перша помилка зупиняє — повтор наступного запуску. */
export async function topUp(ex, { g, symbol, fl, mp }) {
  if (!(liveN(g) < Infinity) || !mp || mp.t1 || !fl.lb || !(fl.e0 > 0) || fl.rs) return null;
  // угоду відкрито без часткового виставлення (до оновлення чи до зміни налаштування) — уся драбина вже на біржі
  if (fl.lt == null) { fl.lt = (g.orders || 1) - 1; return null; }
  const top = liveTop(g, mp.n), have = fl.lt;
  if (top <= have) return null;
  const p = (await ex.positions(symbol))[0];
  if (!p || Math.sign(p.amt) !== Math.sign(g.d)) return null;
  const side = g.d > 0 ? "BUY" : "SELL", F = await ex.filt(symbol);
  let n = 0, err = null;
  const gl = mp.bf > 1 ? { ...g, base: g.base * mp.bf } : g; // реінвест — як при вході
  for (const r of ladder(gl, fl.e0, F)) {
    if (r.k <= have) continue;
    if (r.k > top) break;
    const id = fl.rg ? fl.lb + "e" + fl.rg + "x" + r.k : fl.lb + "d" + r.k;
    try { const o = await once(ex, symbol, id, () => ex.limit(symbol, side, r.qty, r.price, id)); if (!o.existed) n++; fl.lt = r.k; }
    catch (e) { err = `${r.k}: ${e.message}`; break; }
  }
  if (!err && fl.lt < top) fl.lt = top; // рівнів із ненульовою кількістю більше немає
  if (!n && !err) return null;
  return `Bybit Demo: докладено ${n} лімітн. докупівель (на біржі до рівня ${fl.lt || have} з ${(g.orders || 1) - 1})${err ? ` · не вдалося: ${err}, повторю` : ""}`;
}

/* Один рахунок біржі — одна позиція на символ: з кількох працюючих ботів із «Тестнет» на одній парі одного
   користувача й біржі угоди на біржі веде лише один (стабільний вибір — найменший id). Ключ: user|exchange|pair. */
export function owners(rows) {
  const owner = new Map();
  for (const bot of rows) {
    const c = bot.config || {};
    if (!c._tn || !(c.fut ?? 1) || typeof c.pair !== "string") continue;
    const k = `${bot.user_id}|${c._ex === "binance" ? "binance" : "bybit"}|${c.pair}`;
    if (!owner.has(k) || String(bot.id) < owner.get(k)) owner.set(k, bot.id);
  }
  return owner;
}

/* бот на паузі (рідний режим): зняти його лімітні докупівлі; позиція лишається на біржі зі своїм стопом */
export async function park(ex, { symbol, botId }) {
  const n = await cancelMine(ex, symbol, botId);
  const p = (await ex.positions(symbol))[0];
  if (!n && !p) return null;
  return `Bybit Demo: бот на паузі — знято ${n} лімітн. докупівель` + (p ? `; позиція ${symbol} лишається на біржі${p.sl ? ` зі стопом ${p.sl}` : " БЕЗ стопу — перевірте її вручну"}` : "");
}

/* Результати на біржі для порівняння з моделлю (state.xr, лише Bybit Demo):
   from — з якого моменту ведеться облік; l — закриття позицій за даними біржі {id, t, pnl, q, px} (PnL з комісіями біржі);
   en — входи {t, m, x}: ціна входу моделі (закриття свічки) і фактична ціна на біржі; due — скільки ще разів запитати
   закриття (запис на біржі може з'явитися із затримкою). Зберігаються останні XR_KEEP записів. */
export const XR_KEEP = 50;
export const newXr = (now) => ({ from: now, at: now, l: [], en: [] });
export async function results(ex, { symbol, xr }) {
  const seen = new Set(xr.l.map((x) => x.id));
  const add = (await ex.closedPnl(symbol, xr.at - 6e4)).filter((x) => x.t >= xr.from && !seen.has(x.id)).sort((a, b) => a.t - b.t);
  if (add.length) { xr.l = [...xr.l, ...add].slice(-XR_KEEP); xr.at = Math.max(xr.at, ...add.map((x) => x.t)); delete xr.due; }
  else if (--xr.due <= 0) delete xr.due;
  return add.length;
}

/**
 * Обробка бота після прогону рушія.
 * deps: save(state) → true, якщо стан збережено й ніхто інший його не змінив; log(level, text, data); notify(text);
 *       ex — адаптер біржі або null (немає ключів); mirror — чи дублювати угоди; native — рідний режим Bybit.
 * risk — ліміти ризику для ботів, що торгують на біржі: { blk: null | { k, t } (runner/risk.js) }; r.skipped — скільки
 *       сигналів входу модель пропустила через ліміт. fl.rl — діюче обмеження (для картки й моніторингу).
 * notify(text, cat) — cat: вид події рушія (open, dca, close, sl, liq, part), xclose, risk, error або other (фільтр подій у налаштуваннях).
 * card(ev) — необов'язково: надіслати картку сигналу замість тексту; true — надіслано (текст тоді не потрібен).
 */
export async function handleBot({ bot, g, r, symbol, mirror, native, ex, save, log, notify, card = null, risk = null, now = Date.now() }) {
  const pend = [...(Array.isArray(bot.state?.pend) ? bot.state.pend : []), ...(mirror ? actionsFor(r.events, bot.id, native, g) : [])];
  const fl = { ...(bot.state?.fl || {}) }, fl0 = JSON.stringify(fl);
  // нейтральний бот (g.d = 0): біржа працює в напрямі поточної угоди моделі; fl.dd пам'ятає його, поки біржа ще закриває угоду
  if (!g.d) { const pd = r.state?.b?.pos?.d || bot.state?.b?.pos?.d; if (pd) fl.dd = pd; g = { ...g, d: pd || fl.dd || 1 }; }
  if (fl.parked && native) fl.rs = 1; // бот знято з паузи — відновити драбину на біржі (повторюється, доки не вдасться)
  delete fl.parked; // бот знову працює
  if (!(mirror && native && ex)) clearMis(fl); // звірки немає — давнє попередження не лишається на картці
  // ліміт ризику: про пропущений вхід — один запис і одне сповіщення на причину на добу; обмеження зняте — запис і прапорець прибрано
  const rlMsg = [];
  if (!risk || !risk.blk) {
    if (fl.rl) { rlMsg.push(["info", `Ліміт ризику більше не діє — нові угоди знову дозволено (було: ${fl.rl.t})`, false]); delete fl.rl; }
  } else if (r.skipped > 0) {
    const day = dayStart(now);
    if (!fl.rl || fl.rl.k !== risk.blk.k || fl.rl.day !== day) rlMsg.push(["warn", `Ліміт ризику: нову угоду не відкрито — ${risk.blk.t}`, true]);
    fl.rl = { k: risk.blk.k, t: risk.blk.t, day, at: now };
  }
  // xs — знімок біржі (моніторинг), xe — остання помилка біржі {m, at}; без дублювання на біржу обидва не потрібні
  const st = { ...r.state, pend, fl, ...(mirror && ex ? { xs: bot.state?.xs ?? null, ...(bot.state?.xe ? { xe: bot.state.xe } : {}) } : {}) };
  // xr — результати на біржі для порівняння з моделлю (лише рідний режим)
  if (mirror && ex && native && typeof ex.closedPnl === "function") st.xr = bot.state?.xr ? JSON.parse(JSON.stringify(bot.state.xr)) : newXr(now);
  const xsOf = () => JSON.stringify([st.xs ?? null, st.xe ?? null, st.xr ?? null]);
  const xs0 = JSON.stringify([bot.state?.xs ?? null, bot.state?.xe ?? null, st.xr ? bot.state?.xr ?? null : null]);
  const exErr = (m) => { st.xe = { m: String(m).slice(0, 200), at: now }; };
  if (!(await save(st))) { await log("warn", "Стан не збережено (паралельний запуск або помилка бази) — біржу не чіпаю, повторю наступного разу"); return { saved: false }; }
  for (const ev of r.events) {
    const text = eventText(ev, g);
    await log(ev.kind === "liq" || ev.kind === "sl" ? "warn" : "info", text, ev);
    if (!(card && (await card(ev, text)))) await notify(text, ev.kind);
  }
  for (const [lvl, m, tg] of rlMsg) { await log(lvl, m); if (tg) await notify(`Orbix (сервер): ${g.pair} — ${m}`, "risk"); }
  if (!mirror) return { saved: true };
  if (!ex) {
    if (pend.length) await log("error", "Ключі біржі не підключено — угоди не продубльовано");
    if (pend.length) await save({ ...st, pend: [] });
    return { saved: true };
  }
  const left = [];
  let stop = false, changed = false, man = null;
  const adds = [];
  for (const a of pend) {
    if (stop) { left.push(a); continue; }
    if (a.kind !== "close" && a.kind !== "part" && a.kind !== "bz" && a.kind !== "mclose" && a.kind !== "mcancel" && now - a.t > STALE_MS) { changed = true; await log("warn", `Біржа: сигнал застарів (${Math.round((now - a.t) / 60e3)} хв) — ${a.kind === "open" ? "вхід" : "докупівлю"} не надіслано`); continue; }
    try {
      const out = await execute(ex, a, { g, symbol, native, botId: bot.id, fl }); changed = true;
      await log("info", typeof out === "string" ? out : out.msg);
      if (a.kind === "mclose") man = { a, px: out.px > 0 ? out.px : a.price };
      if (a.kind === "madd" && out.qty > 0 && out.px > 0) adds.push({ a, px: out.px, q: out.qty });
      // прослизання входу: ціна моделі (закриття свічки) проти фактичної середньої ціни на біржі
      if (a.kind === "open" && st.xr && a.price > 0 && fl.ex > 0) st.xr.en = [...st.xr.en, { t: a.t, m: a.price, x: fl.ex, d: g.d }].slice(-XR_KEEP);
    }
    catch (e) {
      const b = { ...a, tries: (a.tries || 0) + 1 };
      changed = true;
      exErr(e.message);
      if (b.tries >= MAX_TRIES) { const m = `Біржа: дію «${a.kind}» знято після ${MAX_TRIES} спроб — ${e.message}`; await log("error", m); await notify(`Orbix (сервер): ${g.pair} — ${m}`, "error"); }
      else { await log("error", `Біржа: ${e.message} (спроба ${b.tries} з ${MAX_TRIES}, повторю)`); left.push(b); stop = true; }
    }
  }
  // «Докупити зараз»: модель докуповує за фактичною ціною й кількістю на біржі
  for (const x of adds) if (st.b && st.b.pos && tidOf(st.b.pos) === x.a.tid) { st.b = addModel(st.b, g, { px: x.px, q: x.q, t: now }); }
  // ручне закриття (кнопка «Закрити за ринком»): модель закривається за ціною закриття на біржі
  if (fl.mc && !left.some((a) => a.kind === "mclose")) delete fl.mc; // дію виконано або знято після MAX_TRIES
  if (man && st.b && st.b.pos && tidOf(st.b.pos) === man.a.tid) {
    st.b = closeByExchange(st.b, g, { px: man.px, t: now, tag: "man" });
    st.equity = st.b.cum;
    clearMis(fl); delete fl.lb; delete fl.e0; delete fl.ex; delete fl.rg; delete fl.zg; delete fl.rs; delete fl.lt; delete fl.mc;
    left.splice(0, left.length, ...left.filter((a) => a.kind !== "dca" && a.kind !== "part" && a.kind !== "bz"));
    const l = st.b.tr[st.b.tr.length - 1], f2 = (x) => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(2);
    const m = `Угоду закрито вручну за ринком за ${man.px}, PnL моделі ${f2(l.pnl)} USDT`;
    await log("info", m, { kind: "manual_close", price: man.px, pnl: l.pnl, t: now });
    await notify(`Orbix (сервер): ${g.pair} — ${m}`, "close");
  }
  const mp = st.b?.pos || null;
  if (!mp) { delete fl.lb; delete fl.e0; delete fl.ex; delete fl.rg; delete fl.zg; delete fl.rs; delete fl.lt; } // угоди немає — дані драбини не потрібні
  if (native && !left.length) {
    const out = {};
    try {
      if (fl.rs) { const m = await restore(ex, { g, symbol, fl, mp }); if (m) await log("info", m); delete fl.rs; }
      { const m = await topUp(ex, { g, symbol, fl, mp }); if (m) await log("info", m); }
      // біржа вже закрила цю угоду (fl.xc), а позиція на біржі знову є: між закриттям і запуском сервера виконалась
      // залишкова лімітна докупівля бота — це зайва позиція, модель нею не керує: закрити її й зняти ордери
      if (fl.xc && mp && fl.tid === tidOf(mp)) {
        const gp = (await ex.positions(symbol))[0];
        if (gp && Math.sign(gp.amt) === Math.sign(g.d)) {
          await cancelMine(ex, symbol, bot.id);
          const o = await ex.market(symbol, gp.amt > 0 ? "SELL" : "BUY", Math.abs(gp.amt), true);
          const m = `Bybit Demo: угоду вже закрила біржа, але після цього виконалась залишкова лімітна докупівля — зайву позицію ${Math.abs(gp.amt)} закрито ринком${o.price > 0 ? ` за ${o.price}` : ""}`;
          await log("warn", m); await notify(`Orbix (сервер): ${g.pair} — ${m}`, "other");
        }
      }
      const m = await sync(ex, { g, symbol, botId: bot.id, fl, out, mp });
      if (m) { await log("info", m); if (/закрито (біржею|ринком)|не прийняла/.test(m)) await notify(`Orbix (сервер): ${g.pair} — ${m}`, /не прийняла/.test(m) ? "error" : "close"); }
      await onReconcile({ fl, mp, out, g, log, notify, now });
      const pv = bot.state?.xs, cur = out.pos;
      st.xs = snapshot(out); delete st.xe; // звірка пройшла — біржа відповідає
      // позиція на біржі зникла або зменшилась — запитати закриття (до 3 запусків, поки запис не з'явиться)
      if (st.xr && pv && pv.amt && (!cur || Math.abs(cur.amt) < Math.abs(pv.amt) - 1e-12)) st.xr.due = 3;
    }
    catch (e) { exErr(e.message); await log("error", `Біржа (звірка захисту): ${e.message}`); }
  }
  // закриття за даними біржі; помилка не критична — повторю наступного запуску, але не більше 3 разів
  if (st.xr && st.xr.due) { try { await results(ex, { symbol, xr: st.xr }); } catch (e) { if (--st.xr.due <= 0) delete st.xr.due; } }
  // біржа головна: позицію закрила біржа, а модель ще тримає угоду — закрити її за ціною біржі (наступним запуском, якщо запису ще немає)
  let xcDone = false;
  if (fl.xc && st.xr && st.b && st.b.pos && fl.tid === tidOf(st.b.pos)) {
    const rec = exchangeExit(st.xr, st.b.pos, g);
    if (rec) {
      st.b = closeByExchange(st.b, g, { px: rec.px, t: rec.t });
      st.equity = st.b.cum;
      clearMis(fl); delete fl.lb; delete fl.e0; delete fl.ex; delete fl.rg; delete fl.zg; delete fl.rs; delete fl.lt;
      const gone = left.filter((a) => a.kind === "dca" || a.kind === "part" || a.kind === "bz").length;
      if (gone) left.splice(0, left.length, ...left.filter((a) => a.kind !== "dca" && a.kind !== "part" && a.kind !== "bz"));
      const l = st.b.tr[st.b.tr.length - 1], f2 = (x) => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(2);
      const m = `Біржа закрила позицію (TP/SL/трейлінг) — угоду моделі закрито за ціною біржі ${rec.px}, PnL моделі ${f2(l.pnl)} USDT${gone ? "; незавершені докупівлі скасовано" : ""}`;
      await log("info", m, { kind: "xclose", price: rec.px, pnl: l.pnl, t: rec.t });
      const tx = `Orbix (сервер): ${g.pair} — ${m}`;
      if (!(card && (await card({ kind: "xclose", price: rec.px, pnl: l.pnl, t: rec.t, trade: l }, tx)))) await notify(tx, "xclose");
      xcDone = true;
    }
  }
  if (changed || xcDone || JSON.stringify(fl) !== fl0 || xsOf() !== xs0) await save({ ...st, pend: left, fl });
  return { saved: true, left: left.length };
}
