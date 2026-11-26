// Сітка вручну (g.gs — відступи від попереднього ордера, g.gv — обсяги) і умови докупівлі (g.oc), як у Veles;
// індикатор ROC у сигналах.
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine } = require('./load-engine');
const E = loadEngine();
const H = 36e5, T0 = Date.UTC(2026, 0, 5);
const G = (o) => E.normG({ ...E.DEF, pair: 'BTC/USDT', base: 11, lev: 1, orders: 4, step: 0.02, smul: 1, mult: 1.5, tp: 0.02, sl: 0.5, trail: 0, d: 1, ...o });
const bar = (i, o, h, l, c) => ({ t: T0 + i * H, o, h, l, c, v: 1 });
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('Сітка вручну: рівні — від попереднього ордера (2, 3, 5 %), обсяги — пропорції з першим ордером', () => {
  const g = G({ gs: [0.02, 0.03, 0.05], gv: [11, 16, 24, 49] }), R = E.lv(g, 100, null);
  const P = [100, 98, 98 * 0.97, 98 * 0.97 * 0.95];
  R.L.forEach((x, k) => { assert.ok(near(x.p, P[k]), `рівень ${k + 1}`); assert.ok(near(x.s, 11 * [11, 16, 24, 49][k] / 11), `обсяг ${k + 1}`); });
  assert.ok(near(E.ladder(g), 100 / 11), 'сума сітки в одиницях першого ордера');
});

test('Без сітки вручну — крок·множник^k і мартингейл, як раніше', () => {
  const g = G({ smul: 1.5 });
  for (let n = 1; n < 4; n++) assert.ok(near(E.stepAt(g, n), 0.02 * 1.5 ** (n - 1)));
  for (let k = 0; k < 4; k++) assert.ok(near(E.volAt(g, k), 1.5 ** k));
  assert.ok(near(E.ladder(g), 1 + 1.5 + 2.25 + 3.375));
});

test('Сітка вручну в бектесті: докупівлі виконуються на рівнях 98 і 95,06', () => {
  const g = G({ gs: [0.02, 0.03, 0.05], gv: [11, 16, 24, 49] }), b = new E.Bot(g);
  [[100, 100, 100, 100], [100, 100, 97.9, 98.2], [98.2, 98.2, 95, 95.5]].forEach(([o, h, l, c], i) => b.step(i, bar(i, o, h, l, c), i === 0));
  const fe = b.pos.f.filter((e) => e.k === 'e').map((e) => +e.p.toFixed(4));
  assert.deepEqual([...fe], [100, 98, 95.06]);
});

/* свічки: падіння, потім дно з різними умовами; умова ордера 2 — RSI (ТФ бота) < 30 */
function series(n, f) { const A = []; let c = 100; for (let i = 0; i < n; i++) { const nc = f(i, c); A.push(bar(i, c, Math.max(c, nc), Math.min(c, nc), nc)); c = nc; } return A; }

test('Умова докупівлі: ціна на рівні, але умова не виконана — ордер не виконується; виконана — ринковий за закриттям', () => {
  // 40 свічок боковика, потім вхід, потім різке падіння (RSI < 30) — ордер 2 з умовою RSI < 30
  const A = series(60, (i, c) => (i < 40 ? c * (1 + (i % 2 ? 0.001 : -0.001)) : i < 41 ? c : c * 0.99));
  const g = G({ orders: 2, oc: [[], [{ i: 'rsi', tf: 0, op: '<', v: 30 }]] }), gOff = G({ orders: 2, oc: [[], [{ i: 'rsi', tf: 0, op: '>', v: 99 }]] });
  for (const [gg, want] of [[g, true], [gOff, false]]) {
    const e = E.entry(A, { ...gg, sg: ['rsi'], k: 1 }), b = new E.Bot(gg);
    assert.ok(e.oc && e.oc[1], 'масиви умов прикріплено до входів');
    A.forEach((r, i) => b.step(i, r, i === 40, i, false, E.ocAt(e, i)));
    const f = b.pos.f.filter((x) => x.k === 'e');
    assert.equal(f.length === 2, want, want ? 'з виконаною умовою — докупівля' : 'без умови — докупівлі немає');
    if (want) { assert.equal(f[1].m, 1, 'ринкова докупівля'); assert.ok(f[1].p <= f[0].p * 0.98 + 1e-9, 'не вище рівня'); assert.ok(A.some((r) => r.c === f[1].p), 'за ціною закриття свічки'); }
  }
});

test('Умови для Short віддзеркалені: RSI < 30 для Long = RSI > 70 для Short', () => {
  const A = series(80, (i, c) => c * (1 + 0.004 * Math.sin(i / 3)));
  const oc = [[], [{ i: 'rsi', tf: 0, op: '<', v: 30 }]], L = E.ocArr(A, G({ d: 1, oc }), 1)[1], S = E.ocArr(A, G({ d: -1, oc }), -1)[1];
  const r = E.rsi(A.map((x) => x.c), 14);
  for (let i = 28; i < A.length; i++) { assert.equal(L[i], r[i] < 30); assert.equal(S[i], 100 - r[i] < 30); }
});

test('Умова на старшому таймфреймі — лише закриті свічки (без зазирання вперед)', () => {
  const A = series(400, (i, c) => c * (1 + 0.01 * Math.sin(i / 7)));
  const g = G({ oc: [[], [{ i: 'roc', tf: 4, op: '<', v: 0 }]] }), full = E.ocArr(A, g, 1)[1];
  for (const cut of [101, 203, 333]) {
    const part = E.ocArr(A.slice(0, cut), g, 1)[1];
    for (let i = 0; i < cut; i++) assert.equal(part[i], full[i], `свічка ${i} при зрізі ${cut}`);
  }
  const T = E.ocTf(A, 4, 1);
  T.m.forEach((j, i) => { if (j >= 0) assert.ok(T.B[j].t + 4 * H <= A[i].t + H, 'свічка 4 год закрита'); });
});

test('Історія для сервера: ocNeed рахує свічки таймфрейму бота', () => {
  assert.equal(E.ocNeed(G({})), 0);
  assert.equal(E.ocNeed(G({ oc: [[], [{ i: 'atr', tf: 4, op: '>', v: 1 }]] })), (28 * 2 + 3) * 4);
});

test('ROC у сигналах: розворот імпульсу через нуль', () => {
  const A = series(60, (i, c) => c * (i < 30 ? 0.99 : 1.01)), s = E.SIG.roc(A, {});
  const up = s.findIndex((x) => x === 1);
  assert.ok(up > 30 && up < 42, `сигнал Long після розвороту: ${up}`);
  assert.ok(s.slice(0, 30).every((x) => x !== 1));
});

test('Зіпсовані налаштування з бази: невідомий індикатор — ордер не виконується; обсяг 0 — мартингейл', () => {
  const A = series(60, (i, c) => c * 0.99), g = G({ oc: [[], [{ i: 'xxx', tf: 0, op: '<', v: 1 }]] });
  assert.ok(E.ocArr(A, g, 1)[1].every((x) => x === false));
  assert.ok(near(E.volAt(G({ gv: [0, 1, 2, 3] }), 2), 1.5 ** 2));
  assert.ok(near(E.stepAt(G({ gs: [0.02, 5, 0.03] }), 1), 0.02), 'відступ поза 0–100 % — крок за замовчуванням');
});
