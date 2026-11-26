// Закриття в беззбиток (g.bz): останні bz ордерів закриваються, коли ціна повертається до беззбитку всієї позиції;
// їхні рівні знову в сітці; решта позиції йде до TP.
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine } = require('./load-engine');
const E = loadEngine();
const H = 36e5, T0 = Date.UTC(2026, 0, 5);
const G = (o) => E.normG({ ...E.DEF, pair: 'BTC/USDT', base: 10, lev: 1, orders: 4, step: 0.02, smul: 1, mult: 1.5, tp: 0.02, sl: 0.2, trail: 0, d: 1, bz: 2, ...o });
const bar = (i, o, h, l, c) => ({ t: T0 + i * H, o, h, l, c, v: 1 });
function play(g, path) { const b = new E.Bot(g); path.forEach(([o, h, l, c], i) => b.step(i, bar(i, o, h, l, c), i === 0)); return b; }
const down = [[100, 100, 100, 100], [100, 100, 98, 98.5], [98.5, 98.5, 96, 96.2], [96.2, 96.2, 94, 94.5]]; // вхід 100, докупівлі 98, 96.04, 94.12

test('Беззбиток: 4 ордери → відскок до беззбитку закриває 2 останні, середня та сама, PnL ≈ 0', () => {
  const g = G({}), b = play(g, down);
  assert.equal(b.pos.n, 4); const avg = b.pos.cost / b.pos.q, q4 = b.pos.q, l = b.pos.lots.slice();
  const b2 = play(g, [...down, [94.5, 97.5, 94.5, 97.4]]);
  assert.equal(b2.pos.n, 2, 'лишилось 2 ордери'); assert.ok(Math.abs(b2.pos.q - (q4 - l[2] - l[3])) < 1e-12);
  assert.ok(Math.abs(b2.pos.cost / b2.pos.q - avg) < 1e-9, 'середня ціна не змінилась');
  const pnl = b2.eqv({ c: b2.pos.f.at(-1).p }) - b2.cum; assert.ok(Math.abs(pnl) < 0.02, `PnL усієї позиції ≈ 0 у момент закриття: ${pnl}`);
  assert.equal(b2.pos.f.at(-1).k, 'b'); assert.equal(b2.tr.length, 0, 'угода не закрита');
  assert.ok(Math.abs(b2.pos.last - 98) < 1e-9, 'наступна докупівля — знову на рівні ордера 3');
});

test('Беззбиток: нова просадка — докупівлі на тих самих рівнях, ще один цикл; TP закриває решту з прибутком', () => {
  const g = G({}), path = [...down, [94.5, 97.5, 94.5, 97.4], [97.4, 97.4, 95.9, 96], [96, 96, 93.9, 94.2], [94.2, 97.2, 94.2, 97.1]];
  const b = play(g, path), fe = b.pos.f.filter((e) => e.k === 'e').map((e) => +e.p.toFixed(4)), bz = b.pos.f.filter((e) => e.k === 'b').length;
  assert.equal(bz, 2, 'два цикли беззбитку'); assert.deepEqual(fe.slice(4), fe.slice(2, 4), 'повторні докупівлі — на тих самих рівнях');
  const b2 = play(g, [...path, [97.1, 110, 97.1, 109]]);
  assert.equal(b2.pos, null); assert.equal(b2.tr.length, 1); assert.ok(b2.tr[0].pnl > 0, 'TP у плюсі');
});

test('Беззбиток не діє, поки виконано не більше bz ордерів, і за bz = 0 рушій як раніше', () => {
  const b = play(G({}), [...down.slice(0, 3), [96.2, 99.5, 96.2, 99.4]]);
  assert.equal(b.pos.n, 1, '3 ордери, bz 2: n > bz — закрито 2 останні');
  const x = play(G({ bz: 3 }), [...down.slice(0, 3), [96.2, 98.9, 96.2, 98.8]]);
  assert.equal(x.pos.n, 3, 'bz 3 при 3 ордерах — без закриття');
  const z = play(G({ bz: 0 }), [...down, [94.5, 97.5, 94.5, 97.4]]); assert.equal(z.pos.n, 4); assert.equal(z.pos.lots, undefined);
});
