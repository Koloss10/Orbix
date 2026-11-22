-- Orbix AI Core: private conversation history and usage accounting.
create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Новий діалог',
  context_type text,
  context_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_conversations_user_updated_idx
  on public.ai_conversations(user_id, updated_at desc);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) <= 12000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_conversation_created_idx
  on public.ai_messages(conversation_id, created_at);

create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  request_type text not null default 'chat',
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_created_idx
  on public.ai_usage(user_id, created_at desc);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_usage enable row level security;

drop policy if exists "ai_conversations_select_own" on public.ai_conversations;
create policy "ai_conversations_select_own" on public.ai_conversations
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "ai_messages_select_own" on public.ai_messages;
create policy "ai_messages_select_own" on public.ai_messages
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own" on public.ai_usage
  for select to authenticated using (auth.uid() = user_id);

-- Writes are performed only by the authenticated Edge Function using the service role.
-- No client-side INSERT/UPDATE/DELETE policies are intentionally created.
revoke all on public.ai_conversations from anon, authenticated;
revoke all on public.ai_messages from anon, authenticated;
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_conversations, public.ai_messages, public.ai_usage to authenticated;
