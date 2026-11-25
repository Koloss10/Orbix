// Orbix: картка сигналу для Telegram — графік свічок із лініями входу, докупівель, середньої, TP, SL і ліквідації,
// заголовок події та блок «Логіка відкриття». Чиста функція: опис картки → SVG (тестується в Node: tests/card.test.mjs).
// У PNG картку перетворює index.ts (resvg), шрифт DejaVu Sans (кирилиця).
//
// spec: { theme: 'dark'|'light', pair, side: 1|-1, tf, lev, exchange, time,
//         event: { kind: 'open'|'dca'|'tp'|'sl'|'trail'|'liq'|'close'|'xclose'|'risk'|'error'|'test', title },
//         candles: [{ t, o, h, l, c }], lines: { entry, avg, dca: [{ k, p, done }], tp, sl, liq, exit },
//         reasons: [string], result: { pnl, pct } | null,
//         parts: { chart, orders, tpsl, logic, result } }  — чого немає в parts або true, те показується
export const W = 1000;
export const THEMES = {
  dark: { bg: "#0d1117", panel: "#161b22", grid: "#21262d", text: "#e6edf3", mute: "#8b949e", up: "#26a69a", dn: "#ef5350",
    entry: "#4c8dff", dca: "#f0b429", avg: "#c084fc", tp: "#22c55e", sl: "#ef4444", liq: "#ff7a00", exit: "#e6edf3", chip: "#0d1117" },
  light: { bg: "#ffffff", panel: "#f6f8fa", grid: "#e5e7eb", text: "#111827", mute: "#6b7280", up: "#089981", dn: "#e53935",
    entry: "#2563eb", dca: "#b7791f", avg: "#9333ea", tp: "#16a34a", sl: "#dc2626", liq: "#ea580c", exit: "#111827", chip: "#ffffff" },
};
const KIND = { open: ["Відкрито позицію", "entry"], dca: ["Докупівля", "dca"], tp: ["Закрито за TP", "tp"], trail: ["Закрито трейлінгом", "tp"],
  sl: ["Stop-Loss", "sl"], liq: ["Ліквідація", "liq"], close: ["Угоду закрито", "tp"], xclose: ["Біржа закрила позицію", "tp"],
  risk: ["Ліміт ризику", "liq"], error: ["Помилка", "sl"], test: ["Пробна картка", "entry"] };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
const on = (parts, k) => !parts || parts[k] !== false;
/** ціна з точністю за величиною: 63 412.5 · 1 771.61 · 0.6534 · 0.05554 */
export function fmtPrice(x) {
  if (!Number.isFinite(x)) return "—";
  const a = Math.abs(x), d = a >= 1000 ? 1 : a >= 100 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : 7;
  return (+x.toFixed(d)).toString();
}
const sign = (x) => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(2);
const tfLbl = (tf) => ({ 1: "1 год", 4: "4 год", 12: "12 год", 24: "1 день", 168: "1 тиждень" })[tf] || tf + " год";
const timeLbl = (t) => { const d = new Date(t); const p = (n) => String(n).padStart(2, "0"); return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`; };
/* перенесення тексту за довжиною (символів) — у SVG немає автоперенесення */
export function wrap(s, max) {
  const out = []; let cur = "";
  for (const w of String(s).split(/\s+/)) {
    if (!w) continue;
    if ((cur + " " + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + " " + w).trim();
  }
  if (cur) out.push(cur);
  return out;
}

/** рівні, які малюються: [{ key, label, p, color, dash, w }] */
export function levels(spec, C) {
  const L = spec.lines || {}, out = [], parts = spec.parts;
  if (on(parts, "orders")) {
    if (L.entry > 0) out.push({ key: "entry", label: "Вхід", p: L.entry, color: C.entry, dash: "", w: 2 });
    for (const x of L.dca || []) if (x.p > 0) out.push({ key: "dca" + x.k, label: `DCA ${x.k}`, p: x.p, color: C.dca, dash: x.done ? "" : "7 5", w: x.done ? 1.6 : 1.3, done: !!x.done });
    if (L.avg > 0 && Math.abs(L.avg - (L.entry || 0)) > 1e-12) out.push({ key: "avg", label: "Середня", p: L.avg, color: C.avg, dash: "3 3", w: 1.4 });
  }
  if (on(parts, "tpsl")) {
    if (L.tp > 0) out.push({ key: "tp", label: "TP", p: L.tp, color: C.tp, dash: "", w: 2 });
    if (L.sl > 0) out.push({ key: "sl", label: "SL", p: L.sl, color: C.sl, dash: "", w: 2 });
    if (L.liq > 0) out.push({ key: "liq", label: "Ліквідація", p: L.liq, color: C.liq, dash: "2 4", w: 1.4 });
  }
  if (L.exit > 0) out.push({ key: "exit", label: "Вихід", p: L.exit, color: C.exit, dash: "", w: 2 });
  return out;
}

/** діапазон цін: свічки + рівні, але не ширше за 1,5 розмаху свічок (далекі рівні — позначки на краю) */
export function priceRange(candles, lv) {
  let lo = Infinity, hi = -Infinity;
  for (const c of candles) { if (c.l < lo) lo = c.l; if (c.h > hi) hi = c.h; }
  if (!Number.isFinite(lo)) { lo = Math.min(...lv.map((x) => x.p)); hi = Math.max(...lv.map((x) => x.p)); }
  const span = Math.max(hi - lo, hi * 0.002), cap = span * 1.5;
  let a = lo, b = hi;
  for (const x of lv) { if (x.p < a && lo - x.p <= cap) a = x.p; if (x.p > b && x.p - hi <= cap) b = x.p; }
  const pad = (b - a) * 0.06;
  return { lo: a - pad, hi: b + pad };
}

export function cardSvg(spec) {
  const C = THEMES[spec.theme === "light" ? "light" : "dark"], parts = spec.parts;
  const ev = spec.event || { kind: "test" }, [kname, kcol] = KIND[ev.kind] || KIND.test;
  const chart = on(parts, "chart") && Array.isArray(spec.candles) && spec.candles.length > 1;
  const reasons = on(parts, "logic") ? (spec.reasons || []).slice(0, 6) : [];
  const res = on(parts, "result") && spec.result && Number.isFinite(spec.result.pnl) ? spec.result : null;
  const lines = reasons.flatMap((r) => wrap(r, 92).map((t, i) => ({ t, first: i === 0 })));
  const head = 78, ch = chart ? 380 : 0, logicH = lines.length ? 46 + lines.length * 26 : 0, resH = res ? 56 : 0, foot = 34;
  const H = head + ch + (chart ? 16 : 0) + logicH + resH + foot + 10;
  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="DejaVu Sans, sans-serif">`);
  o.push(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`);
  // заголовок: пара, напрям, таймфрейм, подія
  const side = spec.side < 0 ? "SHORT" : "LONG", sc = spec.side < 0 ? C.dn : C.up;
  o.push(`<text x="24" y="40" font-size="28" font-weight="bold" fill="${C.text}">${esc(spec.pair)}</text>`);
  const pw = String(spec.pair || "").length * 20.5 + 36, badge = side + (spec.lev > 1 ? " " + spec.lev + "×" : "");
  o.push(`<rect x="${pw}" y="17" width="${badge.length * 11 + 22}" height="30" rx="6" fill="${sc}"/>`);
  o.push(`<text x="${pw + 11}" y="38" font-size="16" font-weight="bold" fill="#ffffff">${esc(badge)}</text>`);
  o.push(`<text x="24" y="66" font-size="15" fill="${C.mute}">${esc(tfLbl(spec.tf))} · ${esc(spec.exchange || "Orbix")} · ${esc(timeLbl(spec.time || Date.now()))}</text>`);
  const title = ev.title || kname;
  o.push(`<text x="${W - 24}" y="42" font-size="22" font-weight="bold" fill="${C[kcol]}" text-anchor="end">${esc(title)}</text>`);
  let y = head;
  if (chart) y = drawChart(o, spec, C, y, ch) + 16;
  if (lines.length) {
    o.push(`<rect x="16" y="${y}" width="${W - 32}" height="${logicH - 8}" rx="10" fill="${C.panel}"/>`);
    o.push(`<text x="34" y="${y + 30}" font-size="17" font-weight="bold" fill="${C.text}">Логіка відкриття</text>`);
    let ly = y + 58;
    for (const l of lines) {
      if (l.first) o.push(`<circle cx="40" cy="${ly - 6}" r="3.5" fill="${C.entry}"/>`);
      o.push(`<text x="54" y="${ly}" font-size="15" fill="${C.text}">${esc(l.t)}</text>`);
      ly += 26;
    }
    y += logicH;
  }
  if (res) {
    const col = res.pnl >= 0 ? C.up : C.dn;
    o.push(`<rect x="16" y="${y}" width="${W - 32}" height="46" rx="10" fill="${C.panel}"/>`);
    o.push(`<text x="34" y="${y + 30}" font-size="17" fill="${C.mute}">Результат угоди</text>`);
    o.push(`<text x="${W - 34}" y="${y + 31}" font-size="22" font-weight="bold" fill="${col}" text-anchor="end">${sign(res.pnl)} USDT${Number.isFinite(res.pct) ? ` (${sign(res.pct)} %)` : ""}</text>`);
    y += resH;
  }
  o.push(`<text x="24" y="${H - 16}" font-size="13" fill="${C.mute}">Orbix · демо-рахунок, віртуальні кошти · не є фінансовою порадою</text>`);
  o.push("</svg>");
  return o.join("");
}

function drawChart(o, spec, C, top, h) {
  const cs = spec.candles, lv = levels(spec, C), { lo, hi } = priceRange(cs, lv);
  const x0 = 16, x1 = W - 140, y0 = top, y1 = top + h, pw = x1 - x0;
  const Y = (p) => y1 - ((p - lo) / (hi - lo)) * h;
  o.push(`<rect x="${x0}" y="${y0}" width="${W - 32}" height="${h}" rx="10" fill="${C.panel}"/>`);
  for (let i = 1; i < 5; i++) {
    const gy = y0 + (h * i) / 5, p = hi - ((hi - lo) * i) / 5;
    o.push(`<line x1="${x0}" y1="${gy}" x2="${x1}" y2="${gy}" stroke="${C.grid}" stroke-width="1"/>`);
    o.push(`<text x="${x0 + 8}" y="${gy - 4}" font-size="11.5" fill="${C.mute}">${fmtPrice(p)}</text>`);
  }
  const n = cs.length, step = (pw - 20) / n, bw = Math.max(1.5, step * 0.62);
  cs.forEach((c, i) => {
    const cx = x0 + 10 + step * (i + 0.5), col = c.c >= c.o ? C.up : C.dn;
    o.push(`<line x1="${cx}" y1="${Y(c.h)}" x2="${cx}" y2="${Y(c.l)}" stroke="${col}" stroke-width="1.2"/>`);
    const a = Y(Math.max(c.o, c.c)), b = Y(Math.min(c.o, c.c));
    o.push(`<rect x="${cx - bw / 2}" y="${a}" width="${bw}" height="${Math.max(1, b - a)}" fill="${col}"/>`);
  });
  // рівні: у межах — лінія з підписом справа (підписи розсуваються, щоб не накладались); поза межами — позначка на краю
  const above = [], below = [], inside = [];
  for (const L of lv) { if (L.p > hi) above.push(L); else if (L.p < lo) below.push(L); else inside.push({ ...L, ly: Y(L.p) }); }
  inside.sort((a, b) => a.ly - b.ly);
  const GAP = 22, cTop = y0 + 11, cBot = y1 - 11;
  inside.forEach((L, i) => { L.cy = Math.max(L.ly, cTop, i ? inside[i - 1].cy + GAP : cTop); });
  for (let i = inside.length - 1; i >= 0; i--) inside[i].cy = Math.min(inside[i].cy, i < inside.length - 1 ? inside[i + 1].cy - GAP : cBot);
  for (const L of inside) {
    o.push(`<line x1="${x0}" y1="${L.ly}" x2="${x1}" y2="${L.ly}" stroke="${L.color}" stroke-width="${L.w}"${L.dash ? ` stroke-dasharray="${L.dash}"` : ""}/>`);
    if (Math.abs(L.cy - L.ly) > 3) o.push(`<line x1="${x1}" y1="${L.ly}" x2="${x1 + 4}" y2="${L.cy}" stroke="${L.color}" stroke-width="1.2"/>`);
    const lbl = `${L.label} ${fmtPrice(L.p)}`, long = lbl.length > 15;
    o.push(`<rect x="${x1 + 4}" y="${L.cy - 10}" width="${W - x1 - 24}" height="20" rx="4" fill="${L.color}"/>`);
    o.push(`<text x="${x1 + 10}" y="${L.cy + 4}" font-size="11.5" font-weight="bold" fill="${C.chip}">${esc(long ? L.label : lbl)}</text>`);
    if (long) o.push(`<text x="${x1 - 6}" y="${L.ly - 5}" font-size="11.5" fill="${L.color}" text-anchor="end">${fmtPrice(L.p)}</text>`);
  }
  const edge = (arr, up) => {
    if (!arr.length) return;
    const t = arr.map((L) => `${L.label} ${fmtPrice(L.p)}`).join(" · "), yy = up ? y0 + 20 : y1 - 10;
    o.push(`<text x="${x0 + 14}" y="${yy}" font-size="12.5" fill="${C.mute}">${up ? "↑" : "↓"} поза графіком: ${esc(t.length > 110 ? t.slice(0, 107) + "…" : t)}</text>`);
  };
  edge(above, true); edge(below, false);
  // позначки входу й докупівель / виходу
  const t0 = cs[0].t, tl = cs[n - 1].t, span = Math.max(1, tl - t0);
  for (const m of spec.marks || []) {
    if (!(m.t >= t0 && m.t <= tl) || !(m.p >= lo && m.p <= hi)) continue;
    const mx = x0 + 10 + step * (((m.t - t0) / span) * (n - 1) + 0.5), my = Y(m.p), buy = m.k === "e" ? spec.side > 0 : spec.side < 0;
    const col = m.k === "e" ? C.entry : C.exit, d = buy ? 1 : -1;
    o.push(`<path d="M ${mx} ${my + 4 * d} l -7 ${11 * d} l 14 0 z" fill="${col}"/>`);
  }
  return y1;
}

/** пробна картка (кнопка «Надіслати пробну картку»): модельні свічки й рівні, ті самі налаштування вигляду, що й у справжніх */
export function demoSpec({ theme = "dark", parts = null, n = 80, now = Date.now() } = {}) {
  let s = 11; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const H = 36e5, t0 = Math.floor(now / H) * H - n * H, cs = []; let p = 100;
  for (let i = 0; i < n; i++) {
    const drift = i < n * 0.55 ? 0.0012 : -0.0021, o = p; p = p * (1 + drift + (R() - 0.5) * 0.009);
    cs.push({ t: t0 + i * H, o, h: Math.max(o, p) * (1 + R() * 0.003), l: Math.min(o, p) * (1 - R() * 0.003), c: p });
  }
  const e = p, dca = [1, 2, 3, 4].map((k) => ({ k, p: e * (1 - 0.015 * k * (1 + 0.1 * (k - 1))), done: false }));
  return { theme, pair: "DEMO/USDT", side: 1, tf: 1, lev: 3, exchange: "Пробна картка", time: now,
    event: { kind: "test", title: "Пробна картка" }, candles: cs,
    lines: { entry: e, dca, tp: e * 1.012, sl: e * 0.9, liq: e * (1 - (1 / 3 - 0.005)) },
    marks: [{ t: cs[n - 1].t, p: e, k: "e" }],
    reasons: ["Спрацювало 2 з 2 сигналів (потрібно 2)", "RSI(14) = 28.4 — нижче 35: ринок перепроданий", `Ціна ${fmtPrice(e)} нижче нижньої смуги Bollinger(20, 2)`],
    result: null, parts };
}
