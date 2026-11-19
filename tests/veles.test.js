// Функції, перенесені з порівняння з Veles (docs/veles-comparison.md): зупинка після N угод, реінвест,
// нові індикатори входу. Очікувані значення пораховано вручну за формулами в коментарях.
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine } = require('./load-engine');
const E = loadEngine();
const H1 = 36e5, T0 = Date.UTC(2026, 0, 5);
const near = (a, b, eps = 1e-6, m = '') => assert.ok(Math.abs(a - b) <= eps, `${m} очікувалось ${b}, отримано ${a}`);
const C = (i, o, h, l, c) => ({ t: T0 + i * H1, o, h, l, c, v: 1 });
const G = (o) => ({ ...E.DEF, pair: 'BTC/USDT', fee: 0.001, slip: 0.0005, base: 100, lev: 1, orders: 1, mult: 1, smul: 1, step: 0.02, tp: 0.01, sl: 0.05, trail: 0, s1: 0, be: 0, cd: 0, d: 1, ...o });
// цикл «вхід по 100 → TP на наступній свічці» повторюється n разів; сигнал входу на кожній свічці
const cycles = (n) => { const cs = []; for (let k = 0; k < n; k++) cs.push(C(2 * k, 100, 100, 100, 100), C(2 * k + 1, 100, 101.5, 99.5, 101.2)); return cs; };
const play = (g, cs) => { const b = new E.Bot(g, null, null); cs.forEach((r, i) => b.step(i, r, true)); return b; };

test('Зупинка після N угод: після 2 закритих угод нові не відкриваються', () => {
  const b = play(G({ maxd: 2 }), cycles(4));
  assert.equal(b.tr.length, 2); assert.equal(b.nd, 2); assert.equal(b.pos, null);
});

test('Зупинка після N угод: 0 — без обмеження', () => {
  assert.equal(play(G({ maxd: 0 }), cycles(4)).tr.length, 4);
});

test('Реінвест 100 %: друга угода більша на прибуток першої', () => {
  // 1-ша угода: q = 100/100 = 1, PnL = 0.799 (як у engine.test.js).
  // Маржа сітки M = base = 100 (1 ордер). bf = 1 + 1·0.799/100 = 1.00799 → q2 = 100·1.00799/100 = 1.00799
  const b = play(G({ rv: 1 }), cycles(2).slice(0, 3));
  near(b.tr[0].pnl, 0.799); near(b.pos.q, 1.00799); near(b.pos.bf, 1.00799);
});

test('Реінвест 0 % і після збитку — розмір не змінюється', () => {
  near(play(G({ rv: 0 }), cycles(2).slice(0, 3)).pos.q, 1);
  // збиток: SL 95 → cum < 0 → bf = 1
  const b = new E.Bot(G({ rv: 1 }), null, null);
  [C(0, 100, 100, 100, 100), C(1, 100, 100, 94, 96), C(2, 100, 100, 100, 100)].forEach((r, i) => b.step(i, r, true));
  assert.ok(b.cum < 0); near(b.pos.q, 1);
});

test('Реінвест масштабує й докупівлі угоди', () => {
  // M = base·(1 + 1) = 200 (2 ордери, мартингейл 1). Після 1-ї угоди (TP від 100 → PnL 0.799): bf = 1 + 0.799/200 = 1.0039950
  // 2-га угода: вхід 100·bf/100; докупівля по 98: qty = 100·bf/98
  const g = G({ rv: 1, orders: 2 }), b = new E.Bot(g, null, null), bf = 1 + 0.799 / 200;
  [C(0, 100, 100, 100, 100), C(1, 100, 101.5, 99.5, 101.2), C(2, 100, 100, 100, 100), C(3, 100, 100, 97.9, 98.5)].forEach((r, i) => b.step(i, r, true));
  near(b.pos.bf, bf); near(b.pos.q, bf + 100 * bf / 98, 1e-9);
});

test('ATR сталих свічок дорівнює їхньому діапазону', () => {
  const A = Array.from({ length: 30 }, (_, i) => C(i, 100, 101, 99, 100));
  near(E.atr(A, 10).at(-1), 2);
});

test('HMA лінійного ряду: запізнення 5/3 (n = 50)', () => {
  // WMA(n) лінійного ряду запізнюється на (n−1)/3. 2·WMA(25) − WMA(50): i − 16 + 49/3 = i + 1/3;
  // WMA(7) від нього: (i + 1/3) − 6/3 = i − 5/3
  const c = Array.from({ length: 120 }, (_, i) => i);
  near(E.hma(c, 50).at(-1), 119 - 5 / 3, 1e-9);
});

test('SuperTrend і Parabolic SAR: напрям тренду', () => {
  const up = Array.from({ length: 60 }, (_, i) => C(i, 100 + i, 101 + i, 99 + i, 100.5 + i));
  const dn = Array.from({ length: 60 }, (_, i) => C(i, 200 - i, 201 - i, 199 - i, 199.5 - i));
  assert.equal(E.supertrend(up).at(-1), 1); assert.equal(E.supertrend(dn).at(-1), -1);
  assert.equal(E.psar(up).at(-1), 1); assert.equal(E.psar(dn).at(-1), -1);
});

test('Сигнали Keltner і «% зміни ціни»', () => {
  // рівні свічки по 100 (EMA20 = 100, ATR10 = 2), остання закривається на 90 < 100 − 2·2 → Long
  const A = Array.from({ length: 40 }, (_, i) => C(i, 100, 101, 99, 100)); A.push(C(40, 100, 100, 89, 90));
  const g = G({ sg: ['kc'] });
  assert.equal(E.SIG.kc(A, g).at(-1), 1);
  // 24 свічки тому 100, зараз 90: −10 % ≤ −3 % → Long; зростання +5 % → Short
  assert.equal(E.SIG.pc(A, g).at(-1), 1);
  const B = Array.from({ length: 30 }, (_, i) => C(i, 100, 101, 99, 100)); B.push(C(30, 100, 106, 100, 105));
  assert.equal(E.SIG.pc(B, g).at(-1), -1);
});
