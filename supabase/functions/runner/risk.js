// Ліміти ризику серверних ботів, що торгують на демо-біржі (профіль користувача: profiles.risk_*).
// Чиста логіка без мережі й бази (тестується в Node: tests/risk.test.mjs).
//
// Коли ліміт перевищено, бот не відкриває НОВИХ угод: сигнал входу пригнічується в самій моделі
// (processBot, параметр entryOk), тож модель і біржа не розходяться. Позиції, що вже відкриті,
// бот веде далі: докупівлі, TP, SL, трейлінг. Щойно умова минає (нова доба UTC, звільнилась
// експозиція, ліміт змінено), входи відновлюються самі.
//
// Ліміти (USDT; null або 0 — ліміт вимкнено):
//   max_pos   — повна драбина одного бота (вхід + усі докупівлі, з плечем);
//   max_total — сума повних драбин усіх ботів користувача, що зараз мають позицію, разом із новою угодою;
//   day_loss  — реалізований збиток за поточну добу UTC по всіх ботах користувача з біржею
//               (закриття за даними біржі state.xr.l, а для ботів без них — угоди моделі state.b.tr).
import { tfMs, reinvestFactor } from "./engine.js";

const DAY = 864e5;
const num = (x) => (Number.isFinite(+x) && +x > 0 ? +x : 0);
const usd = (x, d = 0) => (Math.round(x * 10 ** d) / 10 ** d).toLocaleString("uk-UA", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/ /g, " ");

/* ліміти за замовчуванням (як у міграції profiles.risk_*): ними ж сервер користується, якщо профіль не прочитався */
export const DEF_LIMITS = { maxPos: 3000, maxTotal: 8000, dayLoss: 150 };
/* ліміти з рядка profiles; рядка немає — ліміти за замовчуванням (безпечніше, ніж без лімітів) */
export function limitsOf(row) {
  if (!row) return { ...DEF_LIMITS };
  return { maxPos: num(row.risk_max_pos), maxTotal: num(row.risk_max_total), dayLoss: num(row.risk_day_loss) };
}

/* повна драбина бота: вхід і всі докупівлі, з плечем (так само, як lv у рушії без правил біржі) */
export function ladderNotional(g) {
  const L = +g.lev || 1, m = +g.mult || 1, n = Math.max(1, Math.round(+g.orders || 1));
  let u = 0;
  for (let k = 0; k < n; k++) u += m ** k;
  return (+g.base || 0) * L * u;
}

/* експозиція бота, що вже має позицію: повна драбина з урахуванням реінвесту (pos.bf), але не менше за фактичну вартість
   позиції — так враховуються й ручні докупівлі понад драбину */
export function exposure(g, state) {
  const pos = state && state.b && state.b.pos;
  return Math.max(ladderNotional(g) * (pos && pos.bf > 1 ? +pos.bf : 1), pos ? +pos.cost || 0 : 0);
}

/* повна драбина НОВОЇ угоди цього бота: з урахуванням реінвесту (множник від накопиченого прибутку) */
export function nextLadder(g, state) {
  return ladderNotional(g) * reinvestFactor(g, state && state.b ? +state.b.cum || 0 : 0);
}

/* найбільша вартість позиції бота (USDT, з плечем), до якої можна докупити вручну, не порушивши лімітів; 0 — обмежень немає */
export function addCap(limits, peers = []) {
  const lim = limits || {}, busy = peers.reduce((a, b) => a + (b.state && b.state.b && b.state.b.pos ? exposure(b.g, b.state) : 0), 0);
  const caps = [];
  if (lim.maxPos) caps.push(lim.maxPos);
  if (lim.maxTotal) caps.push(Math.max(0, lim.maxTotal - busy));
  return caps.length ? Math.min(...caps) : 0;
}

/* початок поточної доби UTC */
export const dayStart = (now) => Math.floor(now / DAY) * DAY;

/* реалізований PnL бота з моменту from: за даними біржі (xr.l), якщо вони ведуться, інакше за угодами моделі */
export function realizedSince(g, state, from) {
  const xr = state && state.xr;
  if (xr && Array.isArray(xr.l)) return xr.l.reduce((a, x) => a + (x.t >= from ? +x.pnl || 0 : 0), 0);
  const W = tfMs(g.tf || 1), tr = (state && state.b && Array.isArray(state.b.tr)) ? state.b.tr : [];
  return tr.reduce((a, t) => a + ((+t.ts || 0) + W >= from ? +t.pnl || 0 : 0), 0);
}

/**
 * Чи можна боту відкривати нову угоду.
 * self  — { g, state } цього бота; peers — інші боти користувача, що торгують на біржі: [{ g, state }].
 * Повертає null (можна) або { k, t }: k — "day" | "pos" | "total", t — пояснення для журналу й сповіщення.
 */
export function riskBlock({ limits, self, peers = [], now = Date.now() }) {
  const lim = limits || {};
  if (lim.dayLoss) {
    const from = dayStart(now);
    const pnl = [self, ...peers].reduce((a, b) => a + realizedSince(b.g, b.state, from), 0);
    if (pnl <= -lim.dayLoss) return { k: "day", t: `збиток за сьогодні (UTC) ${usd(-pnl, 2)} USDT досяг денного ліміту ${usd(lim.dayLoss)} USDT — нові угоди відновляться з нової доби` };
  }
  const L = nextLadder(self.g, self.state);
  if (lim.maxPos && L > lim.maxPos + 1e-9) return { k: "pos", t: `повна драбина бота ${usd(L)} USDT більша за ліміт угоди ${usd(lim.maxPos)} USDT — зменште суму чи кількість докупівель або підніміть ліміт у профілі` };
  if (lim.maxTotal) {
    const busy = peers.reduce((a, b) => a + (b.state && b.state.b && b.state.b.pos ? exposure(b.g, b.state) : 0), 0);
    if (busy + L > lim.maxTotal + 1e-9) return { k: "total", t: `інші боти вже зайняли ${usd(busy)} USDT, разом із цією угодою (${usd(L)} USDT) буде більше за загальний ліміт ${usd(lim.maxTotal)} USDT` };
  }
  return null;
}
