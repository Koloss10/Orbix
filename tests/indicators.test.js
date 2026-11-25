// Індикатори й фільтри: значення на свічці i залежить лише від свічок ≤ i (без зазирання вперед).
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine } = require('./load-engine');
const E = loadEngine(); E.MD.mode = 'demo';
const A0 = () => { const c = { pair: 'ETH/USDT', ex: 'Binance', amt: 0, per: 100, tf: 1, dr: 1, fut: 1, lev: 1 }; if (!E.DT['ETH/USDT']) E.auto(c, 0); return E.aggC(E.DT['ETH/USDT'], 1).slice(-700).map((x) => ({ ...x })); };
const g = E.normG({ ...E.DEF, pair: 'ETH/USDT' });

test('Кожен сигнал (старі й нові) не зазирає в майбутні свічки', () => {
  const A = A0(), full = {};
  for (const k of Object.keys(E.SIG)) full[k] = E.SIG[k](A, g);
  for (const cut of [150, 333, 520, 699]) {
    const B = A.slice(0, cut + 1).map((x) => ({ ...x }));
    for (const k of Object.keys(E.SIG)) assert.equal(E.SIG[k](B, g)[cut], full[k][cut], `${k} на свічці ${cut}`);
  }
});

test('Нові сигнали справді спрацьовують в обидва боки', () => {
  const A = A0();
  for (const k of ['mfi', 'wr', 'srsi', 'crsi', 'wt', 'sqz', 'ichi', 'don']) {
    const s = E.SIG[k](A, g);
    assert.ok(s.includes(1) && s.includes(-1), k);
  }
});

test('Фільтри режиму: ADX (боковик / тренд) і ATR-діапазон без зазирання вперед', () => {
  const A = A0(), gs = [{ ...g, sg: ['rsi'], k: 1, adx: 25, adxm: 1 }, { ...g, sg: ['rsi'], k: 1, adx: 25, adxm: 2 }, { ...g, sg: ['rsi'], k: 1, avl: 0.3, avh: 1.5 }];
  const base = E.entry(A, { ...g, sg: ['rsi'], k: 1 }).filter(Boolean).length;
  for (const gg of gs) {
    const e = E.entry(A, gg), n = e.filter(Boolean).length;
    assert.ok(n > 0 && n < base, `фільтр відсіює частину входів: ${n} з ${base}`);
    const B = A.slice(0, 501).map((x) => ({ ...x }));
    assert.equal(E.entry(B, gg)[500], e[500]);
  }
  const lo = E.entry(A, gs[0]).filter(Boolean).length, hi = E.entry(A, gs[1]).filter(Boolean).length;
  assert.ok(lo + hi <= base, 'боковик і тренд не перетинаються');
});

test('Сирі значення нових індикаторів не залежать від майбутніх свічок', () => {
  const A = A0(), c = A.map((x) => x.c), F = {
    mfi: (X) => E.mfi(X, 14), willr: (X) => E.willr(X, 14), srsi: (X) => E.stochRsi(X.map((x) => x.c), 14), crsi: (X) => E.crsi(X.map((x) => x.c)),
    wt1: (X) => E.waveTrend(X)[0], wt2: (X) => E.waveTrend(X)[1], sqv: (X) => E.squeeze(X).val, sqo: (X) => E.squeeze(X).on, ichi: (X) => E.ichimoku(X), adx: (X) => E.adx(X, 14) };
  void c;
  for (const [k, f] of Object.entries(F)) { const full = f(A);
    for (const cut of [150, 333, 520]) assert.equal(f(A.slice(0, cut + 1))[cut], full[cut], `${k} на свічці ${cut}`); }
});
