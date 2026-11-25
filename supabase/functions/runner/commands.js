// Ручні команди для серверного бота (кнопки на картці): закрити угоду за ринком, скасувати угоду,
// пауза до кінця угоди і відновлення входів. Команди приходять із таблиці public.bot_commands.
// Чиста логіка без мережі й бази (тестується в Node: tests/mirror.test.mjs, розділ «Ручні команди»).
//
// Команди застосовуються до збереженого стану бота ДО прогону рушія, а дії для біржі стають у чергу
// state.pend. Отже діє той самий порядок, що й для сигналів: спершу стан зберігається з перевіркою
// версії (CAS), лише потім щось іде на біржу. Повтор не дублює дію: fl.cmd — номер останньої
// застосованої команди, а ордер закриття має незмінний ідентифікатор.
//
//   close      — модель без біржі: угода закривається одразу за поточною ціною;
//                з біржею: у чергу йде дія mclose (зняти ордери бота й закрити позицію reduceOnly),
//                модель закривається після виконання — за ціною закриття на біржі (handleBot).
//   cancel     — бот «забуває» угоду: модель закриває її за поточною ціною (позначка cx),
//                на Bybit знімаються лише лімітні ордери бота (дія mcancel), позиція лишається на біржі.
//   stop_after — нові угоди не відкриваються (fl.sa), поточна доводиться до кінця.
//   resume     — знову дозволити нові угоди.
import { tfMs } from "./engine.js";
import { linkId } from "./mirror.js";

export const CMD_KINDS = ["close", "cancel", "stop_after", "resume"];
/* команда, що чекає довше, вже неактуальна (бот вимкнули, сервер не працював тощо) */
export const CMD_TTL = 30 * 60e3;

const f2 = (x) => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(2);
/* угода моделі, до якої належить дія: час першого виконання (як tidOf у mirror.js) */
export const dealId = (pos) => (pos ? (pos.f && pos.f[0] && pos.f[0].t) || pos.first || 1 : null);

/* закрити позицію моделі за ціною px у момент t: той самий розрахунок, що й вихід рушія (тейкер) */
export function closeModel(b, g, { px, t, tag }) {
  const p = b.pos, d = g.d, ft = g.ftk != null ? g.ftk : g.fee, v = p.q * px;
  const pnl = p.real + d * (v - p.cost) - ft * v, W = tfMs(g.tf || 1), i = Math.floor(t / W);
  const tr = [...(b.tr || []), { i, ts: t, pnl, n: p.n, liq: false, sl: false, [tag]: 1, fd: p.fd, f: p.f.concat({ t, p: px, k: "x" }) }];
  return { ...b, pos: null, tr, cum: (b.cum || 0) + pnl, cd: i + (g.cd || 0) + 1 };
}
/* дані сітки на біржі після кінця угоди не потрібні */
const DEAL_FL = ["lb", "e0", "ex", "rg", "rs", "lt", "mc", "xc", "tid", "had", "mis"];
export const clearDeal = (fl) => { for (const k of DEAL_FL) delete fl[k]; };

/**
 * @param cmds    нові команди бота [{ id, kind, created_at }] у порядку надходження
 * @param state   збережений стан бота (bot_state.state) або null
 * @param price   поточна ціна (остання свічка, зокрема незакрита)
 * @param mirror  чи торгує бот на демо-біржі; native — Bybit (лімітні ордери стоять на біржі)
 * @returns { state, results: [{ id, kind, status: "done"|"skipped", text }], notes: [{ kind, text }] — для журналу й Telegram }
 */
export function applyCommands({ cmds, state, g, botId, mirror, native, price, now }) {
  const st = state ? JSON.parse(JSON.stringify(state)) : null;
  const results = [], notes = [];
  if (!Array.isArray(cmds) || !cmds.length) return { state: st, results, notes };
  const fl = st ? (st.fl = { ...(st.fl || {}) }) : null;
  const res = (c, status, text) => { results.push({ id: c.id, kind: c.kind, status, text }); if (status === "done") notes.push({ kind: c.kind, text }); };
  for (const c of [...cmds].sort((a, b) => a.id - b.id)) {
    if (fl && +fl.cmd >= +c.id) { results.push({ id: c.id, kind: c.kind, status: "done", text: "виконано" }); continue; } // уже застосовано попереднім запуском (стан збережено, позначку ще не поставлено)
    if (!CMD_KINDS.includes(c.kind)) { res(c, "skipped", "невідома команда"); continue; }
    if (now - Date.parse(c.created_at) > CMD_TTL) { res(c, "skipped", "команда застаріла (понад 30 хв) — натисніть ще раз"); continue; }
    if (!st) { res(c, "skipped", "сервер ще не обробляв цього бота — спробуйте за кілька хвилин"); continue; }
    if ((c.kind === "close" || c.kind === "cancel") && st.b && st.b.pos && !(price > 0)) break; // немає ціни — ця й наступні команди чекають наступного запуску (порядок зберігається)
    fl.cmd = c.id;
    if (c.kind === "stop_after") { fl.sa = 1; res(c, "done", "Пауза до кінця угоди: нових угод бот не відкриватиме, поточну доведе до кінця"); continue; }
    if (c.kind === "resume") { const was = !!fl.sa; delete fl.sa; res(c, "done", was ? "Нові угоди знову дозволено" : "Нові угоди вже дозволено"); continue; }
    const b = st.b || {}, p = b.pos;
    if (!p) { res(c, "skipped", "відкритої угоди немає"); continue; }
    const pend = Array.isArray(st.pend) ? st.pend : [], tid = dealId(p);
    if (pend.some((a) => (a.kind === "mclose" || a.kind === "mcancel") && a.tid === tid)) { res(c, "skipped", "ця угода вже закривається"); continue; }
    // докупівлі й часткові фіксації цієї угоди, що чекали в черзі, більше не потрібні
    const keep = pend.filter((a) => a.kind !== "dca" && a.kind !== "part");
    if (c.kind === "close" && mirror) {
      st.pend = [...keep, { id: linkId(botId, now, "m"), kind: "mclose", t: now, tid, price, tries: 0 }];
      fl.mc = tid;
      res(c, "done", `Закриття угоди за ринком надіслано на ${native ? "Bybit Demo" : "Binance Testnet"}`);
      continue;
    }
    const tag = c.kind === "close" ? "man" : "cx";
    st.b = closeModel(b, g, { px: price, t: now, tag });
    st.equity = st.b.cum;
    const l = st.b.tr[st.b.tr.length - 1];
    clearDeal(fl);
    st.pend = mirror && native ? [...keep, { id: linkId(botId, now, "n"), kind: "mcancel", t: now, tid, tries: 0 }] : keep;
    res(c, "done", c.kind === "close"
      ? `Угоду закрито вручну за ринком за ${price}, PnL ${f2(l.pnl)} USDT`
      : `Угоду скасовано: бот більше її не веде (оцінка за ціною ${price}: ${f2(l.pnl)} USDT)${mirror ? ". Позиція лишилась на біржі — закрийте її вручну" + (native ? ", лімітні ордери бота знімаються" : "") : ""}`);
  }
  return { state: st, results, notes };
}
