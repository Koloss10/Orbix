// Віконце угоди на картці бота (src/js/13-deal-view.js): розрахунок рівнів збігається з рушієм (Bot.step)
// і зі стопом, який сервер ставить на біржі (runner/mirror.js slStop).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { slStop } from '../supabase/functions/runner/mirror.js';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = path.join(root, 'src/js');
const mods = fs.readdirSync(dir).filter((f) => /^0\d-.*\.js$/.test(f)).sort().concat('13-deal-view.js');
const code = mods.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n') + '\n;({Bot,DEF,normG,dealPlan,botSt,vwOk})';
const E = vm.runInContext(code, vm.createContext({ console, Math, Date, JSON, Array, Object, Number, String, Set, Map, Promise, Proxy, isFinite, Infinity, NaN, setTimeout, clearTimeout, AbortController, indexedDB: undefined, fetch: undefined }));

const H = 36e5, T0 = Date.UTC(2026, 0, 5);
const C = (i, o, h, l, c) => ({ t: T0 + i * H, o, h, l, c, v: 1 });
const G = (o) => E.normG({ ...E.DEF, pair: 'BTC/USDT', base: 10, lev: 3, orders: 5, step: 0.02, smul: 1.2, mult: 1.5, tp: 0.012, sl: 0.08, trail: 0, s1: 0, d: 1, ...o });
const near = (a, b, m = '') => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${m}: ${a} ≠ ${b}`);
/* відкрити угоду й виконати одну докупівлю */
function deal(g) {
  const b = new E.Bot(g, null, null), d = g.d;
  b.step(0, C(0, 100, 100, 100, 100), true);
  const x = 100 * (1 - d * g.step) - d * 0.01;
  b.step(1, d > 0 ? C(1, 100, 100, x, 99) : C(1, 100, x, 100, 101), false);
  assert.equal(b.pos.n, 2, 'одна докупівля виконана');
  return b;
}

for (const d of [1, -1]) {
  const side = d > 0 ? 'Long' : 'Short';
  test(`${side}: PnL як у рушія, наступний ордер — саме там, де рушій докупить`, () => {
    const g = G({ d }), b = deal(g), px = d > 0 ? 98.5 : 101.5, P = E.dealPlan(g, b.pos, px);
    near(P.pnl, b.eqv({ c: px }) - b.cum, 'PnL');
    near(P.avg, b.pos.cost / b.pos.q, 'середня');
    near(P.tp, P.avg * (1 + d * g.tp), 'TP');
    assert.equal(P.done.length, 2); assert.equal(P.next.k, 3); assert.equal(P.n, 2);
    // ціна торкається наступного рівня — рушій докуповує саме за ним
    const lvl = P.next.p, b2 = deal(g);
    b2.step(2, d > 0 ? C(2, 99, 99, lvl, lvl) : C(2, 101, lvl, 101, lvl), false);
    assert.equal(b2.pos.n, 3); near(b2.pos.last, lvl, 'ціна докупівлі');
    near(P.next.m, g.base * g.mult ** 2, 'маржа ордера 3');
  });

  test(`${side}: кінцевий SL — як стоп на біржі (slStop)`, () => {
    const g = G({ d }), b = deal(g), P = E.dealPlan(g, b.pos, 100);
    const rest = P.rest.map((o) => ({ price: o.p, qty: o.m * g.lev / o.p }));
    near(P.sl, slStop(g, { q: b.pos.q, avg: b.pos.cost / b.pos.q }, rest), 'SL');
    assert.ok(P.rest.every((o) => o.ok), 'з SL 8 % усі докупівлі досяжні');
  });
}

test('Недосяжні докупівлі (за SL) не враховуються; SL — від середньої після останньої досяжної', () => {
  const g = G({ sl: 0.03 }), b = deal(g), P = E.dealPlan(g, b.pos, 99);
  assert.ok(P.rest.some((o) => !o.ok), 'частина рівнів за стопом');
  const ok = P.rest.filter((o) => o.ok), q = b.pos.q + ok.reduce((a, o) => a + o.m * g.lev / o.p, 0), c = b.pos.cost + ok.reduce((a, o) => a + o.m * g.lev, 0);
  near(P.sl, (c / q) * (1 - g.sl));
  assert.equal(P.next, ok[0] || null);
});

test('Трейлінг: ціль — рівень трейлінг-стопу від піку; після TP1 докупівель немає', () => {
  const g = G({ trail: 0.01 }), b = deal(g); b.pos.ta = 1; b.pos.peak = 104;
  const P = E.dealPlan(g, b.pos, 103.5);
  assert.equal(P.tpKind, 'trail'); near(P.tp, 104 * 0.99);
  const g2 = G({ s1: 0.5, tp2: 0.03, be: 1 }), b2 = deal(g2); b2.pos.t1 = 1; b2.pos.a1 = 99; b2.pos.be = 99;
  const P2 = E.dealPlan(g2, b2.pos, 100);
  assert.equal(P2.rest.length, 0); assert.equal(P2.next, null); near(P2.tp, 99 * 1.03); near(P2.sl, 99);
});

test('Статус бота: помилка, зупинено, в угоді, очікує сигнал', () => {
  const x = (o) => ({ on: true, g: { maxd: 0 }, b: { pos: null, nd: 0 }, ...o });
  assert.deepEqual([...E.botSt(x({ b: { pos: { q: 1 } } }))], ['deal', 'В угоді']);
  assert.deepEqual([...E.botSt(x({}))], ['wait', 'Очікує сигнал']);
  assert.deepEqual([...E.botSt(x({ on: false, b: { pos: { q: 1 } } }))], ['stop', 'Зупинено']);
  assert.deepEqual([...E.botSt(x({ g: { maxd: 3 }, b: { pos: null, nd: 3 } }))], ['stop', 'Зупинено']);
  assert.deepEqual([...E.botSt(x({ srvSa: 1 }))], ['stop', 'Зупинено']);
  assert.equal(E.vwOk('board'), 'board'); assert.equal(E.vwOk('<x>'), 'ladder');
});
