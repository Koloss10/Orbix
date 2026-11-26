// Orbix AI, етап 2 (AI Bot Monitor): детерміновані правила пошуку проблем ботів.
// Критичні висновки формує цей код, а не модель: вона лише пояснює знайдене й радить.
import { ladderNotional, riskBlock } from "./risk.js";
import { ladder, stepAt } from "./engine.js";

const SEV = { high: 3, medium: 2, low: 1 };
const r = (x, d = 2) => (Number.isFinite(+x) ? Math.round(+x * 10 ** d) / 10 ** d : null);
const ladderSum = (g) => ladder({ ...g, orders: Math.max(1, Math.round(+g.orders || 1)), mult: +g.mult || 1 });
/* наскільки ціна має піти проти позиції, щоб виставились усі докупівлі (частка) */
export function gridDepth(g) { const n = Math.max(1, Math.round(+g.orders || 1)), h = { ...g, step: +g.step || 0, smul: +g.smul || 1 }; let d = 0; for (let i = 1; i < n; i++) d += stepAt(h, i); return d; }
/* приблизна відстань до ліквідації від середньої ціни (частка), як у підказці конструктора */
export const liqDist = (lev) => (lev > 1 ? 1 / lev - 0.005 : Infinity);

/**
 * @param {{ list: any[], limits: any, events: any[], now: number }} o
 *   list — боти з tools.js ({ alias, id, row, c, g, st }), events — події за 24 год (bot_id, level, message, created_at)
 */
export function findIssues({ list, limits, events = [], now }) {
  const out = [], add = (x, sev, rule, text, data = {}) => out.push({ bot: x ? x.alias : null, pair: x ? x.g.pair : null, severity: sev, rule, text, ...data });
  const ex = list.filter((x) => x.row.status === "running" && x.c._srv && x.c._tn && +x.g.fut);
  for (const x of list) {
    const s = x.st && x.st.state, run = x.row.status === "running";
    if (x.c._srv && run) {
      if (!x.st) add(x, "medium", "no_state", "Бот увімкнений на сервері, але сервер ще жодного разу його не обробив.");
      else { const age = (now - Date.parse(x.st.updated_at)) / 6e4; if (age > 20) add(x, age > 60 ? "high" : "medium", "stale", `Сервер не обробляв бота ${Math.round(age)} хв (норма — кожні 5 хв).`, { minutes: Math.round(age) }); }
    }
    if (!run && s && s.b && s.b.pos) add(x, "medium", "paused_with_position", "Бот на паузі, але позиція відкрита: докупівлі, TP і SL моделі не працюють, поки бот на паузі.");
    if (+x.g.fut && +x.g.lev > 1) {
      const L = liqDist(+x.g.lev), d = gridDepth(x.g), sl = +x.g.sl || 0;
      if (d >= L) add(x, "high", "grid_beyond_liquidation", `Сітка докупівель сягає ${r(d * 100, 1)} % від входу, а ліквідація — приблизно за ${r(L * 100, 1)} % (плече ${x.g.lev}×). Останні докупівлі можуть не встигнути.`, { grid_depth_pct: r(d * 100, 1), liq_pct: r(L * 100, 1) });
      else if (sl && sl >= L) add(x, "high", "sl_beyond_liquidation", `SL ${r(sl * 100, 1)} % від середньої ціни далі за ліквідацію (~${r(L * 100, 1)} % при плечі ${x.g.lev}×): ліквідація настане раніше за стоп.`, { sl_pct: r(sl * 100, 1), liq_pct: r(L * 100, 1) });
    }
    if (s && s.b) {
      const sum = (+x.g.base || 0) * ladderSum(x.g), dd = Math.abs(+s.dd || 0);
      if (sum > 0 && dd / sum > 0.1) add(x, dd / sum > 0.25 ? "high" : "medium", "drawdown", `Просадка моделі ${r(dd)} USDT — ${r(dd / sum * 100, 1)} % суми на бота.`, { drawdown_usdt: r(dd) });
      const xr = s.xr;
      if (xr && Array.isArray(xr.l) && xr.l.length) {
        const from = +xr.from || 0, mp = (s.b.tr || []).filter((t) => +t.ts >= from).reduce((a, t) => a + (+t.pnl || 0), 0), xp = xr.l.reduce((a, t) => a + (+t.pnl || 0), 0);
        if (Math.abs(mp - xp) > Math.max(1, 0.2 * Math.abs(mp))) add(x, "medium", "model_exchange_gap", `Результат моделі (${r(mp)} USDT) і біржі (${r(xp)} USDT) з початку звірки розходяться на ${r(Math.abs(mp - xp))} USDT.`, { model_usdt: r(mp), exchange_usdt: r(xp) });
      }
      if (Array.isArray(s.pend) && s.pend.length) add(x, "low", "pending_exchange", `${s.pend.length} дій для біржі ще чекають виконання (повтор на наступному запуску сервера).`);
    }
    const ev = events.filter((e) => e.bot_id === x.id), err = ev.filter((e) => e.level === "error"), warn = ev.filter((e) => e.level === "warn");
    if (err.length) add(x, err.length >= 3 ? "high" : "medium", "exchange_errors", `${err.length} помилок за 24 год.`, { last_untrusted: String(err[0].message || "").slice(0, 200) });
    else if (warn.length >= 3) add(x, "low", "warnings", `${warn.length} попереджень за 24 год.`, { last_untrusted: String(warn[0].message || "").slice(0, 200) });
  }
  for (const x of ex) {
    const st = (y) => (y.st && y.st.state) || null;
    const b = riskBlock({ limits, self: { g: x.g, state: st(x) }, peers: ex.filter((y) => y !== x).map((y) => ({ g: y.g, state: st(y) })), now });
    if (b) add(x, "medium", "risk_blocked", "Нові угоди заблоковано лімітом ризику: " + b.t, { full_ladder_usdt: r(ladderNotional(x.g), 0) });
  }
  out.sort((a, b) => SEV[b.severity] - SEV[a.severity]);
  return { checked_at: new Date(now).toISOString(), bots_checked: list.length, issues: out, ok: !out.length,
    note: "Правила Orbix: обробка сервером, пауза з позицією, сітка й SL проти ліквідації, просадка, модель ↔ біржа, черга біржі, помилки, ліміти ризику." };
}
