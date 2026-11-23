// Виконання угод серверного бота на демо-біржі: ордери на біржі й захист від повторів (фейкова біржа).
import test from 'node:test';
import assert from 'node:assert/strict';
import { actionsFor, execute, guard, handleBot, ladder, linkBase, linkId, onReconcile, park, protect, reconcile, restore, snapshot, sync, topUp, MAX_TRIES, RUN_GAP, XR_KEEP } from '../supabase/functions/runner/mirror.js';
import { botConfig } from '../supabase/functions/runner/core.js';
import { Bot } from '../supabase/functions/runner/engine.js';

const BOT = '5dcac020-795d-450f-8a9e-fe9ca731dc22', T = Date.UTC(2026, 10, 16, 0);
const g = botConfig({ pair: 'TON/USDT', tf: 24, d: 1, fut: 1, lev: 3, orders: 4, base: 20, step: 0.02, smul: 1.2, mult: 1.5, tp: 0.012, sl: 0.08 });
const F = { step: 0.1, minQty: 0.1, minN: 5, tick: 0.0001 };

/* фейкова біржа Bybit: одна позиція на символ, ордери з унікальним orderLinkId */
function fakeEx({ px = 2.5, native = true } = {}) {
  const S = { px, pos: null, orders: [], calls: [], fills: [] };
  const fill = (side, qty, price) => {
    const sg = side === 'BUY' ? 1 : -1, p = S.pos;
    if (!p) { S.pos = { symbol: 'TONUSDT', amt: sg * qty, entry: price, tp: 0, sl: 0, ts: 0 }; return; }
    if (Math.sign(p.amt) === sg) { const q = Math.abs(p.amt) + qty; p.entry = (p.entry * Math.abs(p.amt) + price * qty) / q; p.amt = sg * q; }
    else { const q = Math.abs(p.amt) - qty; if (q <= 1e-12) S.pos = null; else p.amt = -sg * q; }
  };
  const ex = {
    native, S,
    async positions() { S.calls.push('positions'); return S.pos ? [{ ...S.pos, mark: S.px }] : []; },
    async filt() { return F; },
    async mark() { return S.px; },
    async leverage(_s, l) { S.calls.push('leverage:' + l); },
    async market(symbol, side, qty, reduceOnly, link) {
      if (link && S.orders.some((o) => o.link === link)) { const e = new Error('OrderLinkedID is duplicate'); e.code = 110072; throw e; }
      S.calls.push('market:' + side); S.orders.push({ link, side, qty, price: S.px, status: 'Filled' }); fill(side, qty, S.px);
      return { id: S.orders.length, qty, price: S.px, link };
    },
    async limit(symbol, side, qty, price, link) {
      if (S.orders.some((o) => o.link === link)) { const e = new Error('dup'); e.code = 110072; throw e; }
      S.calls.push('limit'); S.orders.push({ link, side, qty, price, status: 'New' }); return { id: S.orders.length, qty, price, link };
    },
    async byLink(_s, link) { const o = S.orders.find((x) => x.link === link); return o ? { id: 1, qty: o.qty, price: o.price, status: o.status, link } : null; },
    async openOrders() { return S.orders.filter((o) => o.status === 'New').map((o) => ({ link: o.link, price: o.price, qty: o.qty })); },
    async cancel(_s, link) { S.calls.push('cancel'); const o = S.orders.find((x) => x.link === link && x.status === 'New'); if (o) o.status = 'Cancelled'; },
    async cancelAll() { S.calls.push('cancelAll'); for (const o of S.orders) if (o.status === 'New') o.status = 'Cancelled'; },
    async tradingStop(_s, { tp, sl, ts = 0, ap = 0 }) { S.calls.push('tradingStop'); if (ts && S.rejectTs) throw new Error('trailing stop distance invalid'); if (S.pos) { S.pos.tp = tp; S.pos.sl = sl; S.pos.ts = ts; S.pos.ap = ap; } },
    /* ціна дійшла до лімітного ордера */
    hit(price) { S.px = price; for (const o of S.orders) if (o.status === 'New' && (o.side === 'BUY' ? price <= o.price : price >= o.price)) { o.status = 'Filled'; fill(o.side, o.qty, o.price); } },
  };
  return ex;
}
const ctx = { g, symbol: 'TONUSDT', native: true, botId: BOT };
const count = (ex, k) => ex.S.calls.filter((c) => c.startsWith(k)).length;

test('Ідентифікатор ордера незмінний для події і вкладається в 36 символів Bybit', () => {
  const a = linkId(BOT, T, 'd8'), b = linkId(BOT, T, 'd8');
  assert.equal(a, b); assert.ok(a.length <= 36); assert.match(a, /^[A-Za-z0-9-]+$/);
  assert.notEqual(linkId(BOT, T, 'o'), linkId(BOT, T + 864e5, 'o'));
});

test('Драбина докупівель на біржі: рівні моделі, округлені в бік виконання', () => {
  const L = ladder(g, 2.5, F);
  assert.equal(L.length, g.orders - 1);
  // рушій на сервері працює без правил біржі: вхід за 2.5, ціна падає — докупівлі за неокругленими рівнями
  const b = new Bot(g, null, null), cs = [{ t: 0, o: 2.5, h: 2.5, l: 2.5, c: 2.5 }];
  b.step(0, cs[0], true);
  for (let i = 1; i <= 3; i++) { const lo = L[i - 1].price - F.tick; b.step(i, { t: i, o: lo * 1.001, h: lo * 1.001, l: lo, c: lo * 1.0005 }, false); }
  const eng = b.pos.f.slice(1).map((x) => x.p);
  assert.equal(eng.length, 3);
  // Long: лімітний ордер на біржі не нижче рівня моделі й не більше ніж на крок ціни вище — виконується, коли модель докуповує
  eng.forEach((m, i) => { const x = L[i].price; assert.ok(x >= m - 1e-12 && x - m < F.tick, `рівень ${i + 1}: біржа ${x}, модель ${m}`); });
  for (const x of L) assert.ok(Math.abs(x.qty / F.step - Math.round(x.qty / F.step)) < 1e-9, 'кількість кратна кроку біржі');
  // Short — округлення вниз
  const gs = { ...g, d: -1 }, Ls = ladder(gs, 2.5, F), bs = new Bot(gs, null, null);
  bs.step(0, cs[0], true); bs.step(1, { t: 1, o: 2.55, h: 2.7, l: 2.55, c: 2.6 }, false);
  assert.ok(Ls[0].price <= bs.pos.f[1].p + 1e-12 && bs.pos.f[1].p - Ls[0].price < F.tick);
});

test('Вхід із прослизанням: драбина на біржі від ціни входу моделі, ціна біржі — в обліку прослизання', async () => {
  const ex = fakeEx({ px: 2.51 }), fl = {}; // модель увійшла за закриттям свічки 2.5, біржа виконала за 2.51
  await execute(ex, { id: linkId(BOT, T, 'o'), kind: 'open', t: T, notional: 60, price: 2.5 }, { ...ctx, fl });
  const lim = ex.S.orders.filter((o) => o.status === 'New').map((o) => o.price), want = ladder(g, 2.5, F).map((x) => x.price);
  assert.deepEqual(lim, want, 'рівні від 2.5, не від 2.51');
  assert.equal(fl.e0, 2.5); assert.equal(fl.ex, 2.51);
  // дія старої версії без ціни моделі — драбина від ціни на біржі
  const ex2 = fakeEx({ px: 2.51 }), fl2 = {};
  await execute(ex2, { id: linkId(BOT, T, 'o'), kind: 'open', t: T, notional: 60 }, { ...ctx, fl: fl2 });
  assert.equal(fl2.e0, 2.51);
});

test('TP/SL від середньої з округленням до кроку ціни; з трейлінгом TP веде сервер', () => {
  const p = protect(g, 2.4567, F);
  assert.equal(p.tp, 2.4862); assert.equal(p.sl, 2.2601);
  const t = protect({ ...g, trail: 0.01 }, 2.4567, F);
  assert.equal(t.tp, 0); assert.equal(t.ap, 2.4862); assert.equal(t.ts, 0.0249); assert.equal(t.sl, 2.2601);
  assert.deepEqual(protect({ ...g, s1: 0.5 }, 2.4567, F), { tp: 0, sl: 2.2601, ap: 0, ts: 0 }, 'часткова фіксація: на біржі лише SL');
  const s = protect({ ...g, d: -1 }, 2.4567, F); assert.ok(s.tp < 2.4567 && s.sl > 2.4567);
});

test('Вхід: ринковий ордер + лімітні докупівлі + TP/SL на позиції', async () => {
  const ex = fakeEx(), [a] = actionsFor([{ kind: 'open', notional: 60, t: T }], BOT, true);
  const msg = await execute(ex, a, ctx);
  assert.equal(count(ex, 'market'), 1); assert.equal(count(ex, 'limit'), 3); assert.equal(count(ex, 'tradingStop'), 1);
  assert.ok(ex.S.pos.tp > 2.5 && ex.S.pos.sl < 2.5); assert.match(msg, /3 лімітн/);
});

test('Повторний запуск з тією самою дією не створює жодного нового ордера', async () => {
  const ex = fakeEx(), [a] = actionsFor([{ kind: 'open', notional: 60, t: T }], BOT, true);
  await execute(ex, a, ctx); const n = ex.S.orders.length;
  await execute(ex, a, ctx); await execute(ex, a, ctx);
  assert.equal(ex.S.orders.length, n); assert.equal(count(ex, 'market'), 1);
});

test('Після спрацювання докупівлі TP/SL перераховуються від нової середньої', async () => {
  const ex = fakeEx(), [a] = actionsFor([{ kind: 'open', notional: 60, t: T }], BOT, true);
  await execute(ex, a, ctx); const tp0 = ex.S.pos.tp;
  ex.hit(ladder(g, 2.5, F)[0].price);
  const m = await sync(ex, ctx);
  assert.match(m, /захист від середньої/); assert.ok(ex.S.pos.tp < tp0);
  assert.deepEqual(ex.S.pos.tp, protect(g, ex.S.pos.entry, F).tp);
  assert.equal(await sync(ex, ctx), null, 'без змін — без зайвих запитів');
});

test('Біржа закрила позицію за TP — звірка знімає залишки ордерів бота', async () => {
  const ex = fakeEx(), [a] = actionsFor([{ kind: 'open', notional: 60, t: T }], BOT, true);
  await execute(ex, a, ctx); ex.S.pos = null;
  const m = await sync(ex, ctx);
  assert.match(m, /закрито біржею/); assert.equal((await ex.openOrders()).length, 0);
});

test('Закриття: скасування ордерів і reduce-only ринком; повтор нічого не надсилає', async () => {
  const ex = fakeEx(), [o, c] = actionsFor([{ kind: 'open', notional: 60, t: T }, { kind: 'close', pnl: 1, t: T + 864e5 }], BOT, true);
  await execute(ex, o, ctx); await execute(ex, c, ctx);
  assert.equal(ex.S.pos, null); assert.equal((await ex.openOrders()).length, 0);
  const n = ex.S.orders.length; await execute(ex, c, ctx); assert.equal(ex.S.orders.length, n);
});

const run = async (ex, { saveOk = true, state = null, events, now } = {}) => {
  const logs = [], saved = [], notes = [];
  const r = { state: { b: {}, lt: T }, events: events ?? [{ kind: 'open', notional: 60, price: 2.5, t: T }] };
  const res = await handleBot({ bot: { id: BOT, state }, g, r, symbol: 'TONUSDT', mirror: true, native: !!ex?.native, ex, now: now ?? T + 60e3,
    save: async (s) => { saved.push(s); return saveOk; }, log: async (l, m) => logs.push([l, m]), notify: async (m) => notes.push(m) });
  return { res, logs, saved, notes };
};

test('Стан не збережено (паралельний запуск) — жодного звернення до біржі й жодної події', async () => {
  const ex = fakeEx(), { res, logs, notes } = await run(ex, { saveOk: false });
  assert.equal(res.saved, false); assert.equal(ex.S.calls.length, 0); assert.equal(notes.length, 0);
  assert.match(logs[0][1], /Стан не збережено/);
});

test('Черга дій: спершу збереження з дією, після виконання — без неї', async () => {
  const ex = fakeEx(), { saved } = await run(ex);
  assert.equal(saved[0].pend.length, 1); assert.equal(saved.at(-1).pend.length, 0); assert.equal(count(ex, 'market'), 1);
});

test('Помилка біржі: дія лишається в черзі й повторюється, після 5 спроб знімається', async () => {
  const ex = fakeEx(); ex.market = async () => { throw new Error('timeout'); };
  let state = null, last;
  for (let i = 0; i < MAX_TRIES; i++) { last = await run(ex, { state, events: i ? [] : undefined }); state = last.saved.at(-1); }
  assert.equal(state.pend.length, 0); assert.ok(last.notes.some((m) => /знято після 5 спроб/.test(m)));
});

test('Binance Testnet: докупівля дублюється ринковим ордером, без лімітів і TP/SL', async () => {
  const ex = fakeEx({ native: false }), acts = actionsFor([{ kind: 'open', notional: 60, t: T }, { kind: 'dca', notional: 90, n: 2, t: T + 864e5 }], BOT, false);
  for (const a of acts) await execute(ex, a, { ...ctx, native: false });
  assert.equal(count(ex, 'market'), 2); assert.equal(count(ex, 'limit'), 0); assert.equal(count(ex, 'tradingStop'), 0);
  assert.equal(actionsFor([{ kind: 'dca', notional: 90, n: 2, t: T }], BOT, true).length, 0, 'Bybit: докупівля вже стоїть лімітом');
});

test('Бот із трейлінгом: на біржі трейлінг-стоп з активацією на рівні TP і SL', async () => {
  const gt = { ...g, trail: 0.01 }, ex = fakeEx(), [a] = actionsFor([{ kind: 'open', notional: 60, t: T }], BOT, true);
  const msg = await execute(ex, a, { ...ctx, g: gt });
  assert.equal(ex.S.pos.tp, 0); assert.ok(ex.S.pos.ts > 0); assert.ok(ex.S.pos.ap > 2.5); assert.ok(ex.S.pos.sl < 2.5);
  assert.match(msg, /трейлінг/);
  assert.equal(await sync(ex, { ...ctx, g: gt }), null, 'без змін — без зайвих запитів');
  const keep = { ...ex.S.pos }; ex.S.px = keep.ap * 1.02; ex.S.pos.sl = keep.entry * 1.005; // трейлінг біржі активний: стоп уже в прибутку
  const n0 = count(ex, 'tradingStop'); assert.equal(await sync(ex, { ...ctx, g: gt }), null); assert.equal(count(ex, 'tradingStop'), n0, 'активний трейлінг не скидається');
  Object.assign(ex.S.pos, keep);
  ex.S.px = ex.S.pos.ap * 1.001; ex.S.pos.ts = 0; // захист скинули, а ціна вже вище рівня активації
  await sync(ex, { ...ctx, g: gt });
  assert.ok(ex.S.pos.ts > 0); assert.equal(ex.S.pos.ap, 0, 'рівень активації пройдено — трейлінг діє одразу');
});

test('Біржа не прийняла трейлінг: лишається SL, прапорець зберігається й повторів немає', async () => {
  const gt = { ...g, trail: 0.01 }, ex = fakeEx(); ex.S.rejectTs = 1;
  const fl = {}, [a] = actionsFor([{ kind: 'open', notional: 60, t: T }], BOT, true);
  const msg = await execute(ex, a, { ...ctx, g: gt, fl });
  assert.match(msg, /не прийняла трейлінг/); assert.equal(fl.nots, 1); assert.ok(ex.S.pos.sl > 0); assert.equal(ex.S.pos.ts, 0);
  const n = count(ex, 'tradingStop');
  assert.equal(await sync(ex, { ...ctx, g: gt, fl }), null); assert.equal(count(ex, 'tradingStop'), n);
});

test('Ціна вже пройшла TP після докупівлі — позицію закрито ринком, ліміти знято', async () => {
  const ex = fakeEx(), [a] = actionsFor([{ kind: 'open', notional: 60, t: T }], BOT, true);
  await execute(ex, a, ctx);
  ex.hit(ladder(g, 2.5, F)[0].price); ex.S.px = 2.6; // докупівля спрацювала, і ціна відскочила вище нового TP
  const m = await sync(ex, ctx);
  assert.match(m, /пройшла TP/); assert.equal(ex.S.pos, null); assert.equal((await ex.openOrders()).length, 0);
});

test('Ціна вже нижче SL — позицію закрито ринком', async () => {
  const ex = fakeEx(); ex.S.pos = { symbol: 'TONUSDT', amt: 24, entry: 2.5, tp: 0, sl: 0, ts: 0 }; ex.S.px = 2.2;
  const r = await guard(ex, ctx, (await ex.positions())[0], F);
  assert.ok(r.closed); assert.equal(ex.S.pos, null);
});

test('Прапорці бота зберігаються в стані разом із чергою', async () => {
  const gt = { ...g, trail: 0.01 }, ex = fakeEx(); ex.S.rejectTs = 1;
  const saved = [], r = { state: { b: {}, lt: T }, events: [{ kind: 'open', notional: 60, price: 2.5, t: T }] };
  await handleBot({ bot: { id: BOT, state: null }, g: gt, r, symbol: 'TONUSDT', mirror: true, native: true, ex, now: T + 60e3,
    save: async (s) => { saved.push(JSON.parse(JSON.stringify(s))); return true; }, log: async () => {}, notify: async () => {} });
  assert.equal(saved.at(-1).fl.nots, 1); assert.equal(saved.at(-1).pend.length, 0);
});

test('Застарілий сигнал (сервер простоював) на біржу не надсилається, закриття — завжди', async () => {
  const ex = fakeEx(), a = await run(ex, { now: T + 2 * 36e5 });
  assert.equal(ex.S.orders.length, 0); assert.equal(a.saved.at(-1).pend.length, 0); assert.ok(a.logs.some((l) => /застарів/.test(l[1])));
  ex.S.pos = { symbol: 'TONUSDT', amt: 24, entry: 2.5, tp: 0, sl: 0, ts: 0 };
  await run(ex, { now: T + 9 * 36e5, events: [{ kind: 'close', pnl: 1, t: T }] });
  assert.equal(ex.S.pos, null);
});

test('Пауза: знімаються лише лімітні докупівлі цього бота, позиція зі стопом лишається; повтор нічого не робить', async () => {
  const ex = fakeEx(), [a] = actionsFor([{ kind: 'open', notional: 60, t: T }], BOT, true);
  await execute(ex, a, ctx);
  ex.S.orders.push({ link: 'manual-1', side: 'BUY', qty: 1, price: 2.0, status: 'New' }); // чужий ордер користувача
  const m = await park(ex, { symbol: 'TONUSDT', botId: BOT });
  assert.match(m, /знято 3 лімітн/); assert.match(m, /зі стопом/);
  assert.ok(ex.S.pos && ex.S.pos.sl > 0, 'позиція і стоп на місці');
  assert.deepEqual((await ex.openOrders()).map((o) => o.link), ['manual-1'], 'чужі ордери не чіпаються');
  const n = count(ex, 'cancel'); await park(ex, { symbol: 'TONUSDT', botId: BOT }); assert.equal(count(ex, 'cancel'), n);
  ex.S.pos = null; ex.S.orders = [];
  assert.equal(await park(ex, { symbol: 'TONUSDT', botId: BOT }), null, 'нічого немає — без повідомлення');
});

test('Після зняття з паузи прапорець «parked» скидається', async () => {
  const ex = fakeEx(), a = await run(ex, { state: { fl: { parked: 1 }, pend: [] }, events: [] });
  assert.equal(a.saved.at(-1).fl.parked, undefined);
});

test('Звірка: збіг, немає позиції на біржі, зайва позиція, інший обсяг або напрям', () => {
  const mp = { q: 24, cost: 60 };
  assert.equal(reconcile(null, null, g), null);
  assert.equal(reconcile(mp, { amt: 24.5 }, g), null, 'дрібна різниця в межах допуску');
  assert.equal(reconcile(mp, null, g).k, 'nopos');
  assert.equal(reconcile(null, { amt: 24 }, g).k, 'orphan');
  assert.equal(reconcile(mp, { amt: 60 }, g).k, 'size');
  assert.match(reconcile(mp, { amt: -24 }, g).t, /напрям/);
});

const rec = async (st, mp, xp, seen = !!xp, now = T) => {
  const logs = [], notes = [];
  await onReconcile({ fl: st, mp, out: { pos: xp, seen }, g, log: async (l, m) => logs.push([l, m]), notify: async (m) => notes.push(m), now });
  return { logs, notes };
};

test('Розбіжність повідомляється один раз і лише після 2 запусків поспіль; після вирівнювання — запис «усунено»', async () => {
  const fl = {}, xp = { amt: 24 };
  let r = await rec(fl, null, xp); assert.equal(r.notes.length, 0, 'перший запуск — тиша (могла бути затримка)');
  r = await rec(fl, null, xp); assert.equal(r.notes.length, 1); assert.match(r.notes[0], /на Bybit Demo відкрита позиція/);
  r = await rec(fl, null, xp); assert.equal(r.notes.length, 0, 'повторно не надсилається'); assert.equal(fl.mis.n, 3);
  r = await rec(fl, null, null); assert.equal(fl.mis, undefined); assert.match(r.logs[0][1], /усунено/);
});

test('Позицію закрила сама біржа (TP/SL/трейлінг) — це не тривога, але видно на картці', async () => {
  const fl = {}, mp = { q: 24 };
  await rec(fl, mp, { amt: 24 });             // позиція є на біржі й у моделі
  let r = await rec(fl, mp, null);            // біржа закрила за своїм стопом
  r = await rec(fl, mp, null);
  assert.equal(r.notes.length, 0); assert.equal(fl.mis.k, 'xc'); assert.match(fl.mis.t, /закрила біржа/);
  await rec(fl, null, null);                  // модель теж закрила угоду
  assert.equal(fl.mis, undefined); assert.equal(fl.xc, undefined); assert.equal(fl.had, undefined);
});

test('Вхід на біржу не відбувся (позиції там і не було) — тривога після 2 запусків', async () => {
  const fl = {}, mp = { q: 24 };
  await rec(fl, mp, null);
  const r = await rec(fl, mp, null);
  assert.equal(r.notes.length, 1); assert.match(r.notes[0], /модель бота веде позицію/);
});

test('Звірка в handleBot: після входу модель і біржа збігаються — розбіжності немає', async () => {
  const ex = fakeEx(), saved = [], notes = [];
  const r = { state: { b: { pos: { q: 24, cost: 60 } }, lt: T }, events: [{ kind: 'open', notional: 60, price: 2.5, t: T }] };
  await handleBot({ bot: { id: BOT, state: null }, g, r, symbol: 'TONUSDT', mirror: true, native: true, ex, now: T + 60e3,
    save: async (s) => { saved.push(JSON.parse(JSON.stringify(s))); return true; }, log: async () => {}, notify: async (m) => notes.push(m) });
  const st = saved.at(-1);
  assert.equal(st.fl.mis, undefined); assert.equal(st.fl.had, 1, 'позицію на біржі побачено');
  assert.ok(!notes.some((m) => /Звірка/.test(m)));
});

test('Докупівля виконалась на біржі всередині свічки (модель ще не зарахувала) — це не розбіжність', () => {
  const mp = { q: 24, first: 2.5 }, full = ladder(g, 2.5, null).reduce((a, x) => a + x.qty, 0) + 24;
  assert.equal(reconcile(mp, { amt: 24 + ladder(g, 2.5, null)[0].qty }, g), null, 'спрацювала 1-ша лімітна докупівля');
  assert.equal(reconcile(mp, { amt: full }, g), null, 'уся драбина');
  assert.equal(reconcile(mp, { amt: full * 1.6 }, g).k, 'size', 'більше за всю драбину — розбіжність');
  assert.equal(reconcile(mp, { amt: 10 }, g).k, 'size', 'менше, ніж у моделі');
  assert.equal(reconcile({ ...mp, t1: 1 }, { amt: 48 }, g).k, 'size', 'після TP1 докупівель уже немає');
});

test('Зайва позиція проти напрямку бота названа прямо; назва пари однакова в усіх повідомленнях', () => {
  const r = reconcile(null, { amt: -5 }, g);
  assert.equal(r.k, 'orphan'); assert.match(r.t, /TON\/USDT Short \(5\) — проти напрямку бота/);
});

test('Часткова фіксація TP: на біржі закривається та сама частка, лімітні докупівлі знімаються, повтор не дублює', async () => {
  const ex = fakeEx(), open = actionsFor([{ kind: 'open', notional: 60, price: 2.5, t: T }], BOT, true)[0];
  await execute(ex, open, ctx);
  const q0 = Math.abs(ex.S.pos.amt), a = actionsFor([{ kind: 'part', share: 0.5, price: 2.53, t: T + 36e5 }], BOT, true)[0];
  assert.equal(a.kind, 'part'); assert.equal(a.id, linkId(BOT, T + 36e5, 'p'));
  const m = await execute(ex, a, ctx);
  assert.match(m, /частково зафіксовано 12 за/); assert.match(m, /докупівлі знято/);
  assert.equal(Math.abs(ex.S.pos.amt), q0 - 12); assert.equal((await ex.openOrders()).length, 0);
  assert.match(await execute(ex, a, ctx), /частково зафіксовано 12/); assert.equal(Math.abs(ex.S.pos.amt), q0 - 12, 'повтор не закриває ще раз');
});

test('Часткова фіксація не відкидається як застарілий сигнал', async () => {
  const ex = fakeEx(); await execute(ex, actionsFor([{ kind: 'open', notional: 60, price: 2.5, t: T }], BOT, true)[0], ctx);
  const pend = actionsFor([{ kind: 'part', share: 0.5, price: 2.53, t: T }], BOT, true), saved = [];
  await handleBot({ bot: { id: BOT, state: { pend, fl: {} } }, g, r: { state: { b: { pos: { q: 12, t1: 1 } }, lt: T }, events: [] }, symbol: 'TONUSDT', mirror: true, native: true, ex, now: T + 3 * 36e5,
    save: async (s) => { saved.push(JSON.parse(JSON.stringify(s))); return true; }, log: async () => {}, notify: async () => {} });
  assert.equal(Math.abs(ex.S.pos.amt), 12); assert.equal(saved.at(-1).pend.length, 0);
});

test('Прапорці «біржа закрила» належать одній угоді: нова угода без позиції на біржі — справжня тривога', async () => {
  const fl = {}, A = { q: 24, f: [{ t: 1 }] }, B = { q: 24, f: [{ t: 2 }] };
  await rec(fl, A, { amt: 24 }); await rec(fl, A, null);
  assert.equal(fl.mis.k, 'xc');
  await rec(fl, B, null); const r = await rec(fl, B, null);
  assert.equal(fl.mis.k, 'nopos'); assert.equal(r.notes.length, 1);
});

test('Чужа позиція на біржі не робить «біржа закрила» з невдалого входу бота', async () => {
  const fl = {}, mp = { q: 24, f: [{ t: 5 }] };
  await rec(fl, null, { amt: 24 });          // зайва позиція, модель без позиції
  await rec(fl, mp, null); const r = await rec(fl, mp, null); // модель відкрила, а позиції на біржі немає
  assert.equal(fl.mis.k, 'nopos'); assert.equal(r.notes.length, 1);
});

test('Лічильник запусків рахує лише запуски поспіль; попередження на картці — прапорець on', async () => {
  const fl = {}, xp = { amt: 24 };
  await rec(fl, null, xp, true, T);
  await rec(fl, null, xp, true, T + RUN_GAP + 60e3);
  assert.equal(fl.mis.n, 1, 'між запусками була перерва — рахунок спочатку'); assert.equal(fl.mis.on, undefined);
  const r = await rec(fl, null, xp, true, T + RUN_GAP + 6 * 60e3);
  assert.equal(fl.mis.n, 2); assert.equal(fl.mis.on, 1); assert.equal(r.notes.length, 1);
});

test('Без звірки (дублювання вимкнено) давнє попередження знімається', async () => {
  const saved = [];
  await handleBot({ bot: { id: BOT, state: { fl: { mis: { k: 'size', t: 'x', n: 3, on: 1 }, had: 1, tid: 1 } } }, g, r: { state: { b: { pos: null }, lt: T }, events: [] }, symbol: 'TONUSDT', mirror: false, native: false, ex: null, now: T,
    save: async (s) => { saved.push(JSON.parse(JSON.stringify(s))); return true; }, log: async () => {}, notify: async () => {} });
  assert.deepEqual(saved.at(-1).fl, {});
});

test('Після TP1 з беззбитком стоп на біржі переноситься туди ж, куди й у моделі', async () => {
  const gb = { ...g, s1: 0.5, be: 1 };
  assert.equal(protect(gb, 2.5, F, { t1: 1, be: 2.4567 }).sl, 2.4567);
  assert.equal(protect(gb, 2.5, F, { t1: 0, be: 2.4567 }).sl, protect(gb, 2.5, F).sl, 'до TP1 — звичайний стоп');
  const ex = fakeEx(); await execute(ex, actionsFor([{ kind: 'open', notional: 60, price: 2.5, t: T }], BOT, true)[0], { ...ctx, g: gb });
  ex.S.px = 2.53;
  const m = await sync(ex, { ...ctx, g: gb, mp: { q: 12, t1: 1, be: ex.S.pos.entry } });
  assert.match(m, /SL 2\.5/); assert.equal(ex.S.pos.sl, ex.S.pos.entry);
});

test('Зняття з паузи: драбина докупівель повертається на біржу, лише ще не зроблені рівні', async () => {
  const ex = fakeEx(), fl = {}, open = actionsFor([{ kind: 'open', notional: 60, price: 2.5, t: T }], BOT, true)[0];
  await execute(ex, open, { ...ctx, fl });
  assert.equal(fl.lb, linkBase(BOT, T)); assert.equal(fl.e0, 2.5);
  const L = ladder(g, 2.5, F); ex.hit(L[0].price);               // 1-ша докупівля виконалась (модель: n = 2)
  await park(ex, { symbol: 'TONUSDT', botId: BOT });
  assert.equal((await ex.openOrders()).length, 0);
  const m = await restore(ex, { g, symbol: 'TONUSDT', fl, mp: { q: 1, n: 2, t1: 0 } });
  assert.match(m, /відновлено 2 лімітн/);
  assert.deepEqual((await ex.openOrders()).map((o) => o.link), [fl.lb + 'e1x2', fl.lb + 'e1x3']);
  assert.equal(await restore(ex, { g, symbol: 'TONUSDT', fl, mp: { q: 1, n: 2, t1: 0 } }), null, 'усе вже стоїть — нічого не дублюється');
  await park(ex, { symbol: 'TONUSDT', botId: BOT });            // друга пауза — нове покоління ідентифікаторів
  await restore(ex, { g, symbol: 'TONUSDT', fl, mp: { q: 1, n: 2, t1: 0 } });
  assert.deepEqual((await ex.openOrders()).map((o) => o.link), [fl.lb + 'e3x2', fl.lb + 'e3x3']);
});

test('Зняття з паузи: без позиції на біржі, після TP1 або для старої угоди драбина не ставиться', async () => {
  const ex = fakeEx(), fl = { lb: linkBase(BOT, T), e0: 2.5 };
  assert.equal(await restore(ex, { g, symbol: 'TONUSDT', fl, mp: { n: 1 } }), null, 'позиції на біржі немає');
  await execute(ex, actionsFor([{ kind: 'open', notional: 60, price: 2.5, t: T }], BOT, true)[0], ctx);
  await park(ex, { symbol: 'TONUSDT', botId: BOT });
  assert.equal(await restore(ex, { g, symbol: 'TONUSDT', fl, mp: { n: 1, t1: 1 } }), null, 'після TP1 докупівель немає');
  assert.match(await restore(ex, { g, symbol: 'TONUSDT', fl: {}, mp: { n: 1 } }), /не відновлено/);
});

test('handleBot: після паузи драбина відновлюється один раз; угоду закрито — дані драбини прибрано', async () => {
  const ex = fakeEx(), saved = [], logs = [];
  const go = (state, pos) => handleBot({ bot: { id: BOT, state }, g, r: { state: { b: { pos }, lt: T }, events: [] }, symbol: 'TONUSDT', mirror: true, native: true, ex, now: T,
    save: async (s) => { saved.push(JSON.parse(JSON.stringify(s))); return true; }, log: async (_l, m) => logs.push(m), notify: async () => {} });
  const fl = {}; await execute(ex, actionsFor([{ kind: 'open', notional: 60, price: 2.5, t: T }], BOT, true)[0], { ...ctx, fl });
  await park(ex, { symbol: 'TONUSDT', botId: BOT });
  await go({ fl: { ...fl, parked: 1 }, pend: [] }, { q: 24, n: 1, first: 2.5, f: [{ t: T }] });
  assert.ok(logs.some((m) => /відновлено 3 лімітн/.test(m)));
  const st = saved.at(-1); assert.equal(st.fl.rs, undefined); assert.equal(st.fl.parked, undefined); assert.equal(st.fl.rg, 1);
  ex.S.pos = null; ex.S.orders = [];
  await go(st, null);
  const f2 = saved.at(-1).fl; assert.equal(f2.lb, undefined); assert.equal(f2.e0, undefined); assert.equal(f2.rg, undefined);
});

test('Моніторинг: у стані бота знімок біржі (позиція, захист, ордери бота) і остання помилка біржі', async () => {
  const ex = fakeEx(), saved = [];
  const go = (state, pos, events = [], t = T) => handleBot({ bot: { id: BOT, state }, g, r: { state: { b: { pos }, lt: t }, events }, symbol: 'TONUSDT', mirror: true, native: true, ex, now: t,
    save: async (x) => { saved.push(JSON.parse(JSON.stringify(x))); return true; }, log: async () => {}, notify: async () => {} });
  await go(null, { q: 24, n: 1, first: 2.5, f: [{ t: T }] }, [{ kind: 'open', notional: 60, price: 2.5, t: T }]);
  let st = saved.at(-1);
  assert.equal(st.xs.amt, 24); assert.equal(st.xs.entry, 2.5); assert.equal(st.xs.ord, 3);
  assert.ok(st.xs.sl > 0 && st.xs.tp > 0); assert.equal(st.xe, undefined);
  // біржа недоступна — знімок лишається попередній, з'являється помилка
  const pos0 = ex.positions; ex.positions = async () => { throw new Error('timeout'); };
  const n0 = saved.length; await go(st, st.b.pos); st = saved.at(-1);
  assert.ok(saved.length > n0, 'помилка біржі зберігається'); assert.equal(st.xe.m, 'timeout'); assert.equal(st.xs.amt, 24);
  // біржа знову відповідає — помилку знято
  ex.positions = pos0; await go(st, st.b.pos); st = saved.at(-1); assert.equal(st.xe, undefined);
  // без змін на біржі — зайвого збереження немає
  const n1 = saved.length; await go(st, st.b.pos); assert.equal(saved.length, n1 + 1, 'лише обов\'язкове перше збереження');
  // позицію закрито — знімок порожній
  ex.S.pos = null; await go(st, null); st = saved.at(-1); assert.equal(st.xs, null);
  assert.equal(snapshot({ pos: null }), null);
});

test('Моніторинг: без дублювання на біржу знімка й помилки біржі немає', async () => {
  const saved = [];
  await handleBot({ bot: { id: BOT, state: { xs: { amt: 1 }, xe: { m: 'x', at: 1 } } }, g, r: { state: { b: { pos: null }, lt: T }, events: [] }, symbol: 'TONUSDT', mirror: false, native: false, ex: null, now: T,
    save: async (x) => { saved.push(JSON.parse(JSON.stringify(x))); return true; }, log: async () => {}, notify: async () => {} });
  assert.equal(saved.at(-1).xs, undefined); assert.equal(saved.at(-1).xe, undefined);
});

test('Demo проти моделі: сервер записує ціну входу на біржі й закриття позицій за даними біржі', async () => {
  const ex = fakeEx(), saved = [];
  ex.S.closed = []; ex.closedPnl = async (_s, start) => { ex.S.calls.push('closedPnl'); return ex.S.closed.filter((x) => x.t >= start); };
  const go = (state, pos, events = [], t = T) => handleBot({ bot: { id: BOT, state }, g, r: { state: { b: { pos }, lt: t }, events }, symbol: 'TONUSDT', mirror: true, native: true, ex, now: t,
    save: async (x) => { saved.push(JSON.parse(JSON.stringify(x))); return true; }, log: async () => {}, notify: async () => {} });
  // модель увійшла за закриттям свічки 2,49, біржа виконала ринковий ордер за 2,5
  await go(null, { q: 24, n: 1, first: 2.49, f: [{ t: T }] }, [{ kind: 'open', notional: 60, price: 2.49, t: T }]);
  let st = saved.at(-1);
  assert.equal(st.xr.from, T); assert.equal(st.xr.l.length, 0);
  assert.equal(st.xr.en.length, 1); assert.equal(st.xr.en[0].m, 2.49); assert.equal(st.xr.en[0].x, 2.5);
  assert.equal(count(ex, 'closedPnl'), 0, 'поки позиція відкрита, закриття не запитуються');
  // біржа закрила позицію за TP, але запис про закриття з'явиться з затримкою
  ex.S.pos = null;
  await go(st, null, [], T + 5 * 60e3); st = saved.at(-1);
  assert.equal(st.xr.l.length, 0); assert.equal(st.xr.due, 2, 'запитаю ще двічі');
  ex.S.closed.push({ id: 'c1', t: T + 4 * 60e3, pnl: 0.61, q: 24, px: 2.53 }, { id: 'old', t: T - 864e5, pnl: -5, q: 1, px: 1 });
  await go(st, null, [], T + 10 * 60e3); st = saved.at(-1);
  assert.equal(st.xr.l.length, 1, 'чуже давнє закриття (до початку обліку) не враховано'); assert.equal(st.xr.l[0].pnl, 0.61); assert.equal(st.xr.due, undefined);
  // далі без змін на біржі запитів немає, повторно запис не додається
  const n = count(ex, 'closedPnl'); await go(st, null, [], T + 15 * 60e3); st = saved.at(-1);
  assert.equal(count(ex, 'closedPnl'), n); assert.equal(st.xr.l.length, 1);
  // запис так і не з'явився — після 3 спроб облік не запитує біржу щоразу
  st = { ...st, xs: { amt: 24, entry: 2.5 } };
  for (let i = 0; i < 5; i++) { await go(st, null, [], T + (20 + 5 * i) * 60e3); st = saved.at(-1); }
  assert.equal(st.xr.due, undefined); assert.equal(count(ex, 'closedPnl'), n + 3);
  // список обмежено
  st.xr.l = Array.from({ length: XR_KEEP }, (_, i) => ({ id: 'x' + i, t: T + i, pnl: 0, q: 1, px: 1 })); st.xr.due = 1;
  ex.S.closed.push({ id: 'c2', t: T + 3600e3, pnl: 1, q: 1, px: 1 });
  await go(st, null, [], T + 3700e3); st = saved.at(-1);
  assert.equal(st.xr.l.length, XR_KEEP); assert.equal(st.xr.l.at(-1).id, 'c2');
});

test('Demo проти моделі: часткова фіксація теж записується; Binance Testnet облік не веде', async () => {
  const ex = fakeEx(), saved = [];
  ex.S.closed = []; ex.closedPnl = async (_s, start) => ex.S.closed.filter((x) => x.t >= start);
  const go = (exx, state, pos, events = [], t = T, native = true) => handleBot({ bot: { id: BOT, state }, g, r: { state: { b: { pos }, lt: t }, events }, symbol: 'TONUSDT', mirror: true, native, ex: exx, now: t,
    save: async (x) => { saved.push(JSON.parse(JSON.stringify(x))); return true; }, log: async () => {}, notify: async () => {} });
  await go(ex, null, { q: 24, n: 1, first: 2.5, f: [{ t: T }] }, [{ kind: 'open', notional: 60, price: 2.5, t: T }]);
  let st = saved.at(-1);
  ex.S.px = 2.52; ex.S.closed.push({ id: 'p1', t: T + 3600e3 + 1e3, pnl: 0.3, q: 12, px: 2.53 });
  await go(ex, st, { q: 12, n: 1, first: 2.5, t1: 1, f: [{ t: T }] }, [{ kind: 'part', share: 0.5, price: 2.53, t: T + 3600e3 }], T + 3600e3); st = saved.at(-1);
  assert.equal(Math.abs(st.xs.amt), 12); assert.equal(st.xr.l.length, 1); assert.equal(st.xr.l[0].id, 'p1');
  const bn = fakeEx({ native: false });
  await go(bn, null, { q: 24, n: 1, first: 2.5, f: [{ t: T }] }, [{ kind: 'open', notional: 60, price: 2.5, t: T }], T, false);
  assert.equal(saved.at(-1).xr, undefined);
});

test('Залишкова лімітна докупівля після закриття біржею: зайва позиція закривається, нова угода не чіпається', async () => {
  const ex = fakeEx(), saved = [], logs = [];
  const go = (state, pos, events = [], t = T) => handleBot({ bot: { id: BOT, state }, g, r: { state: { b: { pos }, lt: t }, events }, symbol: 'TONUSDT', mirror: true, native: true, ex, now: t,
    save: async (x) => { saved.push(JSON.parse(JSON.stringify(x))); return true; }, log: async (l, m) => logs.push([l, m]), notify: async () => {} });
  const mp = { q: 24, n: 1, first: 2.5, f: [{ t: T }] };
  await go(null, mp, [{ kind: 'open', notional: 60, price: 2.5, t: T }]);
  let st = saved.at(-1);
  // біржа закрила угоду за TP (позиції немає, лімітні докупівлі ще стоять) — сервер позначив xc
  ex.S.pos = null; await go(st, mp, [], T + 5 * 60e3); st = saved.at(-1);
  assert.equal(st.fl.xc, 1);
  // до наступного запуску ціна дійшла до залишкової докупівлі — на біржі зайва позиція
  ex.S.orders.filter((o) => o.status === 'Cancelled').forEach((o) => { o.status = 'New'; }); // ордери ще не зняті
  ex.hit(ladder(g, 2.5, F)[0].price);
  assert.ok(ex.S.pos, 'зайва позиція з\'явилась');
  await go(st, mp, [], T + 10 * 60e3); st = saved.at(-1);
  assert.equal(ex.S.pos, null, 'зайву позицію закрито');
  assert.equal(ex.S.orders.filter((o) => o.status === 'New').length, 0, 'ордери знято');
  assert.ok(logs.some(([l, m]) => l === 'warn' && /залишкова лімітна докупівля/.test(m)));
  // нова угода моделі (інший tid) з позицією на біржі — не зайва, не закривається
  const mp2 = { q: 24, n: 1, first: 2.6, f: [{ t: T + 864e5 }] };
  ex.S.px = 2.6; await go(st, mp2, [{ kind: 'open', notional: 60, price: 2.6, t: T + 864e5 }], T + 864e5 + 60e3);
  assert.ok(ex.S.pos && ex.S.pos.amt > 0, 'нова позиція лишилась');
});

test('Біржа не повернула ціну ринкового ордера — у журналі приблизна ціна, а не «за 0»', async () => {
  const ex = fakeEx(), mk = ex.market.bind(ex);
  ex.market = async (...a) => ({ ...(await mk(...a)), price: 0 });
  await execute(ex, { id: linkId(BOT, T, 'o'), kind: 'open', t: T, notional: 60, price: 2.5 }, ctx);
  const m1 = await execute(ex, { id: linkId(BOT, T + 1e3, 'p'), kind: 'part', t: T + 1e3, share: 0.5 }, ctx);
  assert.match(m1, /частково зафіксовано \S+ за ≈2\.5/); assert.doesNotMatch(m1, / за 0\b/);
  const m2 = await execute(ex, { id: linkId(BOT, T + 2e3, 'c'), kind: 'close', t: T + 2e3 }, ctx);
  assert.match(m2, /позицію закрито за ≈2\.5/);
});

/* ---------- біржа не відповідає на перевірку попереднього ордера / відповідь на ордер загубилась ---------- */
const flaky = (ex) => { const bl = ex.byLink.bind(ex); ex.S.down = 0; ex.byLink = async (...a) => { if (ex.S.down > 0) { ex.S.down--; throw new Error('timeout'); } return bl(...a); }; return ex; };
/* Binance Testnet: newClientOrderId унікальний лише серед ВІДКРИТИХ ордерів — виконаний ринковий можна повторити */
const binanceLike = (ex) => { ex.native = false; ex.market = async function (symbol, side, qty, reduceOnly, link) {
  this.S.calls.push('market:' + side); this.S.orders.push({ link, side, qty, price: this.S.px, status: 'Filled' });
  const sg = side === 'BUY' ? 1 : -1, p = this.S.pos; if (!p) this.S.pos = { symbol, amt: sg * qty, entry: this.S.px, tp: 0, sl: 0, ts: 0 }; else { const q = p.amt + sg * qty; if (Math.abs(q) < 1e-12) this.S.pos = null; else p.amt = q; }
  return { id: this.S.orders.length, qty, price: this.S.px, link }; }; return ex; };
const fills = (ex, link) => ex.S.orders.filter((o) => o.link === link && o.status === 'Filled').length;

test('Біржа не відповіла на перевірку попереднього ордера — новий ордер не надсилається (вхід, докупівля, фіксація, закриття)', async () => {
  for (const native of [true, false]) {
    const ex = flaky(native ? fakeEx() : binanceLike(fakeEx())), c = { ...ctx, native };
    const o = { id: linkId(BOT, T, 'o'), kind: 'open', t: T, notional: 60, price: 2.5 };
    await execute(ex, o, c);
    const n0 = ex.S.orders.length;
    for (const a of [o, { id: linkId(BOT, T + 1e3, 'a2'), kind: 'dca', t: T + 1e3, notional: 30 }, { id: linkId(BOT, T + 2e3, 'p'), kind: 'part', t: T + 2e3, share: 0.5 }, { id: linkId(BOT, T + 3e3, 'c'), kind: 'close', t: T + 3e3 }]) {
      ex.S.down = 1;
      await assert.rejects(execute(ex, a, c), /timeout/, `${a.kind}: помилка перевірки не ковтається`);
      assert.equal(ex.S.orders.length, n0, `${a.kind}: статус невідомий — ордер не надіслано (${native ? 'Bybit' : 'Binance'})`);
    }
    // біржа знову відповідає: повтор входу не дублює його
    await execute(ex, o, c);
    assert.equal(fills(ex, o.id), 1, 'вхід лише один');
  }
});

test('Відповідь біржі загубилась після прийняття ордера — наступний запуск знаходить ордер, дубля немає', async () => {
  for (const native of [true, false]) {
    const ex = flaky(native ? fakeEx() : binanceLike(fakeEx())), mk = ex.market.bind(ex), saved = [], logs = [];
    ex.S.lose = 1; // біржа виконала ордер, але відповідь не дійшла, і перевірка одразу після цього теж не вдалась
    ex.market = async (...a) => { const r = await mk(...a); if (ex.S.lose > 0) { ex.S.lose--; ex.S.down = 1; throw new Error('socket hang up'); } return r; };
    const go = (state, events, t) => handleBot({ bot: { id: BOT, state }, g, r: { state: { b: { pos: { q: 24, n: 1, first: 2.5 } }, lt: t }, events }, symbol: 'TONUSDT', mirror: true, native, ex, now: t,
      save: async (x) => { saved.push(JSON.parse(JSON.stringify(x))); return true; }, log: async (l, m) => logs.push([l, m]), notify: async () => {} });
    await go(null, [{ kind: 'open', notional: 60, price: 2.5, t: T }], T);
    let st = saved.at(-1);
    assert.equal(st.pend.length, 1, 'дія лишилась у черзі');
    const id = st.pend[0].id;
    assert.equal(fills(ex, id), 1);
    await go(st, [], T + 5 * 60e3); st = saved.at(-1);
    assert.equal(st.pend.length, 0, 'наступний запуск завершив дію');
    assert.equal(fills(ex, id), 1, `другого входу немає (${native ? 'Bybit' : 'Binance'})`);
    await go(st, [], T + 10 * 60e3);
    assert.equal(fills(ex, id), 1);
  }
});

test('Відновлення драбини після паузи: перевірка попереднього покоління не вдалася — нових сходинок немає', async () => {
  const ex = flaky(fakeEx()), fl = {};
  await execute(ex, actionsFor([{ kind: 'open', notional: 60, price: 2.5, t: T }], BOT, true)[0], { ...ctx, fl });
  await park(ex, { symbol: 'TONUSDT', botId: BOT });
  const n0 = ex.S.orders.length;
  ex.S.down = 1;
  await assert.rejects(restore(ex, { g, symbol: 'TONUSDT', fl, mp: { q: 1, n: 1, t1: 0 } }), /timeout/);
  assert.equal(ex.S.orders.length, n0, 'нічого не поставлено');
  // handleBot: fl.rs лишається, відновлення повториться
  const saved = [];
  ex.S.down = 1;
  await handleBot({ bot: { id: BOT, state: { fl: { ...fl, parked: 1 }, pend: [] } }, g, r: { state: { b: { pos: { q: 24, n: 1, first: 2.5, f: [{ t: T }] } }, lt: T + 6e4 }, events: [] }, symbol: 'TONUSDT', mirror: true, native: true, ex, now: T + 6e4,
    save: async (x) => { saved.push(JSON.parse(JSON.stringify(x))); return true; }, log: async () => {}, notify: async () => {} });
  assert.equal(saved.at(-1).fl.rs, 1, 'відновлення відкладено, а не загублено');
  assert.equal(ex.S.orders.length, n0);
});

test('Ручні ордери користувача на тій самій парі не знімаються: фіксація, закриття, sync, guard, пауза, зайва позиція', async () => {
  const manual = (ex) => { ex.S.orders.push({ link: 'manual-1', side: 'SELL', qty: 1, price: 9, status: 'New' }); ex.S.orders.push({ link: '', side: 'BUY', qty: 1, price: 0.5, status: 'New' }); };
  const alive = (ex) => ex.S.orders.filter((o) => o.status === 'New' && !String(o.link).startsWith('ox')).length;
  const open = () => actionsFor([{ kind: 'open', notional: 60, price: 2.5, t: T }], BOT, true)[0];
  // часткова фіксація і закриття
  let ex = fakeEx(); manual(ex); await execute(ex, open(), ctx);
  await execute(ex, { id: linkId(BOT, T + 1e3, 'p'), kind: 'part', t: T + 1e3, share: 0.5 }, ctx);
  assert.equal(ex.S.orders.filter((o) => o.status === 'New' && o.link.startsWith('ox')).length, 0, 'лімітні докупівлі бота знято');
  assert.equal(alive(ex), 2, 'ручні лишились після фіксації');
  await execute(ex, { id: linkId(BOT, T + 2e3, 'c'), kind: 'close', t: T + 2e3 }, ctx);
  assert.equal(alive(ex), 2, 'ручні лишились після закриття');
  // sync без позиції (біржа закрила за TP/SL)
  ex = fakeEx(); manual(ex); await execute(ex, open(), ctx); ex.S.pos = null;
  assert.match(await sync(ex, ctx), /знято 3 ордер/); assert.equal(alive(ex), 2);
  // guard: ціна пройшла SL — закриття ринком
  ex = fakeEx(); manual(ex); await execute(ex, open(), ctx); ex.S.px = 2.0;
  assert.ok((await guard(ex, ctx, (await ex.positions())[0], F)).closed); assert.equal(alive(ex), 2);
  // пауза
  ex = fakeEx(); manual(ex); await execute(ex, open(), ctx);
  await park(ex, { symbol: 'TONUSDT', botId: BOT }); assert.equal(alive(ex), 2);
  // ордери іншого бота Orbix теж не чіпаються
  ex = fakeEx(); await execute(ex, open(), ctx);
  ex.S.orders.push({ link: linkId('99999999-0000-0000-0000-000000000000', T, 'd1'), side: 'BUY', qty: 1, price: 1, status: 'New' });
  ex.S.pos = null; await sync(ex, ctx);
  assert.equal(ex.S.orders.filter((o) => o.status === 'New').length, 1, 'ордер іншого бота лишився');
  // зайва позиція після закриття біржею
  ex = fakeEx(); manual(ex);
  const saved = [], mp = { q: 24, n: 1, first: 2.5, f: [{ t: T }] };
  const go = (state, events, t) => handleBot({ bot: { id: BOT, state }, g, r: { state: { b: { pos: mp }, lt: t }, events }, symbol: 'TONUSDT', mirror: true, native: true, ex, now: t,
    save: async (x) => { saved.push(JSON.parse(JSON.stringify(x))); return true; }, log: async () => {}, notify: async () => {} });
  await go(null, [{ kind: 'open', notional: 60, price: 2.5, t: T }], T);
  ex.S.pos = null; await go(saved.at(-1), [], T + 5 * 60e3);
  ex.S.orders.filter((o) => o.status === 'Cancelled').forEach((o) => { o.status = 'New'; });
  ex.hit(ladder(g, 2.5, F)[0].price); await go(saved.at(-1), [], T + 10 * 60e3);
  assert.equal(ex.S.pos, null); assert.equal(alive(ex), 2, 'ручні лишились після закриття зайвої позиції');
  assert.equal(ex.S.calls.filter((c) => c === 'cancelAll').length, 0, 'cancelAll не викликається');
});

test('Ліміт ризику: про пропущений вхід — одне попередження й одне сповіщення на причину на добу; знято — запис і прапорець прибрано', async () => {
  const ex = fakeEx(), logs = [], notes = [];
  let st = null;
  const go = (risk, skipped, t) => handleBot({ bot: { id: BOT, state: st }, g, r: { state: { b: { pos: null }, lt: t }, events: [], skipped }, symbol: 'TONUSDT', mirror: true, native: true, ex, now: t, risk,
    save: async (x) => { st = JSON.parse(JSON.stringify(x)); return true; }, log: async (l, m) => logs.push([l, m]), notify: async (m) => notes.push(m) });
  const pos = { blk: { k: 'pos', t: 'драбина 2947 USDT більша за ліміт угоди 1000 USDT' } };
  const warns = () => logs.filter(([l, m]) => l === 'warn' && /Ліміт ризику/.test(m)).length;
  await go(pos, 1, T);
  assert.equal(warns(), 1); assert.equal(notes.length, 1); assert.match(notes[0], /TON\/USDT — Ліміт ризику: нову угоду не відкрито — драбина 2947/);
  assert.equal(st.fl.rl.k, 'pos');
  await go(pos, 1, T + 5 * 60e3); await go(pos, 2, T + 3 * 3600e3);
  assert.equal(warns(), 1, 'та сама причина тієї ж доби — без повторів'); assert.equal(notes.length, 1);
  await go(pos, 0, T + 4 * 3600e3);
  assert.equal(st.fl.rl.k, 'pos', 'сигналу не було — прапорець лишається');
  await go({ blk: { k: 'day', t: 'збиток за сьогодні' } }, 1, T + 5 * 3600e3);
  assert.equal(warns(), 2, 'інша причина — нове попередження'); assert.equal(notes.length, 2);
  await go({ blk: { k: 'day', t: 'збиток за сьогодні' } }, 1, T + 864e5);
  assert.equal(warns(), 3, 'нова доба — нове попередження');
  await go({ blk: null }, 0, T + 864e5 + 60e3);
  assert.equal(st.fl.rl, undefined, 'обмеження зняте');
  assert.ok(logs.some(([l, m]) => l === 'info' && /Ліміт ризику більше не діє/.test(m)));
  assert.equal(notes.length, 3, 'про зняття — без сповіщення в Telegram');
  // бот перестав торгувати на біржі — давній прапорець не лишається
  st = { ...st, fl: { ...st.fl, rl: { k: 'pos', t: 'x', day: 0 } } };
  await handleBot({ bot: { id: BOT, state: st }, g, r: { state: { b: { pos: null }, lt: T }, events: [] }, symbol: 'TONUSDT', mirror: false, native: false, ex: null, now: T,
    save: async (x) => { st = JSON.parse(JSON.stringify(x)); return true; }, log: async () => {}, notify: async () => {} });
  assert.equal(st.fl.rl, undefined);
});

/* ---------- часткове виставлення ордерів (g.live) ---------- */
const gl = { ...g, live: 1 }, ctxL = { ...ctx, g: gl };
const openL = () => actionsFor([{ kind: 'open', notional: 60, price: 2.5, t: T }], BOT, true)[0];
const links = async (ex) => (await ex.openOrders()).map((o) => o.link);

test('Часткове виставлення: при вході на біржі лише live найближчих докупівель', async () => {
  const ex = fakeEx(), fl = {};
  const m = await execute(ex, openL(), { ...ctxL, fl });
  assert.deepEqual(await links(ex), [fl.lb + 'd1']); assert.equal(fl.lt, 1);
  assert.match(m, /1 лімітн\. докупівель \(з 3; решта — по одній після виконання\)/);
  const ex2 = fakeEx(), fl2 = {};
  await execute(ex2, openL(), { ...ctx, g: { ...g, live: 2 }, fl: fl2 });
  assert.deepEqual(await links(ex2), [fl2.lb + 'd1', fl2.lb + 'd2']); assert.equal(fl2.lt, 2);
  const ex3 = fakeEx(), fl3 = {};                                  // live = 0 — уся драбина, як раніше
  await execute(ex3, openL(), { ...ctx, fl: fl3 });
  assert.equal((await links(ex3)).length, 3); assert.equal(fl3.lt, undefined);
});

test('Часткове виставлення: виконалась докупівля — ставиться наступна, без дублів; повторний запуск нічого не додає', async () => {
  const ex = fakeEx(), fl = {}, L = ladder(g, 2.5, F);
  await execute(ex, openL(), { ...ctxL, fl });
  assert.equal(await topUp(ex, { ...ctxL, fl, mp: { n: 1 } }), null, 'модель ще не докуповувала — нічого не додається');
  ex.hit(L[0].price);                                              // рівень 1 виконано на біржі, модель: n = 2
  assert.match(await topUp(ex, { ...ctxL, fl, mp: { n: 2 } }), /докладено 1 лімітн\. докупівель \(на біржі до рівня 2 з 3\)/);
  assert.deepEqual(await links(ex), [fl.lb + 'd2']);
  assert.equal(await topUp(ex, { ...ctxL, fl, mp: { n: 2 } }), null, 'повтор — нічого');
  ex.hit(L[1].price);
  await topUp(ex, { ...ctxL, fl, mp: { n: 3 } });
  assert.deepEqual(await links(ex), [fl.lb + 'd3']); assert.equal(fl.lt, 3);
  ex.hit(L[2].price);
  assert.equal(await topUp(ex, { ...ctxL, fl, mp: { n: 4 } }), null, 'драбину вичерпано');
  const ids = ex.S.orders.map((o) => o.link); assert.equal(new Set(ids).size, ids.length, 'ідентифікатори не повторюються');
  assert.equal(ex.S.orders.filter((o) => o.side === 'BUY' && o.status === 'Filled').length, 4, 'вхід і три докупівлі — по одній');
});

test('Часткове виставлення: ціна проскочила кілька рівнів — біржа наздоганяє модель; після TP1 нічого не ставиться', async () => {
  const ex = fakeEx(), fl = {}, L = ladder(g, 2.5, F);
  await execute(ex, openL(), { ...ctxL, fl });
  ex.hit(L[1].price);                                              // за свічку ціна пройшла рівні 1 і 2; на біржі був лише 1-й
  await topUp(ex, { ...ctxL, fl, mp: { n: 3 } });                  // модель зарахувала обидва
  assert.deepEqual(ex.S.orders.filter((o) => o.status === 'New').map((o) => o.link), [fl.lb + 'd2', fl.lb + 'd3']);
  ex.hit(L[1].price);                                              // ліміт рівня 2 вище ринку (Long) — виконується одразу
  assert.equal(ex.S.orders.find((o) => o.link === fl.lb + 'd2').status, 'Filled');
  const ex2 = fakeEx(), fl2 = {};
  await execute(ex2, openL(), { ...ctxL, fl: fl2 }); ex2.hit(L[0].price);
  assert.equal(await topUp(ex2, { ...ctxL, fl: fl2, mp: { n: 2, t1: 1 } }), null, 'після TP1 модель не докуповує');
});

test('Часткове виставлення: збій біржі — статус невідомий, ордер не надсилається і повторюється наступного запуску', async () => {
  const ex = fakeEx(), fl = {}, L = ladder(g, 2.5, F);
  await execute(ex, openL(), { ...ctxL, fl }); ex.hit(L[0].price);
  const bl = ex.byLink; ex.byLink = async () => { throw new Error('timeout'); };
  assert.match(await topUp(ex, { ...ctxL, fl, mp: { n: 2 } }), /не вдалося: 2: timeout, повторю/);
  assert.equal(fl.lt, 1); assert.equal((await links(ex)).length, 0, 'нового ордера немає');
  ex.byLink = bl;
  await topUp(ex, { ...ctxL, fl, mp: { n: 2 } });
  assert.deepEqual(await links(ex), [fl.lb + 'd2']);
});

test('Часткове виставлення: пауза — відновлюються лише live рівнів нового покоління, далі докладаються з тим самим поколінням', async () => {
  const ex = fakeEx(), fl = {}, L = ladder(g, 2.5, F);
  await execute(ex, openL(), { ...ctxL, fl });
  await park(ex, { symbol: 'TONUSDT', botId: BOT });
  assert.match(await restore(ex, { ...ctxL, fl, mp: { n: 1 } }), /відновлено 1 лімітн/);
  assert.deepEqual(await links(ex), [fl.lb + 'e1x1']); assert.equal(fl.lt, 1);
  ex.hit(L[0].price);
  await topUp(ex, { ...ctxL, fl, mp: { n: 2 } });
  assert.deepEqual(await links(ex), [fl.lb + 'e1x2']);
});

test('Часткове виставлення: угода, відкрита без нього (немає fl.lt), — драбину вважаємо виставленою, нічого не додаємо', async () => {
  const ex = fakeEx(), fl = {};
  await execute(ex, openL(), { ...ctx, fl });                      // відкрито з усією драбиною
  assert.equal(await topUp(ex, { ...ctxL, fl, mp: { n: 2 } }), null);
  assert.equal(fl.lt, 3); assert.equal(count(ex, 'limit'), 3);
});

test('handleBot: часткове виставлення докладає ордер у звичайному запуску; угоду закрито — fl.lt прибрано', async () => {
  const ex = fakeEx(), saved = [], logs = [], L = ladder(g, 2.5, F);
  const go = (state, pos) => handleBot({ bot: { id: BOT, state }, g: gl, r: { state: { b: { pos }, lt: T }, events: [] }, symbol: 'TONUSDT', mirror: true, native: true, ex, now: T,
    save: async (s) => { saved.push(JSON.parse(JSON.stringify(s))); return true; }, log: async (_l, m) => logs.push(m), notify: async () => {} });
  const fl = {}; await execute(ex, openL(), { ...ctxL, fl });
  ex.hit(L[0].price);
  await go({ fl, pend: [] }, { q: 24 + L[0].qty, n: 2, first: 2.5, f: [{ t: T }, { t: T + 1 }] });
  assert.ok(logs.some((m) => /докладено 1 лімітн/.test(m)), logs.join(' | '));
  assert.equal(saved.at(-1).fl.lt, 2);
  ex.S.pos = null; ex.S.orders = [];
  await go(saved.at(-1), null);
  assert.equal(saved.at(-1).fl.lt, undefined);
});
