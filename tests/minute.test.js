// Таймфрейми 5 і 15 хв: хвилинні дані (ключ '~m5'), збирання 15 хв із 5 хв, рушій на 5 хв, умови старшого ТФ.
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine } = require('./load-engine');
const E = loadEngine();
const M5 = 3e5, T0 = Date.UTC(2026, 0, 5);
const c5 = (n, f = (i) => 100 + Math.sin(i / 9) * 3) => Array.from({ length: n }, (_, i) => { const o = f(i), c = f(i + 1); return { t: T0 + i * M5, o, h: Math.max(o, c) + 0.1, l: Math.min(o, c) - 0.1, c, v: 1 }; });

test('Ключі хвилинних даних: ф\'ючерси й спот, пара, крок 5 хв', () => {
  assert.equal(E.isM('BTC/USDT@F~m5'), true); assert.equal(E.isF('BTC/USDT@F~m5'), true); assert.equal(E.isF('BTC/USDT~m5'), false);
  assert.equal(E.pairOf('BTC/USDT@F~m5'), 'BTC/USDT'); assert.equal(E.pairOf('BTC/USDT@F'), 'BTC/USDT');
  assert.equal(E.stepK('ETH/USDT~m5'), M5); assert.equal(E.stepK('ETH/USDT'), 36e5);
  assert.equal(E.tfMs(1 / 12), M5); assert.equal(E.tfMs(0.25), 3 * M5);
});

test('15 хв із 5 хв: OHLC, без незакритої останньої свічки; 5 хв — той самий масив', () => {
  const A = c5(31), B = E.aggC(A, 0.25);
  assert.equal(E.aggC(A, 1 / 12), A);
  assert.equal(B.length, 10, '31 свічка 5 хв = 10 закритих по 15 хв');
  B.forEach((x, j) => { const s = A.slice(j * 3, j * 3 + 3); assert.equal(x.t, s[0].t); assert.equal(x.o, s[0].o); assert.equal(x.c, s[2].c);
    assert.equal(x.h, Math.max(...s.map((y) => y.h))); assert.equal(x.l, Math.min(...s.map((y) => y.l))); });
  assert.equal(E.aggC(A, 1).length, 2, 'година з 5 хв');
  assert.equal(E.closedTf(A.slice(0, 3), 0.25), true); assert.equal(E.closedTf(A.slice(0, 2), 0.25), false);
});

test('Рушій на 5 хв: угоди відкриваються й закриваються, таймфрейм нормалізується', () => {
  const g = E.normG({ ...E.DEF, pair: 'BTC/USDT', tf: 0.0833333, base: 11, lev: 1, orders: 3, step: 0.01, mult: 1.5, tp: 0.006, sl: 0.2, trail: 0, d: 1, sg: ['rsi'], k: 1 });
  assert.equal(g.tf, 1 / 12);
  const A = c5(3000), e = E.entry(A, g), b = E.run(A, e, g, 0, 1, 1000).b;
  assert.ok(b.tr.length > 5, `угод: ${b.tr.length}`);
});

test('Бот 5 хв з умовою докупівлі на 1 год — без зазирання вперед', () => {
  const A = c5(2400), g = E.normG({ ...E.DEF, tf: 1 / 12, orders: 2, oc: [[], [{ i: 'rsi', tf: 1, op: '<', v: 45 }]] });
  const full = E.ocArr(A, g, 1)[1];
  for (const cut of [500, 1201, 1999]) { const part = E.ocArr(A.slice(0, cut), g, 1)[1]; for (let i = 0; i < cut; i++) assert.equal(part[i], full[i]); }
  assert.ok(full.some(Boolean) && full.some((x) => !x));
  assert.equal(E.ocNeed(g), (28 * 2 + 3) * 12);
});

test('Історія для бота 5 хв — у свічках 5 хв', () => {
  const t0 = Date.now() - 864e5; // доба тому
  assert.ok(E.hrsFor(t0, 1 / 12) >= 26000, 'не менше 3 місяців 5 хв');
  assert.equal(E.hrsFor(Date.now() - 400 * 864e5, 1 / 12), 30000, 'стеля сховища');
});
