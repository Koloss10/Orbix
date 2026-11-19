// Ядро серверних ботів: та сама торгова логіка, що й у браузері; стан відновлюється без розбіжностей.
import test from 'node:test';
import assert from 'node:assert/strict';
import { processBot, botConfig, eventText } from '../supabase/functions/runner/core.js';
import { Bot, entry } from '../supabase/functions/runner/engine.js';

const H = 36e5, T0 = Date.UTC(2026, 0, 5);
function series(n, seed = 9) { let s = seed, c = 100; const R = () => (s = (s * 16807) % 2147483647) / 2147483647, o = [];
  for (let i = 0; i < n; i++) { const op = c; c *= 1 + (R() - 0.5) * 0.03; o.push({ t: T0 + i * H, o: op, h: Math.max(op, c) * (1 + R() * 0.01), l: Math.min(op, c) * (1 - R() * 0.01), c, v: 1 }); }
  return o; }
const g = botConfig({ pair: 'BTC/USDT', tf: 1, d: 1, fut: 1, lev: 2, sg: ['rsi', 'bb'], k: 1, rm: 40, orders: 4, base: 20, step: 0.012, mult: 1.3, tp: 0.008, sl: 0.06, _t0: 1, _srv: true, _ex: 'bybit' });

test('botConfig прибирає службові поля й додає ставки бірж', () => {
  assert.equal(g._srv, undefined); assert.equal(g.ftk, 0.0005); assert.equal(g.pair, 'BTC/USDT');
});

test('Новий бот стартує з поточного моменту: історія не програється', () => {
  const cs = series(500), now = cs.at(-1).t + H;
  const r = processBot({ g, state: null, candles: cs, now });
  assert.equal(r.events.length, 0); assert.equal(r.state.b.tr.length, 0); assert.equal(r.state.lt, cs.at(-1).t + H);
});

test('Покроковий запуск (як cron) дає той самий результат, що й один прогін', () => {
  const cs = series(900), start = 400;
  // один прогін: бот створений на свічці start
  const one = processBot({ g, state: null, candles: cs.slice(0, start), now: cs[start - 1].t + H });
  const full = processBot({ g, state: one.state, candles: cs, now: cs.at(-1).t + H });
  // покроково: кожні 5 «хвилин» з'являється не більше однієї нової свічки, сервер бачить лише останні 300
  let st = one.state, evs = [];
  for (let i = start + 1; i <= cs.length; i++) {
    const r = processBot({ g, state: JSON.parse(JSON.stringify(st)), candles: cs.slice(Math.max(0, i - 300), i), now: cs[i - 1].t + H });
    st = r.state; evs.push(...r.events);
  }
  assert.ok(full.state.b.tr.length > 3, 'є угоди');
  assert.equal(st.b.tr.length, full.state.b.tr.length, 'та сама кількість угод');
  assert.ok(Math.abs(st.b.cum - full.state.b.cum) < 1e-9, 'той самий PnL');
  assert.equal(evs.length, full.events.length, 'ті самі події');
});

test('Події відповідають угодам рушія (вхід, докупівлі, вихід)', () => {
  const cs = series(900), one = processBot({ g, state: null, candles: cs.slice(0, 400), now: cs[399].t + H });
  const r = processBot({ g, state: one.state, candles: cs, now: cs.at(-1).t + H });
  const opens = r.events.filter(e => e.kind === 'open').length, exits = r.events.filter(e => ['close', 'sl', 'liq'].includes(e.kind)).length;
  assert.equal(exits, r.state.b.tr.length); assert.ok(opens === exits || opens === exits + 1);
  assert.ok(r.events.every(e => e.t > one.state.lt));
  assert.match(eventText(r.events[0], g), /^Orbix \(сервер\): BTC\/USDT Long/);
});

test('Незакрита свічка не обробляється', () => {
  const cs = series(450), one = processBot({ g, state: null, candles: cs.slice(0, 400), now: cs[399].t + H });
  const r = processBot({ g, state: one.state, candles: cs, now: cs.at(-1).t + H / 2 });
  assert.equal(r.state.lt, cs.at(-2).t + H);
});

test('Обробка не змінює переданий стан', () => {
  const cs = series(900), one = processBot({ g, state: null, candles: cs.slice(0, 400), now: cs[399].t + H });
  const snap = JSON.stringify(one.state);
  processBot({ g, state: one.state, candles: cs, now: cs.at(-1).t + H });
  assert.equal(JSON.stringify(one.state), snap);
});

test('Пауза: свічки, що закрилися під час паузи, пропускаються — після зняття нічого не дограється', () => {
  const cs = series(900), start = 400, t0 = cs[start - 1].t + H;
  const one = processBot({ g, state: null, candles: cs.slice(0, start), now: t0 });
  const pA = cs[500].t + H, pB = cs[800].t + H; // пауза між свічками 500 і 800
  const spans = [[t0 - 1, pA], [pB, null]];
  const r = processBot({ g, state: one.state, candles: cs, now: cs.at(-1).t + H, spans });
  assert.ok(r.events.length > 0);
  assert.ok(r.events.every((e) => e.t <= pA || e.t > pB), 'жодної події під час паузи');
  const full = processBot({ g, state: one.state, candles: cs, now: cs.at(-1).t + H });
  assert.ok(full.events.some((e) => e.t > pA && e.t <= pB), 'без пауз події в цей час були б');
  assert.equal(r.state.lt, cs.at(-1).t + H);
});

test('Часткова фіксація TP (s1) дає подію «part» з часткою — щоб закрити її й на біржі', () => {
  const gp = botConfig({ pair: 'BTC/USDT', tf: 1, d: 1, fut: 1, lev: 1, sg: ['rsi'], k: 1, orders: 3, base: 20, tp: 0.01, s1: 0.5, tp2: 0.02, sl: 0.06 });
  const pos = { q: 0.2, cost: 20, n: 1, last: 100, first: 100, peak: 100, real: 0, fd: 0, t1: 0, f: [{ t: T0, p: 100, k: 'e' }] };
  const c = { t: T0 + H, o: 100, h: 101.2, l: 99.9, c: 100.8, v: 1 };
  const r = processBot({ g: gp, state: { b: { pos, tr: [], cd: 0, cum: 0 }, lt: T0 + H }, candles: [c], now: T0 + 2 * H });
  assert.equal(r.events.length, 1);
  const ev = r.events[0];
  assert.equal(ev.kind, 'part'); assert.ok(Math.abs(ev.share - 0.5) < 1e-9); assert.equal(ev.price, 101);
  assert.ok(r.state.b.pos.t1 && Math.abs(r.state.b.pos.q - 0.1) < 1e-12, 'у моделі лишилась половина');
  assert.match(eventText(ev, gp), /часткова фіксація TP: закрито 50 %/);
});

test('Ліміт ризику (entryOk: false): нових угод немає, пропущені сигнали пораховано; відкрита позиція веде себе як завжди', () => {
  const cs = series(900), start = 400;
  const one = processBot({ g, state: null, candles: cs.slice(0, start), now: cs[start - 1].t + H });
  const free = processBot({ g, state: one.state, candles: cs, now: cs.at(-1).t + H });
  const opens = free.events.filter((e) => e.kind === 'open').length;
  assert.ok(opens >= 3, 'без ліміту бот відкриває угоди');
  assert.equal(free.skipped, 0);
  const blk = processBot({ g, state: one.state, candles: cs, now: cs.at(-1).t + H, entryOk: false });
  assert.equal(blk.events.filter((e) => e.kind === 'open').length, 0, 'з лімітом нових угод немає');
  assert.ok(blk.skipped >= opens, 'сигнали входу пораховано як пропущені');
  assert.equal(blk.state.b.tr.length, 0); assert.equal(blk.state.b.pos, null);
  // позиція, відкрита до ліміту, докуповується й закривається як без ліміту
  let st = one.state, i0 = start;
  for (; i0 < cs.length && !st.b.pos; i0++) st = processBot({ g, state: st, candles: cs.slice(0, i0 + 1), now: cs[i0].t + H }).state;
  assert.ok(st.b.pos, 'знайшовся відкритий вхід');
  const a = processBot({ g, state: st, candles: cs, now: cs.at(-1).t + H });
  const b = processBot({ g, state: st, candles: cs, now: cs.at(-1).t + H, entryOk: false });
  const firstClose = (r) => r.events.findIndex((e) => e.kind === 'close' || e.kind === 'sl' || e.kind === 'liq');
  const ia = firstClose(a), ib = firstClose(b);
  assert.ok(ia >= 0 && ib >= 0, 'угоду закрито');
  assert.deepEqual(b.events.slice(0, ib + 1), a.events.slice(0, ia + 1), 'до закриття відкритої угоди події ті самі');
  assert.equal(b.events.slice(ib + 1).filter((e) => e.kind === 'open').length, 0, 'після закриття нових угод немає');
});

test('Зупинка після N угод на сервері: лічильник угод зберігається між запусками', () => {
  const cs = series(900), start = 400, gm = { ...g, maxd: 2 };
  let st = processBot({ g: gm, state: null, candles: cs.slice(0, start), now: cs[start - 1].t + H }).state, opens = 0;
  for (let i = start + 1; i <= cs.length; i++) {
    const r = processBot({ g: gm, state: st, candles: cs.slice(Math.max(0, i - 300), i), now: cs[i - 1].t + H, keepTrades: 1 });
    opens += r.events.filter((e) => e.kind === 'open').length; st = r.state;
  }
  // keepTrades: 1 — список угод обрізано, але nd рахує всі закриті угоди
  assert.ok(st.b.nd >= 2, `nd = ${st.b.nd}`); assert.equal(st.b.tr.length, 1);
  assert.equal(opens, 2, 'відкрито рівно 2 угоди');
  assert.equal(st.b.nd, 2); assert.equal(st.b.pos, null);
});

test('Реінвест: подія входу несе множник bf, коли є прибуток', () => {
  const cs = series(900), start = 400, gr = { ...g, rv: 1 };
  const one = processBot({ g: gr, state: null, candles: cs.slice(0, start), now: cs[start - 1].t + H });
  const r = processBot({ g: gr, state: one.state, candles: cs, now: cs.at(-1).t + H });
  const opens = r.events.filter((e) => e.kind === 'open');
  assert.ok(opens.length >= 2);
  assert.equal(opens[0].bf, undefined, 'перша угода — без прибутку, без множника');
  assert.ok(opens.some((e) => e.bf > 1), 'після прибуткових угод множник > 1');
});
