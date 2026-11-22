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

-- Atomic per-user daily quota; prevents parallel requests bypassing the limit.
create table if not exists public.ai_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  message_count integer not null default 0 check (message_count >= 0),
  primary key (user_id, usage_date)
);
alter table public.ai_daily_usage enable row level security;
revoke all on public.ai_daily_usage from anon, authenticated;

create or replace function public.ai_claim_daily_quota(p_user_id uuid, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare claimed integer;
begin
  if p_user_id is null or p_limit < 1 then return false; end if;
  insert into public.ai_daily_usage(user_id, usage_date, message_count)
  values (p_user_id, current_date, 1)
  on conflict (user_id, usage_date) do update
    set message_count = public.ai_daily_usage.message_count + 1
    where public.ai_daily_usage.message_count < p_limit
  returning message_count into claimed;
  return claimed is not null;
end;
$$;
revoke all on function public.ai_claim_daily_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.ai_claim_daily_quota(uuid, integer) to service_role;
