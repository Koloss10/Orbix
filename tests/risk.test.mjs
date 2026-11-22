// Ліміти ризику серверних ботів (runner/risk.js): розмір угоди, загальний ліміт, денний збиток.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEF_LIMITS, dayStart, ladderNotional, limitsOf, realizedSince, riskBlock } from '../supabase/functions/runner/risk.js';

const NOW = Date.UTC(2026, 10, 18, 15), D0 = dayStart(NOW), H = 36e5;
const G = (o = {}) => ({ pair: 'TON/USDT', tf: 1, base: 10, lev: 3, orders: 3, mult: 1.5, ...o });
const bot = (g, st = {}) => ({ g, state: { b: { pos: null, tr: [] }, ...st } });
const withPos = (g) => bot(g, { b: { pos: { q: 1 }, tr: [] } });

test('Драбина: вхід і всі докупівлі з плечем', () => {
  assert.equal(ladderNotional(G()), 10 * 3 * (1 + 1.5 + 2.25));
  assert.equal(ladderNotional(G({ lev: undefined, orders: 1 })), 10);
  assert.ok(Math.abs(ladderNotional({ base: 10, lev: 3, orders: 8, mult: 1.7 }) - 2946.75) < 0.01, 'DOGE з живих даних');
});

test('Ліміти з профілю: null або 0 — вимкнено; профілю немає — за замовчуванням', () => {
  assert.deepEqual(limitsOf({ risk_max_pos: 3000, risk_max_total: null, risk_day_loss: '150' }), { maxPos: 3000, maxTotal: 0, dayLoss: 150 });
  assert.deepEqual(limitsOf(undefined), DEF_LIMITS);
  assert.equal(riskBlock({ limits: limitsOf({}), self: bot(G({ base: 1e6 })), now: NOW }), null, 'усе вимкнено — не блокує');
});

test('Ліміт угоди: драбина бота більша — блок; рівна — можна', () => {
  const L = ladderNotional(G());
  assert.equal(riskBlock({ limits: { maxPos: L }, self: bot(G()), now: NOW }), null);
  const b = riskBlock({ limits: { maxPos: L - 1 }, self: bot(G()), now: NOW });
  assert.equal(b.k, 'pos'); assert.match(b.t, /драбина бота 143 USDT більша за ліміт угоди 142 USDT/);
});

test('Загальний ліміт: рахуються лише інші боти з відкритою позицією', () => {
  const L = ladderNotional(G()), peers = [withPos(G()), withPos(G({ base: 20 })), bot(G({ base: 1000 }))];
  const busy = L + ladderNotional(G({ base: 20 }));
  assert.equal(riskBlock({ limits: { maxTotal: busy + L }, self: bot(G()), peers, now: NOW }), null, 'рівно в ліміт');
  const b = riskBlock({ limits: { maxTotal: busy + L - 1 }, self: bot(G()), peers, now: NOW });
  assert.equal(b.k, 'total'); assert.match(b.t, /інші боти вже зайняли 428 USDT/);
});

test('Денний збиток: дані біржі (xr.l) мають перевагу, лише поточна доба UTC', () => {
  const xr = { l: [{ t: D0 - 1, pnl: -500 }, { t: D0 + H, pnl: -80 }, { t: D0 + 2 * H, pnl: -20 }] };
  assert.equal(realizedSince(G(), { xr, b: { tr: [{ ts: D0, pnl: -999 }] } }, D0), -100, 'вчорашнє не рахується, модель ігнорується');
  assert.equal(riskBlock({ limits: { dayLoss: 101 }, self: bot(G(), { xr }), now: NOW }), null);
  const b = riskBlock({ limits: { dayLoss: 100 }, self: bot(G(), { xr }), now: NOW });
  assert.equal(b.k, 'day'); assert.match(b.t, /збиток за сьогодні \(UTC\) 100,00 USDT досяг денного ліміту 100 USDT/);
  // наступна доба — обмеження зникає саме
  assert.equal(riskBlock({ limits: { dayLoss: 100 }, self: bot(G(), { xr }), now: NOW + 864e5 }), null);
});

test('Денний збиток: без даних біржі — угоди моделі (за часом закриття свічки), сумарно з іншими ботами', () => {
  const tr = [{ ts: D0 - H, pnl: -40 }, { ts: D0 - 2 * H, pnl: -1000 }, { ts: D0 + H, pnl: 15 }];
  assert.equal(realizedSince(G(), { b: { tr } }, D0), -25, 'угода зі свічки 23:00–00:00 закрилась сьогодні');
  const peer = bot(G(), { xr: { l: [{ t: D0 + 5, pnl: -80 }] } });
  assert.equal(riskBlock({ limits: { dayLoss: 105 }, self: bot(G(), { b: { pos: null, tr } }), peers: [peer], now: NOW }).k, 'day');
  assert.equal(riskBlock({ limits: { dayLoss: 106 }, self: bot(G(), { b: { pos: null, tr } }), peers: [peer], now: NOW }), null);
});

test('Пріоритет причин: спершу денний збиток, потім угода, потім загальний', () => {
  const xr = { l: [{ t: D0 + 1, pnl: -500 }] };
  assert.equal(riskBlock({ limits: { dayLoss: 100, maxPos: 1, maxTotal: 1 }, self: bot(G(), { xr }), now: NOW }).k, 'day');
  assert.equal(riskBlock({ limits: { maxPos: 1, maxTotal: 1 }, self: bot(G()), now: NOW }).k, 'pos');
});

// ---------- реінвест і ручні докупівлі враховуються в лімітах ----------
import { addCap, exposure, nextLadder } from '../supabase/functions/runner/risk.js';
const gr = { base: 100, lev: 2, mult: 1, orders: 5, rv: 1 }; // драбина = 100·2·5 = 1000 USDT

test('Реінвест збільшує повну драбину нової угоди: ліміт угоди бачить її', () => {
  // M = base·orders = 500; cum = 250 → bf = 1 + 1·250/500 = 1.5 → драбина 1500
  assert.equal(nextLadder(gr, { b: { cum: 250 } }), 1500);
  assert.equal(nextLadder(gr, { b: { cum: -50 } }), 1000, 'збиток не зменшує');
  assert.equal(nextLadder({ ...gr, rv: 0 }, { b: { cum: 250 } }), 1000, 'без реінвесту');
  assert.equal(riskBlock({ limits: { maxPos: 1200 }, self: { g: gr, state: { b: { cum: 0 } } } }), null, 'без прибутку 1000 ≤ 1200');
  const b = riskBlock({ limits: { maxPos: 1200 }, self: { g: gr, state: { b: { cum: 250 } } } });
  assert.equal(b && b.k, 'pos', '1500 > 1200 після реінвесту');
});

test('Експозиція відкритої позиції: bf драбини й фактична вартість з ручними докупівлями', () => {
  assert.equal(exposure(gr, { b: { pos: { bf: 1.5, cost: 300 } } }), 1500);
  assert.equal(exposure(gr, { b: { pos: { cost: 400 } } }), 1000);
  assert.equal(exposure(gr, { b: { pos: { cost: 2600 } } }), 2600, 'ручна докупівля понад драбину');
  assert.equal(exposure(gr, { b: {} }), 1000);
});

test('Загальний ліміт: сусід з реінвестом або ручною докупівлею займає більше', () => {
  const self = { g: { ...gr, rv: 0 }, state: { b: { cum: 0 } } };
  const peerPlain = { g: gr, state: { b: { pos: { cost: 100 } } } }, peerBig = { g: gr, state: { b: { pos: { cost: 2600 } } } };
  assert.equal(riskBlock({ limits: { maxTotal: 2500 }, self, peers: [peerPlain] }), null, '1000 + 1000 ≤ 2500');
  assert.equal(riskBlock({ limits: { maxTotal: 2500 }, self, peers: [peerBig] }).k, 'total', '2600 + 1000 > 2500');
});

test('Стеля ручної докупівлі: min(ліміт угоди, ліміт загальний мінус сусіди)', () => {
  const peer = { g: gr, state: { b: { pos: { cost: 300 } } } };
  assert.equal(addCap({}, []), 0, 'без лімітів — без обмеження');
  assert.equal(addCap({ maxPos: 3000 }, []), 3000);
  assert.equal(addCap({ maxPos: 3000, maxTotal: 8000 }, [peer]), 3000);
  assert.equal(addCap({ maxPos: 3000, maxTotal: 3500 }, [peer]), 2500, '3500 − 1000 сусіда');
});
