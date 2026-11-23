// Наскрізна симуляція серверного бота: модель (processBot) і підставна біржа Bybit Demo проходять сотні свічок
// так само, як це робить runner кожні 5 хвилин. Біржа сама виконує лімітні докупівлі, TP, SL і трейлінг
// усередині свічки, а сервер після закриття свічки виконує дії моделі (handleBot).
// Перевіряється: ордери не дублюються; модель і біржа не розходяться (немає тривог звірки);
// після закриття угоди в моделі на біржі не лишається позиції чи ордерів бота; збої відновлюються.
import test from 'node:test';
import assert from 'node:assert/strict';
import { processBot, botConfig } from '../supabase/functions/runner/core.js';
import { handleBot, ladder, owners, reconcile } from '../supabase/functions/runner/mirror.js';
import { dayStart, riskBlock } from '../supabase/functions/runner/risk.js';

const H = 36e5, T0 = Date.UTC(2026, 0, 5), BOT = '7a3fa244-1f54-4e8a-b91f-b66840e2d3b7';
const F = { step: 0.1, minQty: 0.1, minN: 5, tick: 0.0001 };

function series(n, seed, vol = 0.018, px = 2.5) {
  let s = seed, c = px; const R = () => (s = (s * 16807) % 2147483647) / 2147483647, o = [];
  for (let i = 0; i < n; i++) { const op = c; c *= 1 + (R() - 0.5) * 2 * vol; o.push({ t: T0 + i * H, o: op, h: Math.max(op, c) * (1 + R() * vol * 0.6), l: Math.min(op, c) * (1 - R() * vol * 0.6), c, v: 1 }); }
  return o;
}

/* підставна біржа: одна позиція, лімітні ордери, TP/SL/трейлінг на позиції; ціна йде o → (l,h або h,l) → c */
function simEx() {
  const S = { px: 0, pos: null, orders: [], links: new Set(), dup: 0, fills: [], ghost: 0, t: 0, closed: [], slip: 0.002 };
  const fill = (side, qty, price) => {
    const sg = side === 'BUY' ? 1 : -1, p = S.pos;
    S.fills.push({ side, qty, price });
    if (!p) { S.pos = { amt: sg * qty, entry: price, tp: 0, sl: 0, ts: 0, ap: 0, peak: 0, act: 0 }; return; }
    if (Math.sign(p.amt) === sg) { const q = Math.abs(p.amt) + qty; p.entry = (p.entry * Math.abs(p.amt) + price * qty) / q; p.amt = sg * q; }
    else { // закриття (повне чи часткове) — запис для обліку результатів на біржі, як closed-pnl Bybit
      S.closed.push({ id: 'c' + S.closed.length, t: S.t, pnl: -sg * (price - p.entry) * qty, q: qty, px: price });
      const q = +(Math.abs(p.amt) - qty).toFixed(8); if (q <= 1e-9) S.pos = null; else p.amt = -sg * q; } // як на Bybit: лімітні ордери після закриття позиції лишаються
  };
  const order = (link, o) => {
    if (link) { if (S.links.has(link)) { S.dup++; const e = new Error('OrderLinkedID is duplicate'); e.code = 110072; throw e; } S.links.add(link); }
    S.orders.push({ link, ...o }); return o;
  };
  const close = (price) => { const p = S.pos; fill(p.amt > 0 ? 'SELL' : 'BUY', Math.abs(p.amt), price); };
  const at = (price) => {
    S.px = price;
    for (const o of S.orders) if (o.status === 'New' && (o.side === 'BUY' ? price <= o.price : price >= o.price)) { o.status = 'Filled'; if (!S.pos) S.ghost++; fill(o.side, o.qty, o.price); }
    const p = S.pos; if (!p) return;
    const d = Math.sign(p.amt);
    if (p.sl && (d > 0 ? price <= p.sl : price >= p.sl)) return close(p.sl);
    if (p.tp && (d > 0 ? price >= p.tp : price <= p.tp)) return close(p.tp);
    if (p.ts) {
      if (!p.act && (!p.ap || (d > 0 ? price >= p.ap : price <= p.ap))) { p.act = 1; p.peak = price; }
      if (p.act) { p.peak = d > 0 ? Math.max(p.peak, price) : Math.min(p.peak, price); const st = p.peak - d * p.ts; if (d > 0 ? price <= st : price >= st) return close(st); if (d > 0 ? st > p.sl : !p.sl || st < p.sl) p.sl = +st.toFixed(4); }
    }
  };
  return {
    native: true, S,
    path(c) { const up = c.c >= c.o; return [c.o, up ? c.l : c.h, up ? c.h : c.l, c.c]; },
    at,
    candle(c) { for (const x of this.path(c)) at(x); },
    async positions() { return S.pos ? [{ symbol: 'SIMUSDT', ...S.pos, mark: S.px }] : []; },
    async closedPnl(_s, start) { return S.closed.filter((x) => x.t >= start).slice(-50); },
    async filt() { return F; },
    async mark() { return S.px; },
    async leverage() {},
    async market(_s, side, qty, reduceOnly, link) {
      if (reduceOnly && !S.pos) { const e = new Error('position is zero'); e.code = 110017; throw e; }
      // ринковий вхід — із прослизанням проти напрямку (як наживо: модель входить за закриттям свічки, біржа — трохи гірше)
      const px = reduceOnly ? S.px : +(S.px * (1 + (side === 'BUY' ? 1 : -1) * S.slip)).toFixed(6);
      order(link, { side, qty, price: px, status: 'Filled' }); fill(side, qty, px);
      return { id: S.orders.length, qty, price: px, link };
    },
    async limit(_s, side, qty, price, link) { order(link, { side, qty, price, status: 'New' }); return { id: S.orders.length, qty, price, link }; },
    async byLink(_s, link) { const o = S.orders.find((x) => x.link === link); return o ? { id: 1, qty: o.qty, price: o.price, status: o.status, link } : null; },
    async openOrders() { return S.orders.filter((o) => o.status === 'New').map((o) => ({ link: o.link, price: o.price, qty: o.qty })); },
    async cancel(_s, link) { const o = S.orders.find((x) => x.link === link && x.status === 'New'); if (o) o.status = 'Cancelled'; },
    async cancelAll() { for (const o of S.orders) if (o.status === 'New') o.status = 'Cancelled'; },
    async tradingStop(_s, { tp, sl, ts = 0, ap = 0 }) { const p = S.pos; if (!p) { const e = new Error('position is zero'); e.code = 10001; throw e; } Object.assign(p, { tp, sl, ts, ap }); if (!ts) { p.act = 0; } },
  };
}

/* прогін: history свічок для індикаторів, далі кожна свічка — спершу біржа живе всередині неї, потім запуск сервера */
/* збої біржі (опція flaky — частка запитів): перевірка ордера byLink не відповідає; біржа прийняла ордер, а відповідь загубилась.
   Ручний ордер користувача на тій самій парі (опція manual) — має дожити до кінця. */
function chaos(ex, rate, seed) {
  let s = seed * 9301 + 49297; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const bl = ex.byLink.bind(ex), mk = ex.market.bind(ex), lm = ex.limit.bind(ex);
  ex.S.lost = 0; ex.S.down = 0;
  ex.byLink = async (...a) => { if (rnd() < rate) { ex.S.down++; throw new Error('timeout'); } return bl(...a); };
  ex.market = async (...a) => { const r = await mk(...a); if (rnd() < rate) { ex.S.lost++; throw new Error('socket hang up'); } return r; };
  ex.limit = async (...a) => { const r = await lm(...a); if (rnd() < rate) { ex.S.lost++; throw new Error('socket hang up'); } return r; };
}
const own = (ex) => ex.S.orders.filter((o) => o.status === 'New' && String(o.link).startsWith('ox'));

async function simulate(cfg, { n = 600, seed = 7, crashEvery = 0, pauses = [], vol = 0.018, flaky = 0, manual = false, limits = null } = {}) {
  const g = botConfig({ pair: 'SIM/USDT', tf: 1, fut: 1, lev: 3, sg: ['rsi'], k: 1, rm: 45, orders: 4, base: 20, step: 0.02, smul: 1.2, mult: 1.5, tp: 0.012, sl: 0.08, ...cfg });
  const cs = series(n, seed, vol), ex = simEx(), logs = [], notes = [];
  if (flaky) chaos(ex, flaky, seed);
  if (manual) ex.S.orders.push({ link: 'manual-1', side: 'BUY', qty: 1, price: cs[0].c * 0.01, status: 'New' }, { link: '', side: 'SELL', qty: 1, price: cs[0].c * 100, status: 'New' });
  let stored = null, ver = 0, alarms = 0, trades = 0, maxGap = 0, crashes = 0, alarm = '', beBad = '', ladBad = '', ghostLive = 0;
  const hist = 120;
  stored = { ...processBot({ g, state: null, candles: cs.slice(0, hist), now: cs[hist - 1].t + H + 3e5 }).state, pend: [], fl: {} };
  const paused = (i) => pauses.some(([a, b]) => i >= a && i < b);
  // інтервали роботи бота, як config._sp: пауза на свічках a…b-1, свічки, що закрились під час паузи, модель пропускає
  const sp = []; { let from = cs[hist].t - 1; for (const [a, b] of pauses) { sp.push([from, cs[a].t]); from = cs[b].t; } sp.push([from, null]); }
  const spans = pauses.length ? sp : null;
  // ліміти ризику, як у runner: перевірка перед кожним прогоном моделі; dayOpens — входи, відкриті, коли збиток доби за даними біржі вже досяг ліміту
  let skipped = 0, blocked = 0, badOpen = '', maxOwn = 0;
  const riskAt = (at) => (limits ? riskBlock({ limits, self: { g, state: stored }, now: at }) : null);
  const exDay = (at) => ex.S.closed.reduce((a, x) => a + (x.t >= dayStart(at) && x.t <= at ? x.pnl : 0), 0);
  const checkOpens = (r, at) => { if (limits && limits.dayLoss && r.events.some((e) => e.kind === 'open') && exDay(at) <= -limits.dayLoss - 1e-9) badOpen ||= `вхід о ${new Date(at).toISOString()} при збитку доби ${exDay(at).toFixed(2)}`; skipped += r.skipped || 0; };
  for (let i = hist; i < n; i++) {
    const c = cs[i], now = c.t + H + 3e5, win = cs.slice(Math.max(0, i - 300), i);
    if (paused(i)) { ex.S.t = c.t; ex.candle(c); }
    else {
      // усередині свічки сервер запускається кожні ~5 хв: нових подій моделі немає, але звірка захисту й прибирання ордерів працюють
      const pts = ex.path(c);
      for (let k = 0; k < pts.length; k++) {
        ex.S.t = c.t + k * 15 * 60e3; ex.at(pts[k]);
        if (k === pts.length - 1) break;
        const at = c.t + (k + 1) * 15 * 60e3, bk = riskAt(at), ri = processBot({ g, state: stored, candles: win.concat([c]), now: at, spans, entryOk: !bk });
        checkOpens(ri, at); if (bk) blocked++;
        await handleBot({ bot: { id: BOT, state: stored }, g, r: ri, symbol: 'SIMUSDT', mirror: true, native: true, ex, now: at, risk: limits ? { blk: bk } : null,
          save: async (x) => { stored = JSON.parse(JSON.stringify(x)); return true; }, log: async (l, m) => logs.push([l, m]), notify: async (m) => notes.push(m) });
        if (stored.fl?.mis?.on) { alarms++; alarm ||= `свічка ${i}: ${stored.fl.mis.t}`; }
        // біржа вже закрила угоду (xc), а позиція на біржі є — зайва позиція від залишкової лімітної докупівлі
        if (stored.fl?.xc && ex.S.pos) ghostLive++;
      }
    }
    if (paused(i)) { stored = { ...stored, fl: { ...stored.fl, parked: 1 } }; if (paused(i) && !paused(i - 1)) for (const o of own(ex)) o.status = 'Cancelled'; continue; }
    const bk = riskAt(now), r = processBot({ g, state: stored, candles: cs.slice(Math.max(0, i - 299), i + 1), now, spans, entryOk: !bk });
    checkOpens(r, now); if (bk) blocked++;
    // збій: на 1-му збереженні (до біржі) або на 2-му (ордери вже на біржі, а черга дій ще не очищена)
    let saves = 0;
    const save = async (s) => {
      saves++;
      if (crashEvery && r.events.length && i % crashEvery === 0) {
        if (saves === 1 && (i / crashEvery) % 2 === 0) { stored = JSON.parse(JSON.stringify(s)); throw new Error('worker killed'); }
        if (saves === 2 && (i / crashEvery) % 2 === 1) throw new Error('worker killed');
      }
      stored = JSON.parse(JSON.stringify(s)); ver++; return true;
    };
    const run = (rr, at, sv) => handleBot({ bot: { id: BOT, state: stored }, g, r: rr, symbol: 'SIMUSDT', mirror: true, native: true, ex, now: at, save: sv, risk: limits ? { blk: bk } : null, log: async (l, m) => logs.push([l, m]), notify: async (m) => notes.push(m) });
    try { await run(r, now, save); }
    catch (e) {
      if (e.message !== 'worker killed') throw e;
      // збій: наступний запуск розкладу через 5 хвилин — нових свічок немає, дії беруться з черги в стані
      crashes++;
      const b2 = riskAt(now + 3e5), r2 = processBot({ g, state: stored, candles: cs.slice(Math.max(0, i - 299), i + 1), now: now + 3e5, spans, entryOk: !b2 });
      checkOpens(r2, now + 3e5);
      await run(r2, now + 3e5, async (x) => { stored = JSON.parse(JSON.stringify(x)); return true; });
    }
    trades += r.events.filter((e) => e.kind === 'open').length;
    if (stored.fl?.mis?.on) { alarms++; alarm ||= `свічка ${i}: ${stored.fl.mis.t}`; }
    const mp = stored.b?.pos || null;
    maxOwn = Math.max(maxOwn, own(ex).length);
    if (!mp && !stored.pend?.length) {
      assert.equal(ex.S.pos, null, `свічка ${i}: модель без позиції, а на біржі позиція ${ex.S.pos && ex.S.pos.amt}`);
      assert.equal(own(ex).length, 0, `свічка ${i}: модель без позиції, а на біржі лишились ордери бота`);
    }
    if (mp && ex.S.pos) maxGap = Math.max(maxGap, Math.abs(Math.abs(ex.S.pos.amt) - mp.q) / mp.q);
    if (mp && ex.S.pos && !stored.pend?.length && !stored.fl?.xc) {
      // після TP1 з беззбитком стоп на біржі там же, де в моделі
      if (mp.t1 && mp.be > 0 && !g.trail && Math.abs(ex.S.pos.sl - mp.be) > F.tick * 1.01) beBad ||= `свічка ${i}: SL на біржі ${ex.S.pos.sl}, беззбиток моделі ${mp.be}`;
      // поки модель може докуповувати, на біржі стоїть драбина (хіба що біржа вже виконала всі рівні)
      if (!mp.t1 && mp.n < g.orders && stored.fl?.e0 > 0) {
        const full = Math.abs(ex.S.pos.amt) >= ladder(g, stored.fl.e0, F).reduce((a, x) => a + x.qty, 0) * 0.98;
        if (!full && !own(ex).length) ladBad ||= `свічка ${i}: модель на рівні ${mp.n} з ${g.orders}, а лімітних докупівель на біржі немає`;
      }
    }
  }
  const errs = logs.filter(([l]) => l === 'error').map(([, m]) => m);
  // облік результатів на біржі (Demo проти моделі): кожне закриття на біржі записано один раз, нічого не загублено
  const xr = stored.xr, want = ex.S.closed.filter((x) => x.t >= xr.from).slice(-50).map((x) => x.id), got = xr.l.map((x) => x.id);
  const xrBad = new Set(got).size !== got.length ? 'повторний запис закриття' : want.join() !== got.join() ? `закриття на біржі ${want.length}, записано ${got.length}` : '';
  return { g, ex, logs, notes, alarms, alarm, trades, errs, maxGap, stored, crashes, beBad, ladBad, xrBad, xr, ghostLive, skipped, blocked, badOpen, maxOwn };
}

for (const [name, cfg] of [
  ['Long', { d: 1 }],
  ['Short', { d: -1 }],
  ['Long з трейлінгом', { d: 1, trail: 0.006 }],
  ['Short з трейлінгом', { d: -1, trail: 0.006 }],
  ['Long з частковою фіксацією і беззбитком', { d: 1, s1: 0.5, tp2: 0.02, be: 1 }],
  ['Short з частковою фіксацією', { d: -1, s1: 0.5, tp2: 0.02 }],
]) {
  test(`Симуляція ${name}: угоди йдуть, ордери не дублюються, модель і біржа не розходяться`, async () => {
    for (const seed of [7, 11, 23]) {
      const s = await simulate(cfg, { seed });
      assert.ok(s.trades >= 3, `seed ${seed}: замало угод (${s.trades}) — симуляція нічого не перевіряє`);
      assert.equal(s.ex.S.dup, 0, `seed ${seed}: повторний orderLinkId`);
      assert.deepEqual(s.errs, [], `seed ${seed}: помилки біржі`);
      assert.equal(s.alarms, 0, `seed ${seed}: тривога звірки — ${s.alarm}`);
      assert.equal(s.beBad, '', `seed ${seed}: ${s.beBad}`); assert.equal(s.ladBad, '', `seed ${seed}: ${s.ladBad}`);
      assert.equal(s.ghostLive, 0, `seed ${seed}: зайва позиція від залишкової докупівлі пережила ${s.ghostLive} запуск(ів) (виконань без позиції: ${s.ex.S.ghost})`);
      assert.equal(s.xrBad, '', `seed ${seed}: ${s.xrBad}`); assert.ok(s.xr.l.length >= 3 && s.xr.en.length >= 3, `seed ${seed}: облік результатів порожній`);
    }
  });
}

test('Симуляція зі збоями: робочий процес падає після збереження стану — дії виконуються наступного запуску без дублів', async () => {
  for (const seed of [7, 11]) {
    const s = await simulate({ d: 1 }, { seed, crashEvery: 3 });
    assert.ok(s.crashes >= 5, `збоїв ${s.crashes}`); assert.ok(s.trades >= 3); assert.equal(s.ex.S.dup, 0); assert.deepEqual(s.errs, []); assert.equal(s.alarms, 0); assert.equal(s.xrBad, ''); assert.equal(s.ghostLive, 0);
  }
});

test('Симуляція з ненадійною біржею: перевірки ордерів не відповідають, відповіді на ордери губляться — дублів немає, ручні ордери живі', async () => {
  for (const [seed, d, cfg, pauses] of [[7, 1, {}], [11, -1, {}], [23, 1, { s1: 0.5, tp2: 0.02, be: 1 }], [7, 1, { trail: 0.006 }], [11, 1, {}, [[200, 215], [320, 340], [450, 470]]]]) {
    const s = await simulate({ d, ...cfg }, { seed, flaky: 0.08, manual: true, pauses: pauses || [] });
    assert.ok(s.ex.S.down >= 10 && s.ex.S.lost >= 3, `seed ${seed}: збоїв замало (перевірок ${s.ex.S.down}, загублених відповідей ${s.ex.S.lost})`);
    assert.ok(s.trades >= 3, `seed ${seed}: угод ${s.trades}`);
    assert.equal(s.ex.S.dup, 0, `seed ${seed}: повторний orderLinkId — ордер надіслано вдруге, хоча статус попереднього був невідомий`);
    const filled = s.ex.S.orders.filter((o) => o.status === 'Filled' && o.link), ids = filled.map((o) => o.link);
    assert.equal(new Set(ids).size, ids.length, `seed ${seed}: два виконання з одним ідентифікатором`);
    assert.equal(s.ex.S.orders.filter((o) => !String(o.link).startsWith('ox') && o.status === 'New').length, 2, `seed ${seed}: ручні ордери користувача знято`);
    assert.equal(s.ghostLive, 0, `seed ${seed}: зайва позиція`);
    assert.ok(!s.logs.some(([, m]) => /знято після/.test(m)), `seed ${seed}: дію загублено після ${'MAX_TRIES'} спроб`);
  }
});

test('Симуляція з денним лімітом збитку: після збитку доби нових входів немає, з нової доби UTC бот торгує знову; без тривог і дублів', async () => {
  // сценарії, де трапляються збиткові доби (стоп-лос близько −38 USDT); денний ліміт 3 USDT
  let hit = 0;
  for (const [seed, d] of [[31, 1], [17, -1], [19, 1]]) {
    const free = await simulate({ d }, { seed, n: 900 });
    const s = await simulate({ d }, { seed, n: 900, limits: { dayLoss: 3 } });
    assert.equal(s.badOpen, '', `seed ${seed}: ${s.badOpen}`);
    assert.equal(s.ex.S.dup, 0); assert.deepEqual(s.errs, []); assert.equal(s.alarms, 0, `seed ${seed}: тривога звірки — ${s.alarm}`); assert.equal(s.ghostLive, 0); assert.equal(s.xrBad, '');
    if (s.skipped) {
      hit++;
      assert.ok(s.trades >= 3 && free.trades >= 3, `seed ${seed}: угоди є`);
      assert.ok(s.logs.some(([l, m]) => l === 'warn' && /Ліміт ризику: нову угоду не відкрито — збиток за сьогодні/.test(m)), `seed ${seed}: попередження в журналі`);
      assert.ok(s.logs.some(([l, m]) => l === 'info' && /Ліміт ризику більше не діє/.test(m)), `seed ${seed}: з нової доби обмеження зняте`);
    }
  }
  assert.equal(hit, 3, `ліміт мав спрацювати в усіх трьох сценаріях (спрацював у ${hit})`);
});

test('Симуляція з частковим виставленням ордерів: на біржі не більше live докупівель, драбина поповнюється, без дублів і тривог', async () => {
  let topped = 0;
  for (const [seed, d, live, opt] of [[7, 1, 1, {}], [11, -1, 1, {}], [23, 1, 2, {}], [7, 1, 1, { flaky: 0.08 }], [11, 1, 1, { pauses: Array.from({ length: 8 }, (_, k) => [140 + k * 50, 146 + k * 50]) }]]) {
    const full = await simulate({ d }, { seed, ...opt });
    const s = await simulate({ d, live }, { seed, ...opt });
    assert.ok(s.trades >= 3, `seed ${seed}: угод ${s.trades}`);
    assert.equal(s.trades, full.trades, `seed ${seed}: модель торгує так само, як без часткового виставлення`);
    assert.ok(s.maxOwn <= live, `seed ${seed}: на біржі ${s.maxOwn} ордерів бота при live = ${live}`);
    assert.ok(full.maxOwn > live, `seed ${seed}: без часткового виставлення стоїть уся драбина (${full.maxOwn})`);
    assert.equal(s.ex.S.dup, 0, `seed ${seed}: повторний orderLinkId`); assert.deepEqual(s.errs.filter((m) => !/timeout|недоступн|збій/i.test(m)), [], `seed ${seed}: помилки`);
    const ids = s.ex.S.orders.filter((o) => o.status === 'Filled' && o.link).map((o) => o.link); assert.equal(new Set(ids).size, ids.length, `seed ${seed}: два виконання з одним ідентифікатором`);
    assert.equal(s.alarms, 0, `seed ${seed}: тривога звірки — ${s.alarm}`); assert.equal(s.ladBad, '', `seed ${seed}: ${s.ladBad}`); assert.equal(s.ghostLive, 0); assert.equal(s.xrBad, '');
    topped += s.logs.filter(([, m]) => /докладено \d+ лімітн/.test(m)).length;
  }
  assert.ok(topped >= 5, `драбину поповнено лише ${topped} раз(и)`);
});

test('Симуляція з паузами: після зняття з паузи драбина повертається, модель і біржа не розходяться', async () => {
  let restored = 0;
  const pauses = Array.from({ length: 11 }, (_, k) => [140 + k * 42, 140 + k * 42 + 6]); // часті паузи, щоб частина припала на відкриту угоду
  for (const seed of [7, 11, 23]) {
    const s = await simulate({ d: 1 }, { seed, pauses });
    assert.equal(s.ex.S.dup, 0); assert.deepEqual(s.errs, []);
    assert.equal(s.alarms, 0, `seed ${seed}: ${s.alarm}`);
    assert.equal(s.ladBad, '', `seed ${seed}: ${s.ladBad}`);
    restored += s.logs.filter(([, m]) => /відновлено \d+ лімітн/.test(m)).length;
  }
  assert.ok(restored >= 2, `драбину відновлено лише ${restored} раз(и) — паузи не припали на відкриті угоди`);
});

test('Різкі стрибки ціни (волатильність ×3): стоп, пройдений між запусками, закриває позицію, без дублів і тривог', async () => {
  for (const [cfg, seed] of [[{ d: 1 }, 7], [{ d: -1 }, 11], [{ d: 1, trail: 0.006 }, 23]]) {
    const s = await simulate(cfg, { seed, vol: 0.05 });
    assert.ok(s.trades >= 3); assert.equal(s.ex.S.dup, 0); assert.deepEqual(s.errs, []);
    assert.equal(s.alarms, 0, `${JSON.stringify(cfg)} seed ${seed}: ${s.alarm}`);
  }
});

test('Ручне закриття позиції на біржі: бот нічого не відкриває сам, нова угода — лише за наступним сигналом моделі', async () => {
  const g = botConfig({ pair: 'SIM/USDT', tf: 1, fut: 1, lev: 3, sg: ['rsi'], k: 1, rm: 45, orders: 4, base: 20, step: 0.02, mult: 1.5, tp: 0.012, sl: 0.08, d: 1 });
  const ex = simEx(), cs = series(600, 11);
  let st = { ...processBot({ g, state: null, candles: cs.slice(0, 120), now: cs[119].t + H + 3e5 }).state, pend: [], fl: {} }, closedAt = -1, tradeT = null, opensAfter = 0;
  for (let i = 120; i < 600; i++) {
    ex.candle(cs[i]);
    if (closedAt < 0 && ex.S.pos && st.b?.pos && st.b.pos.n === 1) { // «руками» закрити позицію й ордери в Bybit
      ex.S.pos = null; for (const o of ex.S.orders) if (o.status === 'New') o.status = 'Cancelled';
      closedAt = i; tradeT = st.b.pos.f[0].t;
    }
    const buys0 = ex.S.fills.filter((f) => f.side === 'BUY').length;
    const r = processBot({ g, state: st, candles: cs.slice(Math.max(0, i - 299), i + 1), now: cs[i].t + H + 3e5 });
    await handleBot({ bot: { id: BOT, state: st }, g, r, symbol: 'SIMUSDT', mirror: true, native: true, ex, now: cs[i].t + H + 3e5,
      save: async (x) => { st = JSON.parse(JSON.stringify(x)); return true; }, log: async () => {}, notify: async () => {} });
    const sameTrade = st.b?.pos && st.b.pos.f[0].t === tradeT;
    if (closedAt >= 0 && sameTrade) {
      assert.equal(ex.S.fills.filter((f) => f.side === 'BUY').length, buys0, `свічка ${i}: бот сам відкрив/докупив після ручного закриття`);
      assert.equal((await ex.openOrders()).length, 0, `свічка ${i}: бот поставив ордери після ручного закриття`);
      assert.equal(st.fl.mis?.on, undefined, 'біржа бачила позицію за цієї угоди — це не тривога');
    }
    if (closedAt >= 0 && !sameTrade && r.events.some((e) => e.kind === 'open')) opensAfter++;
    if (opensAfter) break;
  }
  assert.ok(closedAt > 0, 'позиція мала відкритися');
  assert.ok(opensAfter === 1 && ex.S.pos, 'наступна угода моделі знову йде на біржу');
  assert.equal(ex.S.dup, 0);
});

test('Звірка сама по собі: модель із докупівлями всередині свічки не вважається розбіжністю', () => {
  const g = botConfig({ pair: 'SIM/USDT', d: 1, orders: 4, base: 20, lev: 3, step: 0.02, mult: 1.5 });
  assert.equal(reconcile({ q: 24, first: 2.5 }, { amt: 60 }, g), null);
});

test('Кілька ботів: на одній парі одного рахунку угоди веде лише один; різні пари, біржі й користувачі — незалежно', () => {
  const b = (id, user, cfg) => ({ id, user_id: user, config: { pair: 'TON/USDT', _tn: true, fut: 1, ...cfg } });
  const o = owners([
    b('b2', 'u1', {}), b('b1', 'u1', {}),                 // та сама пара — веде b1 (менший id), незалежно від порядку
    b('c1', 'u1', { pair: 'DOT/USDT' }),                  // інша пара
    b('d1', 'u1', { _ex: 'binance' }),                    // інша біржа
    b('a0', 'u2', {}),                                    // інший користувач
    b('a1', 'u1', { _tn: false }), b('a2', 'u1', { fut: 0 }), // без «Тестнет» або спот — на біржу не йдуть
  ]);
  assert.equal(o.get('u1|bybit|TON/USDT'), 'b1');
  assert.equal(o.get('u1|bybit|DOT/USDT'), 'c1');
  assert.equal(o.get('u1|binance|TON/USDT'), 'd1');
  assert.equal(o.get('u2|bybit|TON/USDT'), 'a0');
  assert.equal(o.size, 4);
});

test('Кілька ботів одночасно на одному рахунку: два боти на різних парах і третій-дублікат — ордери не змішуються', async () => {
  // спільний рахунок: окрема підставна біржа на кожен символ (як і на Bybit — позиції окремі за символом)
  const exOf = { TON: simEx(), DOT: simEx() };
  const bots = [
    { id: '1f0c9e2a-7b3d-4e51-9a2c-55d1e0b7a001', pair: 'TON/USDT', seed: 7 },
    { id: '6b2e4d10-93aa-4c7e-8f01-c2d9e7a4b002', pair: 'DOT/USDT', seed: 11 },
    { id: '9d7a1c55-2e8f-4b39-b6d4-0a3f5e8c1003', pair: 'TON/USDT', seed: 7 }, // дублікат першого
  ].map((x) => ({ ...x, user_id: 'u1', config: { pair: x.pair, _tn: true, fut: 1 } }));
  const own = owners(bots), N = 400, hist = 120;
  for (const bot of bots) {
    bot.g = botConfig({ pair: bot.pair, tf: 1, fut: 1, lev: 3, sg: ['rsi'], k: 1, rm: 45, orders: 4, base: 20, step: 0.02, mult: 1.5, tp: 0.012, sl: 0.08, d: 1 });
    bot.cs = series(N, bot.seed); bot.ex = exOf[bot.pair.split('/')[0]];
    bot.st = { ...processBot({ g: bot.g, state: null, candles: bot.cs.slice(0, hist), now: bot.cs[hist - 1].t + H + 3e5 }).state, pend: [], fl: {} };
    bot.mirror = own.get(`u1|bybit|${bot.pair}`) === bot.id; bot.opens = 0;
  }
  for (let i = hist; i < N; i++) {
    for (const ex of Object.values(exOf)) ex.candle(bots.find((b) => b.ex === ex).cs[i]);
    for (const bot of bots) {
      const now = bot.cs[i].t + H + 3e5, r = processBot({ g: bot.g, state: bot.st, candles: bot.cs.slice(Math.max(0, i - 299), i + 1), now });
      bot.opens += r.events.filter((e) => e.kind === 'open').length;
      await handleBot({ bot: { id: bot.id, state: bot.st }, g: bot.g, r, symbol: bot.pair.replace('/', ''), mirror: bot.mirror, native: true, ex: bot.mirror ? bot.ex : null, now,
        save: async (x) => { bot.st = JSON.parse(JSON.stringify(x)); return true; }, log: async () => {}, notify: async () => {} });
    }
  }
  const [ton, dot, dup] = bots;
  assert.ok(ton.mirror && dot.mirror && !dup.mirror);
  assert.ok(ton.opens >= 3 && dot.opens >= 3 && dup.opens >= 3, 'усі моделі торгують');
  // на біржі TON лише ордери першого бота, дублікат жодного разу не ходив на біржу
  const pre = (id) => 'ox' + id.replace(/-/g, '').slice(0, 12);
  assert.ok(exOf.TON.S.orders.every((o) => !o.link || o.link.startsWith(pre(ton.id))));
  assert.ok(!exOf.TON.S.orders.some((o) => o.link && o.link.startsWith(pre(dup.id))));
  assert.ok(exOf.DOT.S.orders.every((o) => !o.link || o.link.startsWith(pre(dot.id))));
  assert.equal(exOf.TON.S.dup + exOf.DOT.S.dup, 0);
  assert.equal(dup.st.fl.mis, undefined, 'у дубліката немає звірки — і немає хибної тривоги');
});
