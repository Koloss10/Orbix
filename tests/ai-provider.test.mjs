// Постачальник моделі Orbix AI: протокол OpenAI Chat Completions, повтори, помилки, цикл інструментів. Без мережі.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AIProviderError, OpenAIProvider, providerErrorText } from '../supabase/functions/ai-assistant/provider.js';

const CFG = { baseUrl: 'https://api.example/v1', apiKey: 'SECRET-KEY', model: 'm1', maxOutputTokens: 300, timeoutMs: 200 };
const ok = (message, finish = 'stop', usage = { prompt_tokens: 10, completion_tokens: 5 }) => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({ choices: [{ message, finish_reason: finish }], usage }) });
const bad = (status, headers = {}) => ({ ok: false, status, headers: new Headers(headers), json: async () => ({ error: { message: 'ТАЄМНИЙ ТЕКСТ ЗАПИТУ' } }) });
const prov = (steps, opts = { backoffMs: 1 }) => {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, init }); const s = steps[Math.min(calls.length - 1, steps.length - 1)]; return typeof s === 'function' ? s(init) : s; };
  return { p: new OpenAIProvider(CFG, f, opts), calls };
};

test('Запит: адреса, ключ у заголовку, модель і ліміт токенів із налаштувань', async () => {
  const { p, calls } = prov([ok({ content: 'Привіт' })]);
  const r = await p.generateResponse({ messages: [{ role: 'user', content: 'hi' }], tools: [{ type: 'function', function: { name: 'x' } }] });
  assert.equal(r.text, 'Привіт');
  assert.deepEqual(r.usage, { input: 10, output: 5 });
  assert.equal(calls[0].url, 'https://api.example/v1/chat/completions');
  assert.equal(calls[0].init.headers.authorization, 'Bearer SECRET-KEY');
  const b = JSON.parse(calls[0].init.body);
  assert.equal(b.model, 'm1'); assert.equal(b.max_tokens, 300); assert.equal(b.tool_choice, 'auto');
  assert.deepEqual(p.getUsage(), { input: 10, output: 5, requests: 1 });
});

test('Виклики інструментів розбираються з відповіді', async () => {
  const { p } = prov([ok({ content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'list_user_bots', arguments: '{"limit":3}' } }] }, 'tool_calls')]);
  const r = await p.generateResponse({ messages: [] });
  assert.deepEqual(r.toolCalls, [{ id: 'c1', name: 'list_user_bots', args: '{"limit":3}' }]);
  assert.equal(r.text, '');
});

test('Порожня відповідь — bad_response', async () => {
  const { p } = prov([{ ok: true, status: 200, headers: new Headers(), json: async () => ({ choices: [] }) }]);
  await assert.rejects(p.generateResponse({ messages: [] }), (e) => e.code === 'bad_response');
});

test('Ліміт провайдера 429: короткий Retry-After — повтор, довгий — одразу quota', async () => {
  const a = prov([bad(429, { 'retry-after': '0' }), ok({ content: 'ок' })]);
  assert.equal((await a.p.generateResponse({ messages: [] })).text, 'ок');
  assert.equal(a.calls.length, 2);
  const b = prov([bad(429, { 'retry-after': '60' }), ok({ content: 'ок' })]);
  await assert.rejects(b.p.generateResponse({ messages: [] }), (e) => e.code === 'quota' && e.retryAfter === 60);
  assert.equal(b.calls.length, 1, 'довго чекати безкоштовну квоту не варто');
});

test('Збій провайдера 5xx: повтори, потім unavailable; текст помилки не потрапляє в повідомлення', async () => {
  const { p, calls } = prov([bad(503)]);
  await assert.rejects(p.generateResponse({ messages: [] }), (e) => e.code === 'unavailable' && !/ТАЄМНИЙ/.test(e.message));
  assert.equal(calls.length, 3, '1 спроба + 2 повтори');
});

test('Неправильний ключ 401/403 і відхилений запит 400 не повторюються', async () => {
  for (const [st, code] of [[401, 'auth'], [403, 'auth'], [400, 'bad_request']]) {
    const { p, calls } = prov([bad(st)]);
    await assert.rejects(p.generateResponse({ messages: [] }), (e) => e.code === code && !e.message.includes('SECRET-KEY'));
    assert.equal(calls.length, 1);
  }
});

test('Тайм-аут і обрив мережі', async () => {
  const hang = (init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('abort'), { name: 'AbortError' }))));
  const t = prov([hang], { retries: 0, backoffMs: 1 });
  await assert.rejects(t.p.generateResponse({ messages: [] }), (e) => e.code === 'timeout');
  const n = prov([() => { throw new TypeError('fetch failed'); }], { retries: 1, backoffMs: 1 });
  await assert.rejects(n.p.generateResponse({ messages: [] }), (e) => e.code === 'unavailable');
  assert.equal(n.calls.length, 2);
});

test('Цикл інструментів: модель просить дані, отримує їх і відповідає; в останньому колі інструментів немає', async () => {
  const tc = { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_account_overview', arguments: '{}' } }] };
  const { p, calls } = prov([ok(tc, 'tool_calls'), ok({ content: 'У вас 2 боти.' })]);
  const ran = [];
  const r = await p.continueConversation({
    messages: [{ role: 'user', content: 'стан' }], tools: [{ type: 'function', function: { name: 'get_account_overview' } }], maxRounds: 3,
    run: async (name, args) => { ran.push([name, args]); return { content: '{"ok":1}', step: { name, ok: true } }; },
  });
  assert.equal(r.text, 'У вас 2 боти.');
  assert.deepEqual(ran, [['get_account_overview', {}]]);
  assert.equal(r.rounds, 2);
  assert.deepEqual(r.usage, { input: 20, output: 10 });
  const second = JSON.parse(calls[1].init.body).messages;
  assert.deepEqual(second.at(-1), { role: 'tool', tool_call_id: 'c1', content: '{"ok":1}' });
  assert.equal(second.at(-2).tool_calls[0].function.name, 'get_account_overview');
});

test('Модель не може зациклитись: після maxRounds інструменти не передаються', async () => {
  const tc = ok({ content: null, tool_calls: [{ id: 'c', type: 'function', function: { name: 'list_user_bots', arguments: '{}' } }] }, 'tool_calls');
  const { p, calls } = prov([tc, tc, ok({ content: 'Готово' })]);
  const r = await p.continueConversation({ messages: [], tools: [{ type: 'function', function: { name: 'list_user_bots' } }], maxRounds: 3, run: async (n) => ({ content: '{}', step: { name: n, ok: true } }) });
  assert.equal(r.text, 'Готово');
  assert.equal(calls.length, 3);
  assert.equal(JSON.parse(calls[2].init.body).tools, undefined, 'в останньому колі — без інструментів');
});

test('Некоректний JSON в аргументах інструмента не ламає діалог', async () => {
  const { p } = prov([ok({})]);
  const out = await p.callTools([{ id: 'c', name: 'x', args: '{не json' }], async () => assert.fail('інструмент не мав запускатись'));
  assert.match(out[0].message.content, /коректним JSON/);
  assert.equal(out[0].step.ok, false);
});

test('Тексти помилок для користувача не містять технічних деталей', () => {
  for (const c of ['quota', 'timeout', 'unavailable', 'auth', 'bad_request', 'bad_response']) {
    const t = providerErrorText(new AIProviderError(c, 'внутрішнє SECRET-KEY'));
    assert.ok(t.length > 10 && !t.includes('SECRET-KEY'));
  }
});

test('healthCheck: доступний / недоступний', async () => {
  assert.deepEqual(await prov([{ ok: true, status: 200 }]).p.healthCheck(), { ok: true, status: 200 });
  assert.deepEqual(await prov([() => { throw new Error('x'); }]).p.healthCheck(), { ok: false, status: 0 });
});
