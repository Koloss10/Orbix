-- Orbix AI, етап 1: історія діалогів, облік використання й налаштування AI-помічника.
-- Читання — лише власних рядків (RLS) і лише з 2FA, якщо її ввімкнено (private.mfa_ok()).
-- Запис повідомлень і обліку — лише серверна функція ai-assistant (service_role), тож ліміти не обійти з браузера.
-- Користувач може видалити власні діалоги (разом із повідомленнями). Ключів бірж і секретів тут немає.
-- Строк зберігання: повідомлення й діалоги без активності понад 90 днів видаляються щодня (pg_cron).
-- Торгівлі (runner, exchange) міграція не зачіпає.

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Новий діалог' check (char_length(title) <= 120),
  context_type text check (context_type in ('bot', 'monitor', 'risk', 'backtest', 'market')),
  context_id text check (char_length(context_id) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);

create table if not exists public.ai_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 20000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_conv_idx on public.ai_messages (conversation_id, created_at);
create index if not exists ai_messages_user_idx on public.ai_messages (user_id);

create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  request_type text not null default 'chat' check (char_length(request_type) <= 40),
  ok boolean not null default true,
  estimated_cost numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_day_idx on public.ai_usage (user_id, created_at desc);

create table if not exists public.ai_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default true,
  language text not null default 'uk' check (language in ('uk', 'en')),
  notifications_enabled boolean not null default false,
  model_preference text check (char_length(model_preference) <= 80),
  updated_at timestamptz not null default now()
);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_preferences enable row level security;

revoke all on public.ai_conversations, public.ai_messages, public.ai_usage, public.ai_preferences from anon, authenticated;
grant select, delete on public.ai_conversations to authenticated;
grant select on public.ai_messages, public.ai_usage to authenticated;
grant select, insert, update on public.ai_preferences to authenticated;
grant all on public.ai_conversations, public.ai_messages, public.ai_usage, public.ai_preferences to service_role;

drop policy if exists "own ai conversations read" on public.ai_conversations;
create policy "own ai conversations read" on public.ai_conversations for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own ai conversations delete" on public.ai_conversations;
create policy "own ai conversations delete" on public.ai_conversations for delete to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own ai messages read" on public.ai_messages;
create policy "own ai messages read" on public.ai_messages for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own ai usage read" on public.ai_usage;
create policy "own ai usage read" on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own ai preferences" on public.ai_preferences;
create policy "own ai preferences" on public.ai_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

do $$ declare t text; begin
  foreach t in array array['ai_conversations', 'ai_messages', 'ai_usage', 'ai_preferences'] loop
    execute format('drop policy if exists "mfa required when enrolled" on public.%I', t);
    execute format('create policy "mfa required when enrolled" on public.%I as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()))', t);
  end loop;
end $$;

-- атомарний денний ліміт запитів (паралельні запити не обійдуть ліміт; ідея з гілки колеги, 23.11)
create table if not exists public.ai_daily_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null default (now() at time zone 'utc')::date,
  message_count integer not null default 0 check (message_count >= 0),
  primary key (user_id, usage_date)
);
alter table public.ai_daily_usage enable row level security;
revoke all on public.ai_daily_usage from anon, authenticated;
grant all on public.ai_daily_usage to service_role;

-- повертає номер запиту за добу (UTC) або null, якщо ліміт вичерпано; викликає лише сервер
create or replace function public.ai_claim_daily_quota(p_user_id uuid, p_limit integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_user_id is null or p_limit is null or p_limit < 1 then return null; end if;
  insert into public.ai_daily_usage (user_id, usage_date, message_count)
  values (p_user_id, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, usage_date) do update
    set message_count = public.ai_daily_usage.message_count + 1
    where public.ai_daily_usage.message_count < p_limit
  returning message_count into n;
  return n;
end $$;
revoke all on function public.ai_claim_daily_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.ai_claim_daily_quota(uuid, integer) to service_role;

-- строк зберігання: діалоги без активності понад 90 днів (повідомлення видаляються каскадно), облік — понад 180 днів
create or replace function private.ai_cleanup() returns void
language sql security definer set search_path = '' as $$
  delete from public.ai_conversations where updated_at < now() - interval '90 days';
  delete from public.ai_usage where created_at < now() - interval '180 days';
  delete from public.ai_daily_usage where usage_date < (now() at time zone 'utc')::date - 7;
$$;
revoke all on function private.ai_cleanup() from public, anon, authenticated;

select cron.schedule('orbix-ai-cleanup', '17 3 * * *', $cron$ select private.ai_cleanup() $cron$);
