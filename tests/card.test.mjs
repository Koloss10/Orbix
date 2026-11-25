// Картки сигналів у Telegram (v18): малювання, причини входу, налаштування, сповіщення в handleBot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cardSvg, demoSpec, fmtPrice, levels, priceRange, THEMES, wrap } from '../supabase/functions/tg-card/card.js';
import { cardCaption, cardLines, cardPrefs, cardSpec, catOf, entryReasons, themeFor, wantCard, wantMsg } from '../supabase/functions/runner/signal.js';
import { botConfig } from '../supabase/functions/runner/core.js';
import { entry, Bot } from '../supabase/functions/runner/engine.js';
import { handleBot } from '../supabase/functions/runner/mirror.js';

const g = botConfig({ pair: 'DOT/USDT', d: 1, sg: ['rsi', 'bb'], k: 2, rm: 40, tf: 1, fut: 1, lev: 3, base: 10, mult: 1.7, orders: 5, step: 0.016, smul: 1.2, tp: 0.018, sl: 0.1, trail: 0.005 });
/* модельні свічки: рівно, потім падіння (вхід Long за RSI + Bollinger), потім відскок */
function candles() {
  let s = 7; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const A = []; let p = 0.69, t = Date.UTC(2026, 10, 20);
  for (let i = 0; i < 400; i++) {
    const dr = i > 330 && i < 362 ? -0.0018 : i >= 362 ? 0.0022 : 0.0002, o = p; p = p * (1 + dr + (R() - 0.5) * 0.012);
    A.push({ t, o, h: Math.max(o, p) * (1 + R() * 0.004), l: Math.min(o, p) * (1 - R() * 0.004), c: p, v: 1e5 * (0.5 + R()) }); t += 36e5;
  }
  return A;
}
const A = candles(), ie = entry(A, g).findIndex((x, i) => x && i > 340);

test('причини входу: ті самі сигнали, що спрацювали в рушії, зі значеннями', () => {
  assert.ok(ie > 0, 'у модельних даних є вхід');
  const r = entryReasons(A.slice(0, ie + 1), g);
  assert.match(r[0], /^Спрацювало 2 з 2 сигналів \(потрібно 2\)$/);
  assert.ok(r.some((x) => /^RSI\(14\) = [\d.]+ — нижче 40: ринок перепроданий$/.test(x)), r.join(' | '));
  assert.ok(r.some((x) => /нижче нижньої смуги Bollinger\(20, 2\)/.test(x)));
  // на свічці без входу сигнали не «вигадуються»
  const r0 = entryReasons(A.slice(0, 101), g);
  assert.ok(!entry(A.slice(0, 101), g)[100]);
  assert.match(r0[0], /^Спрацювало [01] з 2/);
});

test('рівні картки: виконані й майбутні докупівлі, середня, TP, SL, ліквідація', () => {
  const b = new Bot(g, null, null); b.step(ie, A[ie], true);
  const L = cardLines(g, b.pos);
  assert.equal(L.entry, A[ie].c);
  assert.equal(L.dca.length, 4);
  assert.ok(L.dca.every((x) => !x.done) && L.dca[0].p < L.entry);
  assert.ok(Math.abs(L.tp / L.avg - 1.018) < 1e-9 && Math.abs(L.sl / L.avg - 0.9) < 1e-9);
  assert.ok(L.liq > 0 && L.liq < L.sl);
  const lv = levels({ lines: L }, THEMES.dark);
  assert.deepEqual(lv.map((x) => x.key), ['entry', 'dca1', 'dca2', 'dca3', 'dca4', 'tp', 'sl', 'liq']);
});

test('картка: заголовок, лінії, логіка, результат; частини вимикаються', () => {
  const b = new Bot(g, null, null); b.step(ie, A[ie], true);
  const spec = cardSpec({ g, ev: { kind: 'open', price: A[ie].c, t: A[ie].t + 36e5 }, pos: b.pos, candles: A.slice(0, ie + 1), reasons: entryReasons(A.slice(0, ie + 1), g), exchange: 'Bybit Demo' });
  const svg = cardSvg(spec);
  assert.match(svg, /^<svg[^>]+width="1000"/);
  for (const t of ['DOT/USDT', 'LONG 3×', 'Відкрито позицію', 'Логіка відкриття', 'Вхід ', 'DCA 1 ', 'TP ', 'SL ']) assert.ok(svg.includes(t), t);
  const off = cardSvg({ ...spec, parts: { logic: false, tpsl: false } });
  assert.ok(!off.includes('Логіка відкриття') && !off.includes('>TP ') && off.includes('DCA 1 '));
  const noChart = cardSvg({ ...spec, parts: { chart: false } });
  assert.ok(!noChart.includes('<rect x="') || noChart.length < svg.length / 2);
});

test('картка закриття: вид за трейлінгом, лінія виходу, результат у % від суми на бота', () => {
  const b = new Bot(g, null, null); for (let i = ie; i < A.length && !b.tr.length; i++) b.step(i, A[i], i === ie);
  const tr = b.tr[0]; assert.ok(tr, 'угода закрилась');
  const spec = cardSpec({ g, ev: { kind: 'close', price: tr.f.at(-1).p, pnl: tr.pnl, t: tr.ts + 36e5 }, trade: tr, candles: A, exchange: 'Bybit Demo' });
  assert.equal(spec.event.kind, 'trail');
  assert.equal(spec.lines.exit, tr.f.at(-1).p);
  const sum = 10 * (1 + 1.7 + 1.7 ** 2 + 1.7 ** 3 + 1.7 ** 4);
  assert.ok(Math.abs(spec.result.pct - (tr.pnl / sum) * 100) < 1e-9);
  assert.ok(cardSvg(spec).includes('Результат угоди'));
  assert.equal(cardSpec({ g: { ...g, trail: 0 }, ev: { kind: 'close', pnl: 1 }, candles: A }).event.kind, 'tp');
  assert.equal(cardSpec({ g, ev: { kind: 'dca', n: 3 }, candles: A }).event.title, 'Докупівля 2 з 4');
});

test('тексти з даних екрануються, довгі рядки переносяться, далекі рівні — позначкою на краю', () => {
  const svg = cardSvg({ ...demoSpec(), pair: 'X<script>&"', reasons: ['a'.repeat(5) + ' ' + 'b'.repeat(95)] });
  assert.ok(!svg.includes('<script>') && svg.includes('X&lt;script&gt;&amp;&quot;'));
  assert.deepEqual(wrap('один два три чотири', 8), ['один два', 'три', 'чотири']);
  const r = priceRange([{ h: 101, l: 99 }], [{ p: 50 }, { p: 100.5 }]);
  assert.ok(r.lo > 95 && r.hi < 103, 'рівень 50 не стискає свічки');
  assert.ok(cardSvg(demoSpec()).includes('поза графіком: Ліквідація'));
  assert.equal(fmtPrice(63412.53), '63412.5');
  assert.equal(fmtPrice(0.055541234), '0.05554');
});

test('налаштування карток: значення за замовчуванням, очищення, події, винятки ботів, тема «авто»', () => {
  const d = cardPrefs(null);
  assert.equal(d.enabled, true); assert.equal(d.theme, 'dark'); assert.equal(d.candles, 80);
  const p = cardPrefs({ enabled: true, events: { dca: false, x: true, open: 'yes' }, parts: { logic: false }, theme: 'neon', candles: 999, bots_off: ['b2'] });
  assert.equal(p.events.dca, false); assert.equal(p.events.open, true); assert.ok(!('x' in p.events));
  assert.equal(p.parts.logic, false); assert.equal(p.theme, 'dark'); assert.equal(p.candles, 80);
  assert.equal(catOf('sl'), 'close'); assert.equal(catOf('part'), 'close'); assert.equal(catOf('xclose'), 'close'); assert.equal(catOf('risk'), 'risk'); assert.equal(catOf('foo'), 'other');
  assert.equal(wantMsg(p, 'dca'), false); assert.equal(wantMsg(p, 'open'), true);
  assert.equal(wantCard(p, 'b1', 'open'), true); assert.equal(wantCard(p, 'b2', 'open'), false); assert.equal(wantCard(p, 'b1', 'risk'), false);
  assert.equal(wantCard({ ...p, enabled: false }, 'b1', 'open'), false);
  const auto = cardPrefs({ theme: 'auto' });
  assert.equal(themeFor(auto, Date.UTC(2026, 10, 25, 10)), 'light'); // 12:00 за Києвом
  assert.equal(themeFor(auto, Date.UTC(2026, 10, 25, 20)), 'dark'); // 22:00
  assert.ok(cardCaption('x', ['a'.repeat(2000)]).length <= 1000);
});

/* handleBot: картка замість тексту, фільтр подій за категоріями */
async function runHB({ card, events = [{ kind: 'open', notional: 30, price: 2.5, t: Date.now() }] } = {}) {
  const sent = [];
  const r = { events, state: { b: { pos: null, tr: [], cd: 0, cum: 0 }, pk: 0, dd: 0, lt: 0 }, skipped: 0 };
  await handleBot({ bot: { id: 'b1', state: null }, g, r, symbol: 'DOTUSDT', mirror: false, native: false, ex: null,
    save: async () => true, log: async () => {}, notify: async (t, c) => sent.push([c, t]), card });
  return sent;
}
test('handleBot: картка надіслана — текст не дублюється; не вийшла — текст із категорією події', async () => {
  const cards = [];
  assert.deepEqual(await runHB({ card: async (ev) => { cards.push(ev.kind); return true; } }), []);
  assert.deepEqual(cards, ['open']);
  const s = await runHB({ card: async () => false, events: [{ kind: 'sl', pnl: -3, price: 2, t: Date.now() }] });
  assert.equal(s.length, 1); assert.equal(s[0][0], 'sl');
  const s2 = await runHB({}); // без card — як раніше
  assert.equal(s2.length, 1); assert.equal(s2[0][0], 'open');
});
