// Незалежні тести торгового рушія Orbix. Кожен очікуваний результат порахований вручну
// за формулами в коментарях, а не взятий з самого рушія.
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine } = require('./load-engine');
const E = loadEngine();
const H1 = 36e5, T0 = Date.UTC(2026, 0, 5); // понеділок 00:00 UTC
const near = (a, b, eps = 1e-6, m = '') => assert.ok(Math.abs(a - b) <= eps, `${m} очікувалось ${b}, отримано ${a}`);
const C = (i, o, h, l, c) => ({ t: T0 + i * H1, o, h, l, c, v: 1 });
const G = o => ({ ...E.DEF, pair: 'BTC/USDT', fee: 0.001, slip: 0.0005, base: 100, lev: 1, orders: 1, mult: 1, smul: 1, step: 0.02, tp: 0.01, sl: 0.05, trail: 0, s1: 0, be: 0, cd: 0, d: 1, ...o });
// проганяє бота по свічках; вхід — лише на першій свічці
function play(g, cs, enterAt = [0]) { const b = new E.Bot(g); cs.forEach((r, i) => b.step(i, r, enterAt.includes(i))); return b; }

test('Long, один ордер, Take-Profit: PnL з комісіями', () => {
  // вхід 100 USDT по 100 → q=1; TP = 100·1.01 = 101
  // PnL = 1·101 − 100 − 0.001·(101+100) = 1 − 0.201 = 0.799
  const b = play(G(), [C(0, 100, 100, 100, 100), C(1, 100, 101.5, 99.5, 101.2)]);
  assert.equal(b.tr.length, 1); near(b.tr[0].pnl, 0.799); assert.equal(b.pos, null);
});

test('Short, один ордер, Take-Profit', () => {
  // TP = 100·(1−0.01) = 99; PnL = −(99−100) − 0.001·(99+100) = 1 − 0.199 = 0.801
  const b = play(G({ d: -1 }), [C(0, 100, 100, 100, 100), C(1, 100, 100.5, 98.9, 99.2)]);
  near(b.tr[0].pnl, 0.801);
});

test('Stop-Loss з прослизанням', () => {
  // SL = 100·0.95 = 95, виконання 95·(1−0.0005) = 94.9525
  // PnL = 94.9525 − 100 − 0.001·(94.9525+100) = −5.0475 − 0.1949525 = −5.2424525
  const b = play(G(), [C(0, 100, 100, 100, 100), C(1, 100, 100, 94, 96)]);
  near(b.tr[0].pnl, -5.2424525); assert.equal(b.tr[0].sl, true);
});

test('DCA: докупівля, середня ціна і TP від середньої', () => {
  // ордер 1: 100 USDT по 100 (q=1); ордер 2: 100·2 = 200 USDT по 98 (q=200/98)
  // q = 3.040816..., cost = 300, avg = 98.6577...; TP = avg·1.01 = 99.6443...
  const g = G({ orders: 3, mult: 2 });
  const b = play(g, [C(0, 100, 100, 100, 100), C(1, 100, 100, 97.9, 98.5), C(2, 98.5, 99.7, 98.4, 99.6)]);
  const q = 1 + 200 / 98, avg = 300 / q, tp = avg * 1.01;
  assert.equal(b.tr.length, 1); assert.equal(b.tr[0].n, 2);
  near(b.tr[0].pnl, q * tp - 300 - 0.001 * (q * tp + 300), 1e-9);
});

test('Сітка lv() збігається з цінами, де рушій виконує DCA', () => {
  const g = G({ orders: 4, mult: 1.5, step: 0.015, smul: 1.3 }), L = E.lv(g, 100).L.map(x => x.p);
  const b = play({ ...g, sl: 0.2 }, [C(0, 100, 100, 100, 100), C(1, 100, 100, 93.5, 95)]);
  const fills = b.pos.f.map(x => x.p); assert.equal(fills.length, 4);
  fills.forEach((p, i) => near(p, L[i], 1e-9, `ордер #${i + 1}`));
});

test('Ліквідація при плечі 10× (ізольована маржа)', () => {
  // маржа 10, позиція 100 по 100; ліквідація ≈ 100·(1 − (1/10 − 0.005)) = 90.5
  // втрачається вся маржа 10 + комісія входу 0.1 → −10.1
  const b = play(G({ base: 10, lev: 10, sl: 0.2 }), [C(0, 100, 100, 100, 100), C(1, 100, 100, 90, 91)]);
  assert.equal(b.tr[0].liq, 1); near(b.tr[0].pnl, -10.1);
});

test('Ліквідація настає раніше за SL і блокує DCA нижче ліквідації', () => {
  const g = G({ base: 10, lev: 10, sl: 0.3, orders: 3, step: 0.12, mult: 1 });
  // рівень DCA #2 = 88 нижче ліквідації 90.5 → не виконується
  const b = play(g, [C(0, 100, 100, 100, 100), C(1, 100, 100, 85, 86)]);
  assert.equal(b.tr[0].n, 1); assert.equal(b.tr[0].liq, 1);
});

test('Multi-TP: часткова фіксація, беззбиток, другий TP', () => {
  // TP1 = 101: закриваємо 50% → real = 0.5·101 − 50 − 0.001·(50.5+50) = 0.3995
  // SL переноситься на середню 100 (be=1); TP2 = 100·1.02 = 102
  // залишок: 0.5·102 − 50 − 0.001·(51+50) = 0.899 → разом 1.2985
  const g = G({ s1: 0.5, tp2: 0.02, be: 1 });
  const b = play(g, [C(0, 100, 100, 100, 100), C(1, 100, 101.2, 99.9, 101), C(2, 101, 102.3, 100.6, 102)]);
  near(b.tr[0].pnl, 1.2985);
});

test('Multi-TP: після TP1 ціна повертається — вихід у беззбиток', () => {
  // real після TP1 = 0.3995; SL = 100 (без комісій), виконання 100·(1−0.0005) = 99.95
  // залишок: 0.5·99.95 − 50 − 0.001·(49.975+50) = −0.025 − 0.099975 = −0.124975 → разом 0.274525
  const g = G({ s1: 0.5, tp2: 0.02, be: 1 });
  const b = play(g, [C(0, 100, 100, 100, 100), C(1, 100, 101.2, 100.2, 101), C(2, 101, 101, 99.5, 99.8)]);
  near(b.tr[0].pnl, 0.274525);
});

test('Trailing: після активації стоп діє і тоді, коли ціна опустилась нижче TP', () => {
  // TP = 101 активує трейлінг; пік у свічці активації — сам рівень активації 101 (як activePrice на біржі),
  // а не high 101.2: невідомо, чи ціна дійшла до high раніше за відкат. Стоп = 101·(1−0.005) = 100.495
  // наступна свічка не досягає 101, але падає до 99 → вихід по 100.495, а не по SL 95
  const g = G({ trail: 0.005 });
  const b = play(g, [C(0, 100, 100, 100, 100), C(1, 100, 101.2, 101, 101.1), C(2, 101.1, 100.9, 99, 99.5)]);
  assert.equal(b.tr.length, 1, 'угода має закритись у свічці 2');
  near(b.tr[0].pnl, 100.495 - 100 - 0.001 * (100.495 + 100), 1e-9);
});

test('Trailing: стоп не рахується від максимуму тієї ж свічки, де виконується', () => {
  // у свічці 1 TP 101 активує трейлінг (пік = 101, стоп 100.495); у свічці 2: high 103, low 100.8.
  // Порядок усередині свічки невідомий: стоп свічки 2 — від попереднього піку (100.495), low його не досягає;
  // пік оновлюється до 103 лише після свічки. Свічка 3 падає до 101 → вихід по 103·0.995 = 102.485
  const g = G({ trail: 0.005 });
  const b = play(g, [C(0, 100, 100, 100, 100), C(1, 100, 101.5, 101.1, 101.3), C(2, 101.3, 103, 100.8, 102), C(3, 102, 102.2, 101, 101.5)]);
  assert.equal(b.tr.length, 1); assert.equal(b.tr[0].ts, C(3).t, 'закриття у свічці 3, не 2');
  near(b.tr[0].f.at(-1).p, 103 * 0.995, 1e-9);
});

test('Trailing: свічка активації закрилась за стопом від рівня активації — вихід за цим стопом', () => {
  // Short, вхід 100, TP 1 % → активація 99, стоп 99·1.005 = 99.495. Свічка: low 98, close 99.8 > 99.495.
  // Ціна після 99 відкотилась більш ніж на 0.5 % — біржа закрила б не гірше за 99.495
  // PnL = −(99.495 − 100) − 0.001·(99.495 + 100) = 0.505 − 0.199495
  const b = play(G({ d: -1, trail: 0.005 }), [C(0, 100, 100, 100, 100), C(1, 100, 100.2, 98, 99.8)]);
  assert.equal(b.tr.length, 1); near(b.tr[0].f.at(-1).p, 99.495, 1e-9);
  near(b.tr[0].pnl, 0.505 - 0.001 * 199.495, 1e-9);
  // закриття ближче до піку, ніж стоп, — трейлінг лише активується, пік = 99 (не low 98)
  const c = play(G({ d: -1, trail: 0.005 }), [C(0, 100, 100, 100, 100), C(1, 100, 100.2, 98, 98.5)]);
  assert.equal(c.tr.length, 0); assert.equal(c.pos.peak, 99);
});

test('Trailing: свічка відкрилась вище активного стопу й дійшла до докупівлі — спершу вихід за стопом', () => {
  // Long, 2 ордери, крок 2 % (докупівля 98), трейлінг 1 %. Свічка 1: активація TP 101 (пік 101, стоп 99.99);
  // свічка 2 відкрилась за 100.5 (вище стопу) і впала до 97.5: ціна пройшла 99.99 раніше, ніж 98 → вихід 99.99 без докупівлі
  const g = G({ orders: 2, trail: 0.01 });
  const b = play(g, [C(0, 100, 100, 100, 100), C(1, 100, 101.2, 100, 100.6), C(2, 100.5, 100.5, 97.5, 98.2)]);
  assert.equal(b.tr.length, 1); assert.equal(b.tr[0].n, 1, 'докупівлі не було');
  near(b.tr[0].f.at(-1).p, 101 * 0.99, 1e-9); assert.ok(!b.tr[0].sl, 'це трейлінг, а не SL');
  // контроль: свічка відкрилась уже нижче стопу (99.5 < 99.99) — порядок невідомий, як і раніше: докупівля 98 першою
  const c = play(g, [C(0, 100, 100, 100, 100), C(1, 100, 101.2, 100, 100.6), C(2, 99.5, 99.6, 97.5, 98.2)]);
  assert.equal(c.pos ? c.pos.n : c.tr[0].n, 2, 'докупівлю зараховано');
  // контроль: докупівля лежить вище стопу (крок 0.5 % → 99.5; трейлінг 2 % → стоп 101·0.98 = 98.98) — вона виконується першою
  const h = G({ orders: 2, trail: 0.02, step: 0.005 });
  const e = play(h, [C(0, 100, 100, 100, 100), C(1, 100, 101.2, 100, 100.6), C(2, 100.5, 100.5, 97.5, 98.2)]);
  assert.equal((e.pos || e.tr[0]).n, 2, 'докупівля вище стопу виконується першою');
});

test('Пріоритет SL над TP, якщо свічка зачепила обидва (консервативно)', () => {
  const b = play(G(), [C(0, 100, 100, 100, 100), C(1, 100, 102, 94, 100)]);
  assert.equal(b.tr[0].sl, true);
});

test('eqv(): нереалізований PnL дорівнює PnL закриття по ціні закриття свічки', () => {
  const b = play(G({ orders: 2, mult: 2 }), [C(0, 100, 100, 100, 100), C(1, 100, 100, 97.5, 99)]);
  const p = b.pos, v = p.q * 99; near(b.eqv({ c: 99 }), v - p.cost - 0.001 * (v + p.cost), 1e-9);
});

test('Сигнали входу не заглядають у майбутнє (немає lookahead)', () => {
  const R = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(42); let c = 100; const A = [];
  for (let i = 0; i < 900; i++) { const o = c; c *= 1 + (R() - 0.5) * 0.03; A.push({ t: T0 + i * H1, o, h: Math.max(o, c) * (1 + R() * 0.01), l: Math.min(o, c) * (1 - R() * 0.01), c, v: 1 }); }
  for (const k of Object.keys(E.SIG)) for (const d of [1, -1]) {
    const g = G({ sg: [k], k: 1, d }), full = E.entry(A, g);
    for (const n of [300, 517, 750]) { const part = E.entry(A.slice(0, n).map(x => ({ ...x })), g); assert.deepEqual(part, full.slice(0, n), `сигнал ${k}, d=${d}, n=${n}`) }
  }
});

test('run(): просадка ≤ 0, ROI = PnL / депозит', () => {
  const cs = [C(0, 100, 100, 100, 100), C(1, 100, 100, 94, 96), C(2, 96, 97, 95, 96)];
  const R = E.run(cs, [true, false, false], G(), 0, 1, 1000), s = E.summ(R, 1000);
  assert.ok(R.dd <= 0); near(s.roi, R.last / 1000 * 100, 1e-12); near(s.pnl, R.b.cum, 1e-12);
});

test('Свічки 4г/1д/1т вирівняні за UTC, як на біржі', () => {
  // історія починається з 03:00 → перша неповна 4-годинна група (00–04) відкидається
  const cs = []; for (let i = 3; i < 3 + 24 * 9; i++) cs.push(C(i, 100, 101, 99, 100));
  const A4 = E.aggT(cs, 4); assert.equal(A4[0].t, T0 + 4 * H1); assert.ok(A4.every(c => (c.t % (4 * H1)) === 0));
  const Aw = E.aggT(cs, 168); assert.ok(Aw.every(c => new Date(c.t).getUTCDay() === 1 && new Date(c.t).getUTCHours() === 0), 'тиждень з понеділка');
  // остання незакрита група не повертається
  const d0 = []; for (let i = 0; i < 30; i++) d0.push(C(i, 100, 101, 99, 100));
  assert.equal(E.aggT(d0, 24).length, 1, 'повна доба + неповна');
  assert.equal(E.aggT(cs.slice(0, 30), 24).length, 0, 'обидві доби неповні');
  assert.equal(E.closedTf([C(3, 1, 1, 1, 1)], 4), true); assert.equal(E.closedTf([C(4, 1, 1, 1, 1)], 4), false);
});

test('Агрегація зберігає OHLCV', () => {
  const cs = [C(0, 10, 12, 9, 11), C(1, 11, 15, 10, 14), C(2, 14, 14, 8, 9), C(3, 9, 10, 7, 8)];
  const [a] = E.aggT(cs, 4); assert.deepEqual([a.o, a.h, a.l, a.c, a.v], [10, 15, 7, 8, 4]);
});

test('Комісії мейкер/тейкер: вхід і стоп — тейкер, DCA і TP — мейкер', () => {
  // ф'ючерси: тейкер 0.05%, мейкер 0.02%. Вхід 100 по 100 (−0.05), TP 101 лімітом: −0.02·101/100 = −0.0202
  // PnL = 1 − 0.05 − 0.0202 = 0.9298
  const g = G({ ftk: 0.0005, fmk: 0.0002 });
  near(play(g, [C(0, 100, 100, 100, 100), C(1, 100, 101.5, 99.5, 101)]).tr[0].pnl, 0.9298);
  // стоп: 95·(1−0.0005)=94.9525; PnL = −5.0475 − 0.05 − 0.0005·94.9525 = −5.144976...
  near(play(g, [C(0, 100, 100, 100, 100), C(1, 100, 100, 94, 96)]).tr[0].pnl, -5.0475 - 0.05 - 0.0005 * 94.9525, 1e-9);
});

test('normG(): ставки біржі за типом ринку', () => {
  const f = E.normG({ fut: 1 }), sp = E.normG({ fut: 0 });
  assert.deepEqual([f.ftk, f.fmk], [0.0005, 0.0002]); assert.deepEqual([sp.ftk, sp.fmk], [0.001, 0.001]);
  assert.equal(E.normG({ fut: 1, ftk: 0.0004, fmk: 0 }).ftk, 0.0004, 'явні ставки не перезаписуються');
});

test('Funding: Long платить при додатній ставці, Short отримує', () => {
  // позиція 1 BTC по 100; подія funding 0.01% на початку свічки 1 (ціна відкриття 100) → 0.0001·1·100 = 0.01
  const fr = [{ t: T0 + H1, r: 0.0001 }, { t: T0 + 9 * H1, r: 0.0001 }];
  const cs = [C(0, 100, 100, 100, 100), C(1, 100, 100.2, 99.8, 100), C(2, 100, 100.2, 99.8, 100)];
  const L = new E.Bot(G({ fee: 0 }), fr); cs.forEach((r, i) => L.step(i, r, i === 0)); near(L.pos.fd, 0.01); near(L.eqv({ c: 100 }), -0.01);
  const S = new E.Bot(G({ fee: 0, d: -1 }), fr); cs.forEach((r, i) => S.step(i, r, i === 0)); near(S.pos.fd, -0.01); near(S.eqv({ c: 100 }), 0.01);
});

test('Funding: подія в момент входу не нараховується, кожна подія — лише один раз', () => {
  // вхід на закритті свічки 0 (момент T0+1h); подія T0+1h — позиція вже відкрита (консервативно нараховується один раз)
  const fr = [{ t: T0 + H1, r: 0.001 }];
  const b = new E.Bot(G({ fee: 0 }), fr); [C(0, 100, 100, 100, 100), C(1, 100, 100, 99.9, 100), C(2, 100, 100, 99.9, 100), C(3, 100, 100, 99.9, 100)].forEach((r, i) => b.step(i, r, i === 0));
  near(b.pos.fd, 0.1);
  // подія до входу не впливає
  const b2 = new E.Bot(G({ fee: 0 }), [{ t: T0, r: 0.01 }]); [C(0, 100, 100, 100, 100), C(1, 100, 100, 99.9, 100)].forEach((r, i) => b2.step(i, r, i === 0)); near(b2.pos.fd, 0);
});

test('Funding враховується в PnL закритої угоди', () => {
  const fr = [{ t: T0 + H1, r: 0.001 }];
  const b = new E.Bot(G({ fee: 0 }), fr); [C(0, 100, 100, 100, 100), C(1, 100, 101.5, 99.5, 101)].forEach((r, i) => b.step(i, r, i === 0));
  near(b.tr[0].pnl, 1 - 0.1); near(b.tr[0].fd, 0.1);
});

test('Ліквідація за mark price: тінь свічки за ціною угод без mark не ліквідує', () => {
  // ліквідація 90.5; ціна угод торкнулась 90, але mark мінімум 91 → позиція жива
  const g = G({ base: 10, lev: 10, sl: 0.2 });
  const mc = (i, o, h, l, c, ml, mh) => ({ ...C(i, o, h, l, c), ml, mh });
  const b = play(g, [C(0, 100, 100, 100, 100), mc(1, 100, 100, 90, 95, 91, 100)]);
  assert.equal(b.tr.length, 0); assert.ok(b.pos);
  const b2 = play(g, [C(0, 100, 100, 100, 100), mc(1, 100, 100, 90, 95, 90.4, 100)]);
  assert.equal(b2.tr[0].liq, 1); near(b2.tr[0].pnl, -10 - 0.1, 1e-9); // маржа 10 + комісія входу 0.001·100
});

test('Агрегація переносить мінімум і максимум mark price', () => {
  const cs = [0, 1, 2, 3].map(i => ({ ...C(i, 100, 101, 99, 100), ml: 98 + i, mh: 102 - i }));
  const [a] = E.aggT(cs, 4); assert.equal(a.ml, 98); assert.equal(a.mh, 102);
});

// ---------- Walk-forward ----------
function series(n, seed, start = T0) {
  let s = seed, c = 100; const R = () => (s = (s * 16807) % 2147483647) / 2147483647, o = [];
  for (let i = 0; i < n; i++) { const op = c; c *= 1 + (R() - 0.5) * 0.025 + Math.sin(i / 90) * 0.002; o.push({ t: start + i * H1, o: op, h: Math.max(op, c) * (1 + R() * 0.008), l: Math.min(op, c) * (1 - R() * 0.008), c, v: 1 }); }
  return o;
}
function useData(arr) { E.MD.mode = 'demo'; E.MD.fut = 0; E.DT['BTC/USDT'] = arr; }
const WC = { pair: 'BTC/USDT', ex: 'Binance', amt: 0, per: 3600, tf: 1, dr: 1, fut: 1, lev: 1 };

test('Walk-forward: тестові вікна йдуть підряд, без перекриття, після свого навчання', () => {
  useData(series(5000, 7));
  const pl = E.wfPlan(WC, { folds: 4 }); assert.ok(pl); const H = E.DT['BTC/USDT'], end = H.at(-1).t + H1;
  pl.P.forEach((p, i) => {
    assert.equal(p.trE - p.trS, pl.trH * H1, 'довжина навчання'); assert.ok(p.teE > p.trE, 'тест після навчання');
    if (i) assert.equal(p.trE, pl.P[i - 1].teE, 'тести підряд без проміжків і перекриттів');
  });
  assert.equal(pl.P.at(-1).teE, end, 'останній тест закінчується на останній свічці');
  assert.equal(pl.P[0].trS, end - WC.per * H1, 'період рахується від кінця історії');
});

test('Walk-forward: підбір на кроці не бачить даних після кінця свого навчання', () => {
  const base = series(5000, 11); useData(base);
  const pl = E.wfPlan(WC, { folds: 4 }), p = pl.P[1], a = E.wfFold(WC, p, { ns: 3 });
  // змінюємо всі свічки після кінця навчання цього кроку
  const R = (s => () => (s = (s * 48271) % 2147483647) / 2147483647)(5);
  useData(base.map(c => c.t >= p.trE ? { ...c, o: c.o * (0.8 + R() * 0.4), h: c.h * 1.3, l: c.l * 0.7, c: c.c * (0.8 + R() * 0.4) } : { ...c }));
  const b = E.wfFold(WC, p, { ns: 3 });
  assert.ok(a.g && b.g, 'конфігурацію знайдено');
  assert.deepEqual(JSON.parse(JSON.stringify(b.g)), JSON.parse(JSON.stringify(a.g)), 'той самий вибір конфігурації');
  assert.deepEqual(b.is, a.is, 'ті самі показники навчання');
  assert.notEqual(b.pnl, a.pnl, 'тест справді рахується на нових даних');
});

test('Walk-forward: підсумок узгоджений з кроками', () => {
  useData(series(5000, 3));
  const r = E.wfo(WC, { folds: 4, ns: 3 }); assert.ok(r);
  const D2 = r.F.filter(x => !x.none);
  assert.equal(r.n, D2.length); assert.equal(r.pos, D2.filter(x => x.pnl > 0).length);
  near(r.oos, D2.reduce((a, x) => a + x.roi, 0), 1e-9);
  assert.ok(['стабільна', 'сумнівна', 'нестабільна', 'мало'].includes(r.verdict));
  if (r.oos <= 0) assert.equal(r.verdict === 'стабільна', false, 'збиткова перевірка не може бути «стабільною»');
});

// ---------- Правила біржі (exchange filters) ----------
const FB = { tick: 0.1, step: 0.001, minQty: 0.001, minN: 100 }; // як BTCUSDT на ф'ючерсах Binance

test('rnd(): округлення до кроку без похибок плаваючої коми', () => {
  assert.equal(E.rnd(0.0123456, 0.001, 'floor'), 0.012); assert.equal(E.rnd(98.04, 0.1, 'floor'), 98);
  assert.equal(E.rnd(101.01, 0.1, 'ceil'), 101.1); assert.equal(E.rnd(0.3, 0.1, 'floor'), 0.3, '0.3/0.1 не стає 2.999');
  assert.equal(E.rnd(5, 0, 'floor'), 5, 'без кроку значення не змінюється');
});

test('Кількість округлюється вниз до кроку біржі, вартість рахується від неї', () => {
  // 150 USDT по 70000 → 0.0021428… → 0.002 BTC = 140 USDT
  const b = new E.Bot(G({ base: 150, fee: 0 }), null, FB); b.step(0, C(0, 70000, 70000, 70000, 70000), true);
  assert.equal(b.pos.q, 0.002); near(b.pos.cost, 140);
});

test('Ордер менший за мінімум біржі не відкривається', () => {
  // 90 USDT < мін. 100 USDT
  const b = new E.Bot(G({ base: 90 }), null, FB); b.step(0, C(0, 70000, 70000, 70000, 70000), true);
  assert.equal(b.pos, null);
  // після округлення 0.0014 → 0.001 BTC = 70 USDT < 100 → теж не відкривається
  const b2 = new E.Bot(G({ base: 105 }), null, FB); b2.step(0, C(0, 70000, 70000, 70000, 70000), true);
  assert.equal(b2.pos, null);
});

test('DCA і TP за кроком ціни: купівля нижче — вниз, TP — вгору', () => {
  // крок 0.1: DCA = 100·(1−0.0213) = 97.87 → 97.8; TP від середньої вгору до 0.1
  const F = { tick: 0.1, step: 0.01, minQty: 0.01, minN: 5 };
  const g = G({ orders: 2, mult: 1, step: 0.0213, base: 100, fee: 0 });
  const b = new E.Bot(g, null, F); [C(0, 100, 100, 100, 100), C(1, 100, 100, 97.5, 98)].forEach((r, i) => b.step(i, r, i === 0));
  assert.equal(b.pos.f[1].p, 97.8);
  const avg = b.pos.cost / b.pos.q, tp = Math.ceil(avg * 1.01 / 0.1 - 1e-9) * 0.1;
  b.step(2, C(2, 98, 100, 97.9, 99.5), false); near(b.tr[0].f.at(-1).p, +tp.toFixed(1), 1e-9);
});

test('DCA-ордер, якого біржа не прийме, не виконується, решта логіки працює', () => {
  // мінімум 150 USDT: перший ордер 200 проходить, другий (200·0.5 = 100) — ні
  const F = { tick: 0.01, step: 0.0001, minQty: 0.0001, minN: 150 };
  const b = new E.Bot(G({ base: 200, orders: 3, mult: 0.5, fee: 0 }), null, F);
  [C(0, 100, 100, 100, 100), C(1, 100, 100, 97, 97.5)].forEach((r, i) => b.step(i, r, i === 0));
  assert.equal(b.pos.n, 1, 'докупівлі пропущено'); assert.ok(b.pos.dx);
});

test('Сітка на графіку (lv) з правилами біржі збігається з виконанням', () => {
  const F = { tick: 0.01, step: 0.001, minQty: 0.001, minN: 5 };
  const g = G({ orders: 4, mult: 1.5, step: 0.015, smul: 1.3, sl: 0.2 }), L = E.lv(g, 100, F).L.map(x => x.p);
  const b = new E.Bot(g, null, F); [C(0, 100, 100, 100, 100), C(1, 100, 100, 93.5, 95)].forEach((r, i) => b.step(i, r, i === 0));
  assert.deepEqual(b.pos.f.map(x => x.p), L);
});

// ---------- фільтр китів (сплеск об'єму) ----------
// 30 спокійних свічок з об'ємом 10 (середнє 10), потім свічка-кит з об'ємом V і часткою покупців bv/V
const WHC = (V, bv, o = 100, c = 101) => { const a = []; for (let i = 0; i < 30; i++) a.push({ t: T0 + i * H1, o: 100, h: 101, l: 99, c: 100, v: 10, bv: 5 }); a.push({ t: T0 + 30 * H1, o, h: Math.max(o, c) + 1, l: Math.min(o, c) - 1, c, v: V, ...(bv == null ? {} : { bv }) }); for (let i = 31; i < 36; i++) a.push({ t: T0 + i * H1, o: 100, h: 101, l: 99, c: 100, v: 10, bv: 5 }); return a; };
test('Кити: сплеск об\'єму ≥ k×середнього з перевагою покупців дає дозвіл на Long на 3 свічки', () => {
  // середнє за 20 свічок = 10; кит V=30 (рівно 3×), покупці 18/30 = 60 % = wb
  const w = E.whale(WHC(30, 18), G({ wk: 3, wb: 0.6 }));
  assert.equal(w[29], false); assert.equal(w[30], true); assert.equal(w[31], true); assert.equal(w[32], true); assert.equal(w[33], false);
});
test('Кити: замалий сплеск, замала сума чи перевага продавців — дозволу немає', () => {
  assert.equal(E.whale(WHC(29.9, 20), G({ wk: 3, wb: 0.6 }))[30], false, 'сплеск < 3×');
  assert.equal(E.whale(WHC(30, 17.9), G({ wk: 3, wb: 0.6 }))[30], false, 'покупців < 60 %');
  // оборот кита 30 × 101 = 3030 USDT
  assert.equal(E.whale(WHC(30, 18), G({ wk: 3, wb: 0.6, wn: 3031 }))[30], false, 'оборот < мінімуму');
  assert.equal(E.whale(WHC(30, 18), G({ wk: 3, wb: 0.6, wn: 3030 }))[30], true, 'оборот = мінімуму');
});
test('Кити: для Short потрібна перевага продавців; без taker-buy — напрям за кольором свічки', () => {
  assert.equal(E.whale(WHC(30, 12), G({ wk: 3, wb: 0.6, d: -1 }))[30], true, 'продавців 60 %');
  assert.equal(E.whale(WHC(30, 13), G({ wk: 3, wb: 0.6, d: -1 }))[30], false, 'продавців 56,7 %');
  assert.equal(E.whale(WHC(30, null, 100, 101), G({ wk: 3 }))[30], true, 'зелена свічка — Long');
  assert.equal(E.whale(WHC(30, null, 100, 101), G({ wk: 3, d: -1 }))[30], false, 'зелена свічка — не Short');
  assert.equal(E.whale(WHC(30, null, 101, 100), G({ wk: 3, d: -1 }))[30], true, 'червона свічка — Short');
});
test('Кити: фільтр пригнічує входи без кита, а з wk = 0 вхід не змінюється', () => {
  const A = WHC(30, 18); for (let i = 31; i < 36; i++) A[i].c = 100 - (i - 30) * 0.5; // падіння → RSI низький
  const g0 = G({ sg: ['rsi'], k: 1, rp: 3, rm: 99 }); // поріг 99 — RSI-сигнал Long майже на кожній свічці
  const base = E.entry(A, g0), wh = E.entry(A, { ...g0, wk: 3, wb: 0.6 }), wh0 = E.entry(A, { ...g0, wk: 0 });
  assert.deepEqual(wh0, base, 'wk = 0 — без змін');
  for (let i = 0; i < A.length; i++) if (wh[i]) assert.ok(base[i] && i >= 30 && i <= 32, 'вхід лише біля кита ' + i);
  assert.ok(base.some((x, i) => x && (i < 30 || i > 32)), 'без фільтра є входи далеко від кита');
});
test('Кити: об\'єм покупців підсумовується при агрегації таймфреймів', () => {
  const a = [0, 1, 2, 3].map(i => ({ t: T0 + i * H1, o: 1, h: 1, l: 1, c: 1, v: 10, bv: 1 + i }));
  const g = E.agg(a, 4); assert.equal(g[0].v, 40); assert.equal(g[0].bv, 10);
  const b = a.map((x, i) => i === 2 ? { ...x, bv: undefined } : x); delete b[2].bv;
  assert.equal(E.agg(b, 4)[0].bv, undefined, 'якщо хоч однієї частки немає — bv не вигадується');
});

// ---------- ліквідність, сплеск активності, каскад ліквідацій ----------
// базова свічка: o=c=100, h=100.5, l=99.5, об'єм 10, угод 100; X — заміни полів у вибраних свічках
const LQ = (n, X = {}) => Array.from({ length: n }, (_, i) => ({ t: T0 + i * H1, o: 100, h: 100.5, l: 99.5, c: 100, v: 10, nt: 100, ...(X[i] || {}) }));
const GF = o => G({ lq: 0, lqt: 0.003, lqn: 2, lqd: 0.03, ak: 0, lk: 0, ...o });
test('Свінги підтверджуються лише через 3 свічки (без зазирання вперед)', () => {
  const A = LQ(20, { 10: { l: 95 } }), sw = E.swings(A);
  assert.equal(JSON.stringify(sw.lo.map(s => [s.j, s.at])), '[[10,13]]');
  assert.equal(sw.hi.length, 0, 'рівні максимуми не стають свінгами');
});
test('Зона ліквідності: 2 мінімуми в межах допуску; поза допуском — ні; знята зона не діє', () => {
  const sw = A => E.swings(A);
  let A = LQ(30, { 10: { l: 95 }, 20: { l: 95.2 } });                  // 95·1.003 = 95.285 ≥ 95.2
  assert.equal(JSON.stringify(E.liqZones(A, 29, sw(A), GF({}), 'lo', 28).map(z => z.lvl)), '[95]');
  A = LQ(30, { 10: { l: 95 }, 20: { l: 95.4 } });                       // 95.4 > 95.285 — різні рівні
  assert.equal(E.liqZones(A, 29, sw(A), GF({}), 'lo', 28).length, 0);
  A = LQ(30, { 10: { l: 95 }, 20: { l: 95.2 }, 25: { l: 93 } });        // свічка 25 пройшла рівень 95 (і сама надто далеко, щоб утворити нову зону)
  assert.equal(E.liqZones(A, 29, sw(A), GF({}), 'lo', 28).length, 0, 'знята зона');
});
test('Ліквідність, розворот: прокол зони мінімумів із закриттям назад — Long; закриття нижче — ні; Short дзеркально', () => {
  const base = { 10: { l: 95 }, 20: { l: 95.2 } };
  let A = LQ(31, { ...base, 30: { l: 94.5, c: 96, o: 99 } });
  let o = E.liq(A, GF({ lq: 1 }));
  assert.equal(o[29], false); assert.equal(o[30], true);
  A = LQ(31, { ...base, 30: { l: 94.5, c: 94.8, o: 99 } });
  assert.equal(E.liq(A, GF({ lq: 1 }))[30], false, 'закриття під рівнем — пробій, а не зняття');
  assert.equal(E.liq(LQ(31, { ...base, 30: { l: 94.5, c: 96 } }), GF({ lq: 1, d: -1 }))[30], false, 'Short на зоні мінімумів — ні');
  A = LQ(31, { 10: { h: 105 }, 20: { h: 105.1 }, 30: { h: 105.6, c: 104, o: 101 } });
  assert.equal(E.liq(A, GF({ lq: 1, d: -1 }))[30], true, 'Short: прокол зони максимумів і закриття нижче');
});
test('Ліквідність, рух до ліквідності: зона максимумів у межах lqd — Long; далі чи знята — ні', () => {
  const A = LQ(31, { 10: { h: 105 }, 20: { h: 105.1 }, 30: { c: 103, h: 103.5, o: 102 } });   // 105.1 / 103 − 1 = 2,04 %
  assert.equal(E.liq(A, GF({ lq: 2, lqd: 0.03 }))[30], true);
  assert.equal(E.liq(A, GF({ lq: 2, lqd: 0.02 }))[30], false, 'далі за 2 %');
  const B = LQ(31, { 10: { h: 105 }, 20: { h: 105.1 }, 25: { h: 105.5 }, 30: { c: 103, h: 103.5, o: 102 } });
  assert.equal(E.liq(B, GF({ lq: 2 }))[30], false, 'зону вже знято');
});
test('Сплеск активності проти свічки: червоний вибух — Long, не Short; угоди замало — ні; без кількості угод — за об\'ємом', () => {
  const spike = (nt, v = 30) => LQ(26, { 25: { o: 100, c: 96, h: 100.5, l: 95.5, v, nt } });          // розмах 5 = 5× середнього 1
  assert.equal(E.act(spike(300), GF({ ak: 2.5 }))[25], true);
  assert.equal(E.act(spike(300), GF({ ak: 2.5, d: -1 }))[25], false, 'Short після червоної — ні');
  assert.equal(E.act(spike(200), GF({ ak: 2.5 }))[25], false, 'угод 200 < 2,5 × 100');
  const noNt = spike(300).map(c => { const x = { ...c }; delete x.nt; return x; });
  assert.equal(E.act(noNt, GF({ ak: 2.5 }))[25], true, 'без nt — об\'єм 30 ≥ 2,5 × 10');
  assert.equal(E.act(spike(300), GF({ ak: 6 }))[25], false, 'розмах 5 < 6 × 1');
});
test('Каскад ліквідацій: новий мінімум + сплеск об\'єму + закриття вгорі — Long; без будь-якої умови — ні', () => {
  const k = (X) => E.casc(LQ(26, { 25: { o: 99.8, h: 100.5, l: 97, c: 100, v: 30, ...X } }), GF({ lk: 2.5 }))[25];
  assert.equal(k({}), true);
  assert.equal(k({ v: 20 }), false, 'об\'єм 20 < 25');
  assert.equal(k({ c: 97.5 }), false, 'закриття внизу — каскад не викуплено');
  assert.equal(k({ l: 99.6, c: 100.4 }), false, 'не новий мінімум (хоча закриття вгорі й об\'єм великий)');
  assert.equal(E.casc(LQ(26, { 25: { o: 100.2, h: 103, l: 99.5, c: 99.7, v: 30 } }), GF({ lk: 2.5, d: -1 }))[25], true, 'Short дзеркально');
});
test('Нові фільтри не зазирають у майбутнє: сигнал на свічці i не залежить від свічок після i', () => {
  let s = 7; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let p = 100; const A = Array.from({ length: 400 }, (_, i) => { const o = p, sp = R() < 0.06 ? 4 : 1, c = o * (1 + (R() - 0.5) * 0.02 * sp); p = c;
    return { t: T0 + i * H1, o, c, h: Math.max(o, c) * (1 + R() * 0.006 * sp), l: Math.min(o, c) * (1 - R() * 0.006 * sp), v: 10 * (1 + R() * sp * 2), nt: Math.round(100 * (1 + R() * sp * 2)) }; });
  for (const [f, g] of [[E.liq, GF({ lq: 1, lqt: 0.01 })], [E.liq, GF({ lq: 2, lqt: 0.01, d: -1 })], [E.act, GF({ ak: 2 })], [E.casc, GF({ lk: 1.5 })]]) {
    const full = f(A, g); assert.ok(full.some((x, i) => x && i < 390), 'фільтр спрацьовує хоч раз');
    for (let i = 30; i < A.length; i += 9) assert.equal(f(A.slice(0, i + 1), g)[i], full[i], `свічка ${i}`);
  }
});
test('Нові фільтри вимкнені — вхід такий самий, як без них; увімкнені лише звужують входи', () => {
  let s = 11; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let p = 100; const A = Array.from({ length: 300 }, (_, i) => { const o = p, c = o * (1 + (R() - 0.5) * 0.03); p = c; return { t: T0 + i * H1, o, c, h: Math.max(o, c) * 1.004, l: Math.min(o, c) * 0.996, v: 10 + R() * 20, nt: 100 }; });
  const g0 = G({ sg: ['rsi'], k: 1, rp: 5, rm: 45 }), base = E.entry(A, g0);
  assert.equal(JSON.stringify(E.entry(A, { ...g0, lq: 0, ak: 0, lk: 0, htf: 0 })), JSON.stringify(base));
  const nb = base.filter(Boolean).length; assert.ok(nb > 20, 'базових входів досить');
  for (const x of [{ lq: 1, lqt: 0.01 }, { lq: 2, lqt: 0.01 }, { ak: 1.5 }, { lk: 1.2 }, { htf: 4, hte: 5 }]) { const e = E.entry(A, { ...g0, ...x }); e.forEach((v, i) => { if (v) assert.ok(base[i], `${JSON.stringify(x)}: вхід ${i} без базового сигналу`); }); assert.ok(e.filter(Boolean).length < nb, `${JSON.stringify(x)}: фільтр мав прибрати частину входів`); }
});
test('Кількість угод підсумовується при агрегації таймфреймів', () => {
  const a = [0, 1, 2, 3].map(i => ({ t: T0 + i * H1, o: 1, h: 1, l: 1, c: 1, v: 1, nt: 10 + i }));
  assert.equal(E.agg(a, 4)[0].nt, 46);
  const b = a.map((x, i) => { const y = { ...x }; if (i === 1) delete y.nt; return y; });
  assert.equal(E.agg(b, 4)[0].nt, undefined);
});

// ---------- тренд старшого таймфрейму ----------
// годинні свічки від понеділка 00:00 UTC; ціна за годину h: up — росте, далі падає
const HT = (days, f, start = 0) => Array.from({ length: days * 24 - start }, (_, k) => { const i = k + start, c = f(i); return { t: T0 + i * H1, o: c, h: c * 1.001, l: c * 0.999, c, v: 10 }; });
const upDown = i => i < 30 * 24 ? 100 + i * 0.1 : 100 + 30 * 24 * 0.1 - (i - 30 * 24) * 0.2;
test('Тренд старшого ТФ: Long дозволено у висхідному тренді й заборонено після розвороту вниз; Short — навпаки', () => {
  const A = HT(45, upDown), gL = G({ htf: 24, hte: 10, tf: 1 }), gS = G({ htf: 24, hte: 10, tf: 1, d: -1 });
  const L = E.htf(A, gL), S = E.htf(A, gS);
  assert.equal(L[9 * 24 + 22], false, 'до 10 закритих днів EMA ще не готова');
  assert.equal(L[9 * 24 + 23], true, 'на закритті 10-го дня — готова, тренд вгору');
  assert.equal(L[25 * 24], true); assert.equal(S[25 * 24], false);
  assert.equal(L[44 * 24], false, 'після 14 днів падіння — Long заборонено'); assert.equal(S[44 * 24], true);
});
test('Тренд старшого ТФ: свічка старшого ТФ враховується лише після закриття; неповна перша доба відкидається', () => {
  const A = HT(20, i => 100 + i * 0.1), g = G({ htf: 24, hte: 5, tf: 1 });
  const o = E.htf(A, g);
  // зміна закриття свічок усередині доби (не останньої години) нічого не змінює — свічка доби закривається о 23:00
  const B = A.map((c, i) => (i % 24 === 12 ? { ...c, c: c.c * 0.5 } : c));
  assert.equal(JSON.stringify(E.htf(B, g)), JSON.stringify(o));
  // перша доба неповна (дані з 05:00) — EMA готова на добу пізніше
  const C = HT(20, i => 100 + i * 0.1, 5), oc = E.htf(C, g);
  assert.equal(oc[4 * 24 + 23 - 5], false, 'без неповної першої доби 5 повних — лише на кінці 6-ї');
  assert.equal(oc[5 * 24 + 23 - 5], true);
  assert.equal(o[4 * 24 + 23], true, 'з повною першою добою — на кінці 5-ї');
});
test('Тренд старшого ТФ не зазирає в майбутнє; старший ТФ ≤ ТФ бота — фільтр не діє; потрібна історія для сервера', () => {
  let s = 5; const R = () => (s = (s * 16807) % 2147483647) / 2147483647; let p = 100;
  const A = Array.from({ length: 24 * 30 }, (_, i) => { const o = p, c = o * (1 + (R() - 0.5) * 0.02); p = c; return { t: T0 + i * H1, o, c, h: Math.max(o, c) * 1.002, l: Math.min(o, c) * 0.998, v: 10 }; });
  const g = G({ htf: 4, hte: 8, tf: 1 }), full = E.htf(A, g);
  assert.ok(full.some(Boolean) && full.some((x, i) => !x && i > 100), 'фільтр і дозволяє, і забороняє');
  for (let i = 40; i < A.length; i += 7) assert.equal(E.htf(A.slice(0, i + 1), g)[i], full[i], `свічка ${i}`);
  assert.ok(E.htf(A, G({ htf: 1, hte: 8, tf: 1 })).every(Boolean), 'htf = tf — без обмежень');
  assert.equal(E.htfNeed(G({ htf: 24, hte: 50, tf: 1 })), 1248); assert.equal(E.htfNeed(G({ htf: 0 })), 0);
});
