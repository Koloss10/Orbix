// Нейтральний бот (g.d = 0): напрям угоди обирається на вході за сигналами; далі угода веде себе
// точно як у бота з фіксованим напрямом (докупівлі, TP, SL, PnL, фандінг, вихід за сигналом).
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine } = require('./load-engine');
const E = loadEngine(); E.MD.mode = 'demo';
const H1 = 36e5, T0 = Date.UTC(2026, 0, 5);
const G = (o) => E.normG({ ...E.DEF, pair: 'BTC/USDT', base: 10, lev: 2, orders: 4, step: 0.02, smul: 1.2, mult: 1.5, tp: 0.012, sl: 0.08, d: 0, ...o });
const strip = (tr) => JSON.stringify(tr.map(({ i, ts, pnl, n, liq, sl, f }) => ({ i, ts, pnl, n, liq, sl, f })));
const series = () => E.aggC(E.DT['BTC/USDT'] || (E.auto({ pair: 'BTC/USDT', ex: 'Binance', amt: 0, per: 100, tf: 1, dr: 1, fut: 1, lev: 1 }), E.DT['BTC/USDT']), 1).slice(-3000);

for (const d of [1, -1]) {
  const side = d > 0 ? 'Long' : 'Short';
  test(`Нейтральний бот, що входить у ${side}, торгує так само, як ${side}-бот`, () => {
    const A = series(), en = A.map((_, i) => (i % 97 === 5 ? true : false));
    const fixed = E.run(A, en, G({ d }), 0, 1, 0), neu = E.run(A, en.map((v) => (v ? d : 0)), G({ d: 0 }), 0, 1, 0);
    assert.deepEqual([...neu.eq], [...fixed.eq], 'крива капіталу з відкритими позиціями');
    assert.ok(fixed.b.tr.length > 5, 'угоди є');
    assert.equal(strip(neu.b.tr), strip(fixed.b.tr));
    assert.ok(Math.abs(neu.last - fixed.last) < 1e-9, 'кінцевий результат');
    if (neu.b.pos) assert.equal(neu.b.pos.d, d);
  });
}

test('entry(): Long там, де сигнали Long, Short — де Short, суперечливі — без входу', () => {
  const A = series(), g = G({ sg: ['ema', 'rsi'], k: 1 });
  const L = E.entry(A, { ...g, d: 1 }), S = E.entry(A, { ...g, d: -1 }), N = E.entry(A, g);
  let nl = 0, ns = 0;
  for (let i = 0; i < A.length; i++) {
    const want = L[i] && !S[i] ? 1 : S[i] && !L[i] ? -1 : 0;
    assert.equal(N[i], want, `свічка ${i}`); nl += want > 0; ns += want < 0;
  }
  assert.ok(nl > 0 && ns > 0, 'є входи в обидва боки');
  assert.ok(L.some((v, i) => v && S[i]), 'є суперечливі свічки — вони без входу');
});

test('Нейтральний бот у бектесті відкриває угоди в обидва боки', () => {
  const A = series(), g = G({ sg: ['rsi', 'bb'], k: 1 }), e = E.entry(A, g), b = new E.Bot(g), ds = new Set();
  A.forEach((r, i) => { const p0 = b.pos; b.step(i, r, e[i]); if (!p0 && b.pos) ds.add(b.pos.d); });
  assert.ok(b.tr.length > 4); assert.ok(ds.has(1) && ds.has(-1), 'обидва напрями');
});

test('Вихід за сигналом для нейтрального бота: Short закривається Long-сигналом індикатора', () => {
  const A = series(), g = G({ sg: ['rsi'], k: 1, xs: 'rsi', tp: 0.2, sl: 0.3 }), e = E.entry(A, g);
  assert.ok(e.x && e.x.some((v) => v === 1) && e.x.some((v) => v === -1));
  const R = E.run(A, e, g, 0, 0, 0), xs = R.b.tr.filter((t) => t.xs);
  assert.ok(xs.length > 0, 'є виходи за сигналом');
  // той самий результат, що й у Short-бота з тими самими входами
  const only = e.map((v) => (v === -1 ? -1 : 0)), onlyS = e.map((v) => v === -1);
  const ex = Object.assign(only.slice(), {}); Object.defineProperty(ex, 'x', { value: e.x }); Object.defineProperty(onlyS, 'x', { value: e.x.map((v) => v === 1) });
  const a = E.run(A, ex, g, 0, 0, 0), b = E.run(A, onlyS, G({ ...g, d: -1 }), 0, 0, 0);
  assert.equal(strip(a.b.tr), strip(b.b.tr));
});

test('Рівні драбини для нейтрального бота без угоди — як у Long (не пласка драбина)', () => {
  const L = E.lv(G({}), 100).L.map((x) => x.p);
  assert.ok(L[1] < L[0] && L[2] < L[1]);
});

test('Фандінг: нейтральний Short платить/отримує як Short-бот', () => {
  const A = series().slice(0, 300), fr = A.filter((_, i) => i % 8 === 0).map((c) => ({ t: c.t, r: 0.0005 }));
  const play = (g, en) => { const b = new E.Bot(g, fr, null); A.forEach((r, i) => b.step(i, r, i === 10 ? en : false)); return b; };
  const a = play(G({ d: -1, tp: 0.5, sl: 0.5 }), true), b = play(G({ d: 0, tp: 0.5, sl: 0.5 }), -1);
  assert.ok(a.pos && b.pos && b.pos.d === -1);
  assert.ok(Math.abs(a.pos.fd - b.pos.fd) < 1e-12 && a.pos.fd !== 0, `фандінг ${a.pos.fd} / ${b.pos.fd}`);
});
