// Orbix AI, етап 2 (AI Market Analyst): ринковий знімок пари за публічними даними (без ключів).
// Джерела ті самі, що в runner: Binance USDⓈ-M (свічки, mark price, фандінг), резерв — Bybit.
// Розрахунок — детермінований (тут), модель лише пояснює. fetch передається ззовні (тести без мережі).

export const PAIR_RE = /^[A-Z0-9]{2,15}\/USDT$/;
const IV = { 1: "1h", 4: "4h", 12: "12h", 24: "1d" }, BYIV = { 1: "60", 4: "240", 12: "720", 24: "D" };
const r = (x, d = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

export function ema(xs, n) { const k = 2 / (n + 1); let e = xs[0]; const out = [e]; for (let i = 1; i < xs.length; i++) { e = xs[i] * k + e * (1 - k); out.push(e); } return out; }
export function rsi(xs, n = 14) {
  if (xs.length <= n) return null; let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = xs[i] - xs[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n;
  for (let i = n + 1; i < xs.length; i++) { const d = xs[i] - xs[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
export function atr(c, n = 14) {
  if (c.length <= n) return null; let a = 0;
  const tr = (i) => Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
  for (let i = 1; i <= n; i++) a += tr(i); a /= n;
  for (let i = n + 1; i < c.length; i++) a = (a * (n - 1) + tr(i)) / n;
  return a;
}

/** аналіз свічок: режим ринку, сила тренду, волатильність, аномалії */
export function analyze(c, tfH) {
  if (!Array.isArray(c) || c.length < 60) return { error: "Замало свічок для аналізу (потрібно від 60)." };
  const cl = c.map((x) => x.c), last = c[c.length - 1], px = last.c;
  const e20 = ema(cl, 20), e50 = ema(cl, 50), n = cl.length;
  const per24 = Math.max(1, Math.round(24 / tfH)), back = Math.min(n - 1, per24);
  const A = atr(c), atrPct = A / px * 100;
  const slope = (e20[n - 1] - e20[n - 1 - Math.min(10, n - 1)]) / px * 100;
  const gap = (e20[n - 1] - e50[n - 1]) / px * 100;
  const regime = Math.abs(gap) < atrPct * 0.5 && Math.abs(slope) < atrPct * 0.8 ? "боковий" : gap > 0 && slope > 0 ? "висхідний тренд" : gap < 0 && slope < 0 ? "низхідний тренд" : "перехідний";
  const rets = []; for (let i = Math.max(1, n - 60); i < n; i++) rets.push(Math.log(cl[i] / cl[i - 1]));
  const m = rets.reduce((a, x) => a + x, 0) / rets.length, sd = Math.sqrt(rets.reduce((a, x) => a + (x - m) ** 2, 0) / rets.length);
  const vols = c.slice(-21, -1).map((x) => x.v), vAvg = vols.reduce((a, x) => a + x, 0) / vols.length;
  const rng = last.h - last.l, anomalies = [];
  if (A && rng > 3 * A) anomalies.push(`остання свічка має розмах ${r(rng / A, 1)}× ATR`);
  if (vAvg > 0 && last.v > 3 * vAvg) anomalies.push(`обсяг останньої свічки ${r(last.v / vAvg, 1)}× від середнього за 20 свічок`);
  const ch24 = (px / cl[n - 1 - back] - 1) * 100;
  if (Math.abs(ch24) > 3 * atrPct * Math.sqrt(per24) / 2) anomalies.push(`зміна за 24 год ${r(ch24, 2)} % — незвично велика для поточної волатильності`);
  const R = rsi(cl);
  return {
    price: r(px, 6), candle_close_time: new Date(last.t + tfH * 36e5).toISOString(), timeframe_h: tfH, candles_used: n,
    change_24h_pct: r(ch24), rsi14: r(R, 1), ema20: r(e20[n - 1], 6), ema50: r(e50[n - 1], 6), ema_gap_pct: r(gap), ema20_slope_pct: r(slope),
    atr14_pct: r(atrPct), volatility_per_candle_pct: r(sd * 100, 3), regime, anomalies,
    risks: {
      long: [R != null && R > 70 ? "RSI вище 70 — ринок перекуплений" : null, regime === "низхідний тренд" ? "низхідний тренд: DCA-сітка Long може швидко набрати всі ордери" : null, atrPct > 2.5 ? "висока волатильність: ширші кроки сітки й SL" : null].filter(Boolean),
      short: [R != null && R < 30 ? "RSI нижче 30 — ринок перепроданий" : null, regime === "висхідний тренд" ? "висхідний тренд: сітка Short може швидко набрати всі ордери" : null, atrPct > 2.5 ? "висока волатильність: ширші кроки сітки й SL" : null].filter(Boolean),
    },
  };
}

async function getJson(f, u) { const res = await f(u); if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); }

/** свічки + mark price + фандінг для ф'ючерсної пари USDT */
export async function fetchMarket(f, pair, tfH) {
  const sym = pair.replace("/", ""), iv = IV[tfH];
  try {
    const k = await getJson(f, `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${iv}&limit=200`);
    const p = await getJson(f, `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${sym}`).catch(() => null);
    return { src: "Binance USDⓈ-M", candles: k.map((x) => ({ t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] })),
      mark: p ? +p.markPrice : null, funding: p ? +p.lastFundingRate : null, next_funding: p && +p.nextFundingTime ? new Date(+p.nextFundingTime).toISOString() : null };
  } catch {
    const k = await getJson(f, `https://api.bybit.com/v5/market/kline?category=linear&symbol=${sym}&interval=${BYIV[tfH]}&limit=200`);
    const t = await getJson(f, `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${sym}`).catch(() => null);
    const tk = t && t.result && t.result.list && t.result.list[0];
    return { src: "Bybit", candles: (k.result?.list ?? []).map((x) => ({ t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] })).reverse(),
      mark: tk ? +tk.markPrice : null, funding: tk ? +tk.fundingRate : null, next_funding: tk && +tk.nextFundingTime ? new Date(+tk.nextFundingTime).toISOString() : null };
  }
}

/** знімок однієї пари для моделі */
export async function marketSnapshot(f, pair, tfH, now = Date.now()) {
  const m = await fetchMarket(f, pair, tfH), a = analyze(m.candles, tfH);
  return { pair, source: m.src, fetched_at: new Date(now).toISOString(), ...a, mark_price: r(m.mark, 6),
    funding_rate_pct: m.funding == null ? null : r(m.funding * 100, 4), next_funding: m.next_funding,
    note: "Історичні показники, не прогноз. Режим і аномалії пораховано правилами Orbix." };
}
