// Картка сигналу для Telegram: «логіка відкриття» й опис картки (рівні, свічки, результат).
// Чиста логіка без мережі (тестується в Node: tests/card.test.mjs). Причини входу — з тих самих індикаторів
// і фільтрів, що й вхід рушія (engine.js), тож пояснення збігається з тим, чому модель справді увійшла.
// Тексти — за шаблонами, без AI.
import { slStop } from "./mirror.js";
import { SIG, ema, rsi, bbands, cci, stoch, macdH, whale, liq, act, casc, htf, lv, tfMs, ladder } from "./engine.js";

const cl = (A) => A.map((x) => x.c);
const f = (x, d = 1) => (Number.isFinite(x) ? (+x.toFixed(d)).toString() : "—");
const px = (x) => { const a = Math.abs(x), d = a >= 1000 ? 1 : a >= 100 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : 7; return (+x.toFixed(d)).toString(); };

/* один сигнал: текст, якщо він спрацював у бік бота на свічці i */
function reasonOf(k, A, g, i) {
  const L = g.d > 0, c = A[i].c;
  switch (k) {
    case "rsi": { const v = rsi(cl(A), g.rp)[i]; return L ? `RSI(${g.rp}) = ${f(v)} — нижче ${g.rm}: ринок перепроданий` : `RSI(${g.rp}) = ${f(v)} — вище ${100 - g.rm}: ринок перекуплений`; }
    case "bb": { const [lo, up] = bbands(cl(A), g.bn, g.bk); return L ? `Ціна ${px(c)} нижче нижньої смуги Bollinger(${g.bn}, ${g.bk}) = ${px(lo[i])}` : `Ціна ${px(c)} вище верхньої смуги Bollinger(${g.bn}, ${g.bk}) = ${px(up[i])}`; }
    case "cci": { const v = cci(A, g.cn)[i]; return L ? `CCI(${g.cn}) = ${f(v, 0)} — нижче −${g.cv}: сильне відхилення вниз` : `CCI(${g.cn}) = ${f(v, 0)} — вище ${g.cv}: сильне відхилення вгору`; }
    case "macd": { const h = macdH(cl(A)); return L ? `Гістограма MACD від'ємна (${px(h[i])}), але зростає — тиск продавців слабшає` : `Гістограма MACD додатна (${px(h[i])}), але спадає — тиск покупців слабшає`; }
    case "stoch": { const v = stoch(A)[i]; return L ? `Stochastic(14) = ${f(v)} — нижче 20: зона перепроданості` : `Stochastic(14) = ${f(v)} — вище 80: зона перекупленості`; }
    case "ema": { const e = ema(cl(A), 100)[i]; return L ? `Ціна вище EMA(100) = ${px(e)} — висхідний тренд` : `Ціна нижче EMA(100) = ${px(e)} — низхідний тренд`; }
    case "pat": {
      const x = A[i], p = A[i - 1], b = Math.abs(x.c - x.o), lo = Math.min(x.o, x.c) - x.l, up = x.h - Math.max(x.o, x.c);
      const engulf = L ? p.c < p.o && x.c > x.o && x.c >= p.o && x.o <= p.c : p.c > p.o && x.c < x.o && x.c <= p.o && x.o >= p.c;
      if (engulf) return L ? "Свічковий патерн: бичаче поглинання" : "Свічковий патерн: ведмеже поглинання";
      return L ? `Свічковий патерн: молот (довга нижня тінь ${f(lo / (b || 1e-9), 1)}× тіла)` : `Свічковий патерн: падаюча зірка (довга верхня тінь ${f(up / (b || 1e-9), 1)}× тіла)`;
    }
    case "fib": return `Ціна ${px(c)} біля рівня Fibonacci 0.618 хвилі за останні 50 свічок`;
    case "lvl": { let hi = -Infinity, lo = Infinity; for (let j = Math.max(0, i - 100); j < i; j++) { hi = Math.max(hi, A[j].h); lo = Math.min(lo, A[j].l); } return L ? `Ціна біля підтримки — мінімуму останніх 100 свічок (${px(lo)})` : `Ціна біля опору — максимуму останніх 100 свічок (${px(hi)})`; }
    case "ta": return L ? "TA-рейтинг: щонайменше 3 з 6 індикаторів (RSI, Stochastic, CCI, MACD, EMA20, EMA20/50) за Long" : "TA-рейтинг: щонайменше 3 з 6 індикаторів за Short";
    default: return null;
  }
}

/* фільтри входу, що ввімкнені й пропустили вхід */
function filterReasons(A, g, i) {
  const out = [], L = g.d > 0;
  if (+g.wk > 0 && whale(A, g)[i]) out.push(`Фільтр китів: обсяг ≥ ${g.wk}× середнього, переважають ${L ? "покупці" : "продавці"}`);
  if (+g.lq > 0 && liq(A, g)[i]) out.push(+g.lq === 1 ? "Фільтр ліквідності: розворот після зняття стопів за рівнем" : "Фільтр ліквідності: рух до незнятої зони ліквідності");
  if (+g.ak > 0 && act(A, g)[i]) out.push(`Сплеск активності: розмах і кількість угод ≥ ${g.ak}× середнього`);
  if (+g.lk > 0 && casc(A, g)[i]) out.push(`Каскад ліквідацій: новий ${L ? "мінімум" : "максимум"} з обсягом ≥ ${g.lk}× і викупом тіні`);
  if (+g.htf > 0 && htf(A, g)[i]) out.push(`Тренд старшого таймфрейму (${g.htf} год, EMA ${g.hte}) не проти ${L ? "Long" : "Short"}`);
  return out;
}

/** причини входу на свічці i (A — свічки таймфрейму бота): [рядок підсумку, сигнали…, фільтри…] */
export function entryReasons(A, g, i = A.length - 1) {
  if (!Array.isArray(A) || i < 1 || i >= A.length || !Array.isArray(g.sg)) return [];
  const fired = [];
  for (const k of g.sg) { const s = SIG[k]; if (!s) continue; if (s(A, g)[i] === g.d) { const r = reasonOf(k, A, g, i); if (r) fired.push(r); } }
  const need = Math.min(g.k || g.sg.length, g.sg.length);
  return [`Спрацювало ${fired.length} з ${g.sg.length} сигналів (потрібно ${need})`, ...fired, ...filterReasons(A, g, i)];
}

/** рівні картки від позиції моделі: вхід, докупівлі (виконані й майбутні), середня, TP, SL, ліквідація */
export function cardLines(g, pos) {
  if (!pos || !(pos.first > 0)) return {};
  const R = lv(g, pos.first, null), avg = pos.q > 0 ? pos.cost / pos.q : R.avg, d = g.d;
  const dca = R.L.slice(1).map((x, j) => ({ k: j + 1, p: x.p, done: j + 1 < (pos.n || 1) }));
  // SL — там, де модель реально зупиниться: після останньої досяжної докупівлі (так само стоїть і на біржі, mirror.js slStop)
  const rest = pos.t1 ? [] : dca.filter((x) => !x.done).map((x) => ({ price: x.p, qty: R.L[x.k].s / x.p }));
  const tp = g.s1 > 0 ? 0 : g.tp > 0 ? avg * (1 + d * g.tp) : 0, sl = pos.t1 && pos.be ? pos.be : g.sl > 0 ? slStop(g, { q: pos.q > 0 ? pos.q : R.L[0].s / R.L[0].p, avg }, rest) : 0;
  const L = +g.fut ? g.lev || 1 : 1, liqP = L > 1 ? avg * (1 - d * Math.max(1 / L - 0.005, 0)) : 0;
  return { entry: pos.first, avg, dca, tp, sl, liq: liqP };
}

/** опис картки для tg-card (без токенів і id): подія рушія → spec */
export function cardSpec({ g, ev, pos, candles, reasons = [], exchange, theme = "dark", n = 80, parts = null, trade = null }) {
  const W = tfMs(g.tf || 1), cs = (candles || []).slice(-n).map((c) => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c }));
  const kind = ev.kind === "close" ? (trade && trade.xc ? "xclose" : g.trail > 0 ? "trail" : "tp") : ev.kind;
  // нумерація як у налаштуваннях бота: вхід — ордер 1, докупівлі — ордери 2…orders
  const title = kind === "dca" ? `Докупівля: ордер ${ev.n} з ${g.orders}` : undefined;
  const lines = pos ? cardLines(g, pos) : {};
  if (["tp", "trail", "sl", "liq", "xclose"].includes(kind) && ev.price > 0) lines.exit = ev.price;
  const marks = [];
  const fills = (pos && pos.f) || (trade && trade.f) || [];
  for (const x of fills) marks.push({ t: Math.floor(x.t / W) * W, p: x.p, k: x.k });
  const base = (+g.base || 0) * ladder({ ...g, orders: g.orders || 1, mult: g.mult || 1 });
  const result = ev.pnl != null && Number.isFinite(ev.pnl) ? { pnl: ev.pnl, pct: base > 0 ? (ev.pnl / base) * 100 : null } : null;
  return { theme, pair: g.pair, side: g.d < 0 ? -1 : 1, tf: g.tf || 1, lev: +g.fut ? g.lev || 1 : 1, exchange, time: ev.t || Date.now(),
    event: { kind, title }, candles: cs, lines, marks, reasons: kind === "open" ? reasons : [], result, parts };
}

/* ---------- налаштування карток (public.tg_card_prefs) ---------- */
export const CARD_DEF = { enabled: true, events: { open: true, dca: true, close: true, risk: true, error: true, other: true },
  parts: { chart: true, orders: true, tpsl: true, logic: true, result: true }, theme: "dark", candles: 80, bots_off: [] };
/** рядок таблиці (або null — користувач ще нічого не налаштовував) → повні налаштування */
export function cardPrefs(row) {
  const r = row && typeof row === "object" ? row : {};
  const pick = (o, d) => Object.fromEntries(Object.keys(d).map((k) => [k, o && typeof o[k] === "boolean" ? o[k] : d[k]]));
  return { enabled: r.enabled !== false, events: pick(r.events, CARD_DEF.events), parts: pick(r.parts, CARD_DEF.parts),
    theme: ["dark", "light", "auto"].includes(r.theme) ? r.theme : "dark", candles: [40, 80, 150].includes(+r.candles) ? +r.candles : 80,
    bots_off: Array.isArray(r.bots_off) ? r.bots_off.map(String) : [] };
}
/** категорія повідомлення для фільтра подій: вид події рушія або категорія з mirror.js */
export const catOf = (kind) => (["open", "dca"].includes(kind) ? kind : ["close", "sl", "liq", "part", "bz", "xclose"].includes(kind) ? "close" : ["risk", "error"].includes(kind) ? kind : "other");
/** чи надсилати повідомлення цієї категорії взагалі */
export const wantMsg = (p, kind) => p.events[catOf(kind)] !== false;
/** чи надсилати картинкою (інакше — текстом): картки вимкнено, бот у винятках або подія без графіка */
export const wantCard = (p, botId, kind) => p.enabled && !p.bots_off.includes(String(botId)) && ["open", "dca", "close", "sl", "liq", "xclose"].includes(kind);
/** тема: «авто» — світла вдень за Києвом (07:00–19:00, UTC+2), темна вночі */
export const themeFor = (p, now = Date.now()) => (p.theme !== "auto" ? p.theme : ((new Date(now).getUTCHours() + 2) % 24 >= 7 && (new Date(now).getUTCHours() + 2) % 24 < 19 ? "light" : "dark"));
/** підпис під карткою (≤ 1024 символів у Telegram): текст події + коротка логіка */
export function cardCaption(text, reasons = []) {
  const t = [text, ...reasons.slice(0, 4).map((r) => "• " + r)].join("\n");
  return t.length > 1000 ? t.slice(0, 997) + "…" : t;
}
