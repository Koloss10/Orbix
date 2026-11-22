import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const edge = read('supabase/functions/ai-assistant/index.ts');
const migration = read('supabase/migrations/20261123120000_orbix_ai_core.sql');
const ui = read('src/js/21-ai-assistant.js');
const template = read('src/orbix.template.html');

test('AI Edge Function requires authenticated user and existing MFA policy', () => {
  assert.match(edge, /auth\.getUser\(\)/);
  assert.match(edge, /rpc\("mfa_ok_now"\)/);
  assert.match(edge, /rpc\("ai_claim_daily_quota"/);
  assert.match(edge, /authorization\.startsWith\("Bearer "/);
});

test('AI context is scoped to the authenticated user and excludes exchange secrets', () => {
  assert.match(edge, /asUser\.from\("bots"\)/);
  assert.match(edge, /asUser\.from\("bot_state"\)/);
  assert.match(edge, /asUser\.from\("bot_events"\)/);
  assert.match(edge, /asUser\.from\("backtests"\)/);
  assert.doesNotMatch(edge, /ex_secret_for|exchange_connections|api_secret|api_key/);
});

test('AI database tables use RLS and expose no client write policies', () => {
  for (const table of ['ai_conversations', 'ai_messages', 'ai_usage']) {
    assert.match(migration, new RegExp('alter table public\\.' + table + ' enable row level security'));
  }
  assert.doesNotMatch(migration, /for (insert|update|delete) to authenticated/i);
  assert.match(migration, /on conflict \(user_id, usage_date\) do update/i);
  assert.match(migration, /grant execute on function public\.ai_claim_daily_quota\(uuid, integer\) to service_role/i);
});

test('AI UI is explicitly read-only and provides chat controls', () => {
  assert.match(template, /id="v-ai"/);
  assert.match(template, /READ ONLY/);
  assert.match(ui, /functions\.invoke\('ai-assistant'/);
  assert.match(ui, /ai-conversation/);
  assert.doesNotMatch(ui, /\.from\(['"]bots['"]\)\.(insert|update|delete)/);
});
