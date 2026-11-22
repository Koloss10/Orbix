// Функції, перенесені з порівняння з Veles (docs/veles-comparison.md): зупинка після N угод, реінвест,
// нові індикатори входу. Очікувані значення пораховано вручну за формулами в коментарях.
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine } = require('./load-engine');
const E = loadEngine();
const H1 = 36e5, T0 = Date.UTC(2026, 0, 5);
const near = (a, b, eps = 1e-6, m = '') => assert.ok(Math.abs(a - b) <= eps, `${m} очікувалось ${b}, отримано ${a}`);
const C = (i, o, h, l, c) => ({ t: T0 + i * H1, o, h, l, c, v: 1 });
const G = (o) => ({ ...E.DEF, pair: 'BTC/USDT', fee: 0.001, slip: 0.0005, base: 100, lev: 1, orders: 1, mult: 1, smul: 1, step: 0.02, tp: 0.01, sl: 0.05, trail: 0, s1: 0, be: 0, cd: 0, d: 1, ...o });
// цикл «вхід по 100 → TP на наступній свічці» повторюється n разів; сигнал входу на кожній свічці
const cycles = (n) => { const cs = []; for (let k = 0; k < n; k++) cs.push(C(2 * k, 100, 100, 100, 100), C(2 * k + 1, 100, 101.5, 99.5, 101.2)); return cs; };
const play = (g, cs) => { const b = new E.Bot(g, null, null); cs.forEach((r, i) => b.step(i, r, true)); return b; };

test('Зупинка після N угод: після 2 закритих угод нові не відкриваються', () => {
  const b = play(G({ maxd: 2 }), cycles(4));
  assert.equal(b.tr.length, 2); assert.equal(b.nd, 2); assert.equal(b.pos, null);
});

test('Зупинка після N угод: 0 — без обмеження', () => {
  assert.equal(play(G({ maxd: 0 }), cycles(4)).tr.length, 4);
});

test('Реінвест 100 %: друга угода більша на прибуток першої', () => {
  // 1-ша угода: q = 100/100 = 1, PnL = 0.799 (як у engine.test.js).
  // Маржа сітки M = base = 100 (1 ордер). bf = 1 + 1·0.799/100 = 1.00799 → q2 = 100·1.00799/100 = 1.00799
  const b = play(G({ rv: 1 }), cycles(2).slice(0, 3));
  near(b.tr[0].pnl, 0.799); near(b.pos.q, 1.00799); near(b.pos.bf, 1.00799);
});

test('Реінвест 0 % і після збитку — розмір не змінюється', () => {
  near(play(G({ rv: 0 }), cycles(2).slice(0, 3)).pos.q, 1);
  // збиток: SL 95 → cum < 0 → bf = 1
  const b = new E.Bot(G({ rv: 1 }), null, null);
  [C(0, 100, 100, 100, 100), C(1, 100, 100, 94, 96), C(2, 100, 100, 100, 100)].forEach((r, i) => b.step(i, r, true));
  assert.ok(b.cum < 0); near(b.pos.q, 1);
});

test('Реінвест масштабує й докупівлі угоди', () => {
  // M = base·(1 + 1) = 200 (2 ордери, мартингейл 1). Після 1-ї угоди (TP від 100 → PnL 0.799): bf = 1 + 0.799/200 = 1.0039950
  // 2-га угода: вхід 100·bf/100; докупівля по 98: qty = 100·bf/98
  const g = G({ rv: 1, orders: 2 }), b = new E.Bot(g, null, null), bf = 1 + 0.799 / 200;
  [C(0, 100, 100, 100, 100), C(1, 100, 101.5, 99.5, 101.2), C(2, 100, 100, 100, 100), C(3, 100, 100, 97.9, 98.5)].forEach((r, i) => b.step(i, r, true));
  near(b.pos.bf, bf); near(b.pos.q, bf + 100 * bf / 98, 1e-9);
});

test('ATR сталих свічок дорівнює їхньому діапазону', () => {
  const A = Array.from({ length: 30 }, (_, i) => C(i, 100, 101, 99, 100));
  near(E.atr(A, 10).at(-1), 2);
});

test('HMA лінійного ряду: запізнення 5/3 (n = 50)', () => {
  // WMA(n) лінійного ряду запізнюється на (n−1)/3. 2·WMA(25) − WMA(50): i − 16 + 49/3 = i + 1/3;
  // WMA(7) від нього: (i + 1/3) − 6/3 = i − 5/3
  const c = Array.from({ length: 120 }, (_, i) => i);
  near(E.hma(c, 50).at(-1), 119 - 5 / 3, 1e-9);
});

test('SuperTrend і Parabolic SAR: напрям тренду', () => {
  const up = Array.from({ length: 60 }, (_, i) => C(i, 100 + i, 101 + i, 99 + i, 100.5 + i));
  const dn = Array.from({ length: 60 }, (_, i) => C(i, 200 - i, 201 - i, 199 - i, 199.5 - i));
  assert.equal(E.supertrend(up).at(-1), 1); assert.equal(E.supertrend(dn).at(-1), -1);
  assert.equal(E.psar(up).at(-1), 1); assert.equal(E.psar(dn).at(-1), -1);
});

test('Сигнали Keltner і «% зміни ціни»', () => {
  // рівні свічки по 100 (EMA20 = 100, ATR10 = 2), остання закривається на 90 < 100 − 2·2 → Long
  const A = Array.from({ length: 40 }, (_, i) => C(i, 100, 101, 99, 100)); A.push(C(40, 100, 100, 89, 90));
  const g = G({ sg: ['kc'] });
  assert.equal(E.SIG.kc(A, g).at(-1), 1);
  // 24 свічки тому 100, зараз 90: −10 % ≤ −3 % → Long; зростання +5 % → Short
  assert.equal(E.SIG.pc(A, g).at(-1), 1);
  const B = Array.from({ length: 30 }, (_, i) => C(i, 100, 101, 99, 100)); B.push(C(30, 100, 106, 100, 105));
  assert.equal(E.SIG.pc(B, g).at(-1), -1);
});

test('Ручне закриття за ринком: PnL з комісією тейкера, угода з позначкою «вручну»', () => {
  // вхід 100 USDT по 100: q = 1, комісія входу 0.1. Закриття по 102: 1·102 − 100 − 0.1 − 0.001·102 = 1.798
  const b = new E.Bot(G(), null, null); b.step(0, C(0, 100, 100, 100, 100), true);
  const ev = b.manual('close', 102, T0 + 5 * H1);
  assert.equal(ev.kind, 'close'); assert.equal(ev.mn, 1); near(ev.pnl, 1.798);
  assert.equal(b.pos, null); assert.equal(b.tr.length, 1); assert.equal(b.tr[0].mn, 1); assert.equal(b.nd, 1); near(b.cum, 1.798);
  assert.equal(b.manual('close', 102, T0), null, 'без позиції — нічого');
});

test('Позапланова докупівля: позиція більша, драбина сітки не зсувається', () => {
  // 2 ордери, крок 2 %: наступна докупівля моделі по 98. Ручна докупівля 50 USDT по 95: q = 50/95, cost +50, комісія 0.05
  const b = new E.Bot(G({ orders: 2 }), null, null); b.step(0, C(0, 100, 100, 100, 100), true);
  const ev = b.manual('add', 95, T0 + H1, 50);
  assert.equal(ev.kind, 'madd'); near(ev.notional, 50);
  near(b.pos.q, 1 + 50 / 95); near(b.pos.cost, 150); near(b.pos.real, -0.1 - 0.05); assert.equal(b.pos.n, 1); assert.equal(b.pos.last, 100);
  // ціна торкається 98 — спрацьовує звичайна докупівля сітки
  b.step(1, C(1, 99, 99, 97.9, 98.5), false); assert.equal(b.pos.n, 2);
  assert.equal(b.manual('add', 95, T0, 0), null, 'нульова сума — нічого');
});

test('Ручне закриття — за комісією тейкера (ринковий ордер), не мейкера', () => {
  // ф'ючерси: тейкер 0.05 %, мейкер 0.02 %. Вхід 100 по 100: комісія 0.05. Закриття по 102: 2 − 0.05 − 0.0005·102 = 1.899
  const b = new E.Bot(G({ ftk: 0.0005, fmk: 0.0002 }), null, null); b.step(0, C(0, 100, 100, 100, 100), true);
  near(b.manual('close', 102, T0 + H1).pnl, 1.899);
});

// ---------- вихід за сигналом ----------
// 40 рівних свічок по 100, 24 свічки падіння до 95 (сигнал «% зміни ціни» Long: −3 % за 24 свічки),
// потім 30 свічок відновлення до 100 (сигнал Short: +3 % за 24 свічки → вихід Long)
const pcSeries = () => { const A = []; for (let i = 0; i < 40; i++) A.push(C(i, 100, 100, 100, 100));
  for (let i = 0; i < 24; i++) { const c = 100 - 5 * (i + 1) / 24; A.push(C(40 + i, c, c, c, c)); }
  for (let i = 0; i < 30; i++) { const c = 95 + 5 * (i + 1) / 30; A.push(C(64 + i, c, c, c, c)); } return A; };
const gx = (o) => G({ sg: ['pc'], k: 1, xs: 'pc', tp: 0.5, sl: 0.5, ...o });

test('Вихід за сигналом: Long закривається за ринком на закритті свічки, коли «% зміни» дає протилежний сигнал', () => {
  const A = pcSeries(), g = gx({ ftk: 0.0005, fmk: 0.0002 }), e = E.entry(A, g), R = E.run(A, e, g, 0, 0, 0), t = R.b.tr[0]; // тейкер 0.05 %, мейкер 0.02 %
  assert.ok(e.x && e.x.length === A.length, 'масив виходів є');
  assert.equal(R.b.tr.length, 1); assert.equal(t.xs, 1); assert.ok(!t.sl && !t.liq);
  const ent = t.f[0].p, ex = t.f.at(-1).p, q = 100 / ent, ts = t.ts, i = A.findIndex((r) => r.t === ts);
  near(ex, A[i].c, 1e-9, 'вихід за ціною закриття'); assert.ok(A[i].c / A[i - 24].c - 1 >= 0.03, 'на цій свічці сигнал Short');
  const i0 = A.findIndex((r) => r.t === t.f[0].t), first = A.findIndex((r, j) => j > i0 && e.x[j] && r.c >= ent);
  assert.equal(i, first, 'вийшов на першій свічці після входу з сигналом і прибутком');
  near(t.pnl, q * ex - 100 - 0.0005 * 100 - 0.0005 * q * ex, 1e-9, 'PnL: комісії входу й виходу — тейкер');
  assert.equal(R.b.pos, null);
});

test('Вихід за сигналом: мін. прибуток більший за досяжний — позиція лишається', () => {
  const A = pcSeries(), g = gx({ xmin: 0.5 }), R = E.run(A, E.entry(A, g), g, 0, 0, 0);
  assert.equal(R.b.tr.length, 0); assert.ok(R.b.pos);
});

test('Вихід за сигналом: без індикатора, з невідомою назвою й службовим ключем — не діє', () => {
  const A = pcSeries();
  for (const xs of ['', 'нема', 'constructor', '__proto__']) {
    const g = gx({ xs }), e = E.entry(A, g); assert.equal(e.x, undefined, `xs=${xs}`);
    assert.equal(E.run(A, e, g, 0, 0, 0).b.tr.length, 0);
  }
});

test('Масив виходів переживає e.slice() (бектест і walk-forward працюють зі зрізами)', () => {
  const A = pcSeries(), g = gx(), e = E.entry(A, g), s = e.slice(10), s2 = s.slice(5, 40);
  assert.equal(s.length, A.length - 10); assert.deepEqual(s.x, e.x.slice(10)); assert.equal(s2.x.length, 35); assert.deepEqual(s2.x, e.x.slice(15, 50));
  const full = E.run(A, e, g, 0, 0, 0), part = E.run(A.slice(10), s, g, 0, 0, 0);
  assert.equal(part.b.tr.length, full.b.tr.length); assert.equal(part.b.tr[0].xs, 1);
});

test('Вихід за сигналом: Short закривається протилежним сигналом (Long-сигнал падіння)', () => {
  // дзеркальний ряд: зростання → Short-вхід, потім падіння ≥ 3 % за 24 свічки → вихід
  const A = pcSeries().map((r, i) => C(i, 200 - r.o, 200 - r.l, 200 - r.h, 200 - r.c)), g = gx({ d: -1 }), R = E.run(A, E.entry(A, g), g, 0, 0, 0);
  assert.equal(R.b.tr.length, 1); assert.equal(R.b.tr[0].xs, 1);
});

// ---------- вхід лімітним ордером з відступом (g.fo), скасування за відходом ціни (g.pu) і часом (g.fw) ----------
const play2 = (g, cs, sig) => { const b = new E.Bot(g, null, null); cs.forEach((r, i) => b.step(i, r, sig.includes(i))); return b; };

test('Лімітний вхід: виставляється на закритті свічки сигналу, виконується з наступної свічки за рівнем (комісія мейкера)', () => {
  // сигнал на свічці 0 (закриття 100), відступ 2 % → рівень 98. Свічка 0 сама опускалась до 97 — не рахується (вхід ще не виставлено)
  const g = G({ fo: 0.02, ftk: 0.0005, fmk: 0.0002 }), b = new E.Bot(g, null, null);
  b.step(0, C(0, 100, 100, 97, 100), true);
  assert.equal(b.pos, null); assert.ok(b.pe); near(b.pe.px, 98); near(b.pe.q, 100 / 98);
  b.step(1, C(1, 100, 101, 99, 100), false); assert.equal(b.pos, null, 'не дійшла до 98');
  b.step(2, C(2, 100, 100, 97.5, 99), false);
  assert.ok(b.pos); near(b.pos.first, 98); near(b.pos.q, 100 / 98); near(b.pos.real, -0.0002 * 100, 1e-9, 'комісія мейкера'); assert.equal(b.pe, null);
  assert.equal(b.pos.pt, C(0).t, 'pt — час свічки сигналу');
});

test('Лімітний вхід: «підтягування» — ціна пішла вгору на pu, вхід скасовано, бот чекає новий сигнал', () => {
  const g = G({ fo: 0.02, pu: 0.03 }), b = new E.Bot(g, null, null);
  b.step(0, C(0, 100, 100, 100, 100), true);
  b.step(1, C(1, 100, 103.5, 99, 103), false);   // high 103.5 ≥ 100·1.03
  assert.equal(b.pe, null); assert.equal(b.pos, null);
  b.step(2, C(2, 103, 103, 103, 103), true); near(b.pe.px, 103 * 0.98, 1e-9, 'новий сигнал — новий рівень від нової ціни');
});

test('Лімітний вхід: скасування через fw свічок; торкання обох рівнів в одній свічці — вхід', () => {
  const b = new E.Bot(G({ fo: 0.02, fw: 2 }), null, null);
  b.step(0, C(0, 100, 100, 100, 100), true); b.step(1, C(1, 100, 101, 99, 100), false); assert.ok(b.pe);
  b.step(2, C(2, 100, 101, 99, 100), false); assert.equal(b.pe, null, 'минуло 2 свічки');
  const c = new E.Bot(G({ fo: 0.02, pu: 0.03 }), null, null);
  c.step(0, C(0, 100, 100, 100, 100), true); c.step(1, C(1, 100, 104, 97, 101), false);
  assert.ok(c.pos, 'одна свічка й до 97, і до 104 — вхід'); near(c.pos.first, 98);
});

test('Лімітний вхід для Short: рівень вище ціни, скасування при падінні', () => {
  const b = new E.Bot(G({ d: -1, fo: 0.02, pu: 0.03 }), null, null);
  b.step(0, C(0, 100, 100, 100, 100), true); near(b.pe.px, 102);
  b.step(1, C(1, 100, 101, 96.5, 97), false); assert.equal(b.pe, null, 'ціна впала на 3 % — скасовано');
  b.step(2, C(2, 97, 97, 97, 97), true); b.step(3, C(3, 97, 99, 96, 98), false); near(b.pos.first, 97 * 1.02, 1e-9);
});

test('Підхопити позицію з біржі: модель веде її як першу угоду, далі — звичайна драбина й TP', () => {
  // позиція 2 за 50 (100 USDT), без комісії входу; 2 ордери, крок 2 %: докупівля по 49; TP 1 % від середньої
  const b = new E.Bot(G({ orders: 2 }), null, null), ev = b.adopt(50, 2, T0);
  assert.equal(ev.kind, 'adopt'); near(ev.notional, 100); near(b.pos.real, 0); assert.equal(b.pos.ad, 1);
  b.step(1, C(1, 50, 50, 48.9, 49.2), false); assert.equal(b.pos.n, 2, 'докупівля сітки');
  assert.equal(b.adopt(50, 1, T0), null, 'угода вже є — не підхоплює');
  const c = new E.Bot(G({ fo: 0.02 }), null, null); c.step(0, C(0, 100, 100, 100, 100), true);
  assert.equal(c.adopt(100, 1, T0), null, 'чекає лімітного входу — не підхоплює');
  assert.equal(new E.Bot(G(), null, null).adopt(0, 1, T0), null);
});
