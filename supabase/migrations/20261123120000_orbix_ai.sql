-- Orbix AI, етап 1: діалоги, повідомлення, інсайти, налаштування й облік використання.
--
-- Принципи:
--  * RLS увімкнено скрізь, anon доступу не має, користувач бачить лише свої рядки;
--  * повідомлення, інсайти й облік пише лише серверна функція ai-assistant (service_role): користувач
--    не може «дописати» собі діалог чи обнулити лічильник;
--  * як і в інших таблицях Orbix, діє вимога 2FA: якщо в користувача увімкнено TOTP, дані доступні лише з сесією aal2;
--  * у цих таблицях немає ключів бірж і секретів; пошта користувача моделі не передається.
-- Залежить від private.mfa_ok() (міграція 20261116103000). Торговий рушій, runner і exchange не зачіпає.
-- Наявні міграції не змінюються.

-- 1. Діалоги
create table if not exists public.ai_conversations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text not null default 'Новий діалог' check (char_length(title) <= 120),
  context_type text not null default 'home' check (context_type in ('home', 'bot', 'monitor', 'chart', 'backtest', 'risk', 'profile')),
  context_id   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);

-- 2. Повідомлення
create table if not exists public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null check (char_length(content) <= 12000),
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists ai_messages_conv_idx on public.ai_messages (conversation_id, created_at);
create index if not exists ai_messages_user_idx on public.ai_messages (user_id);

-- 3. Інсайти (використовуються з етапу 2: AI Bot Monitor)
create table if not exists public.ai_insights (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  category       text not null check (category in ('bot', 'market', 'risk', 'strategy', 'platform')),
  severity       text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  title          text not null check (char_length(title) <= 160),
  description    text not null default '' check (char_length(description) <= 4000),
  source_data    jsonb not null default '{}'::jsonb,
  recommendation text check (char_length(recommendation) <= 2000),
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);
create index if not exists ai_insights_user_open_idx on public.ai_insights (user_id, created_at desc) where resolved_at is null;

-- 4. Налаштування користувача
create table if not exists public.ai_preferences (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  enabled               boolean not null default true,
  language              text not null default 'uk' check (language in ('uk', 'en', 'ru')),
  notifications_enabled boolean not null default false,
  model_preference      text not null default 'auto' check (model_preference in ('auto', 'fast', 'smart')),
  updated_at            timestamptz not null default now()
);

-- 5. Облік використання (ліміти й контроль витрат). Рядки не видаляє користувач: інакше можна обійти денний ліміт.
create table if not exists public.ai_usage (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  model          text not null,
  input_tokens   integer not null default 0 check (input_tokens >= 0),
  output_tokens  integer not null default 0 check (output_tokens >= 0),
  request_type   text not null check (request_type in ('chat', 'tool_round', 'monitor')),
  estimated_cost numeric(12, 6) not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists ai_usage_user_idx on public.ai_usage (user_id, created_at desc);
create index if not exists ai_usage_day_idx on public.ai_usage (created_at);

-- 6. Права: anon не має нічого; authenticated лише читає (і видаляє свої діалоги, змінює свої налаштування)
revoke all on public.ai_conversations, public.ai_messages, public.ai_insights, public.ai_preferences, public.ai_usage from anon;
revoke all on public.ai_conversations, public.ai_messages, public.ai_insights, public.ai_preferences, public.ai_usage from authenticated;
grant select on public.ai_conversations, public.ai_messages, public.ai_insights, public.ai_usage to authenticated;
grant delete on public.ai_conversations to authenticated;
grant select, insert, update on public.ai_preferences to authenticated;

-- 7. RLS
alter table public.ai_conversations enable row level security;
alter table public.ai_messages      enable row level security;
alter table public.ai_insights      enable row level security;
alter table public.ai_preferences   enable row level security;
alter table public.ai_usage         enable row level security;

drop policy if exists "own ai conversations read" on public.ai_conversations;
create policy "own ai conversations read" on public.ai_conversations for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "own ai conversations delete" on public.ai_conversations;
create policy "own ai conversations delete" on public.ai_conversations for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "own ai messages read" on public.ai_messages;
create policy "own ai messages read" on public.ai_messages for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "own ai insights read" on public.ai_insights;
create policy "own ai insights read" on public.ai_insights for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "own ai usage read" on public.ai_usage;
create policy "own ai usage read" on public.ai_usage for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "own ai preferences read" on public.ai_preferences;
create policy "own ai preferences read" on public.ai_preferences for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "own ai preferences insert" on public.ai_preferences;
create policy "own ai preferences insert" on public.ai_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "own ai preferences update" on public.ai_preferences;
create policy "own ai preferences update" on public.ai_preferences for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 2FA: як в інших таблицях Orbix
do $$ declare t text; begin
  foreach t in array array['ai_conversations', 'ai_messages', 'ai_insights', 'ai_preferences', 'ai_usage'] loop
    execute format('drop policy if exists "mfa required when enrolled" on public.%I', t);
    execute format('create policy "mfa required when enrolled" on public.%I as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()))', t);
  end loop;
end $$;

-- 8. Чи може поточний користувач користуватися AI: є сесія, виконано 2FA (якщо ввімкнено) і AI не вимкнено в його налаштуваннях.
--    Функція ai-assistant викликає її до звернення до провайдера, щоб не витрачати безкоштовну квоту даремно.
create or replace function public.ai_can_use() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
     and (select private.mfa_ok())
     and coalesce((select p.enabled from public.ai_preferences p where p.user_id = (select auth.uid())), true)
$$;
revoke all on function public.ai_can_use() from public, anon;
grant execute on function public.ai_can_use() to authenticated;

-- 9. Видалення даних користувача: усі його діалоги й інсайти (облік використання лишається: він потрібен для лімітів, змісту не містить)
create or replace function public.ai_erase_my_data() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not (select private.mfa_ok()) then
    raise exception 'Потрібен вхід із кодом 2FA' using errcode = '42501';
  end if;
  delete from public.ai_conversations where user_id = (select auth.uid());
  delete from public.ai_insights where user_id = (select auth.uid());
end $$;
revoke all on function public.ai_erase_my_data() from public, anon;
grant execute on function public.ai_erase_my_data() to authenticated;

-- 10. Строк зберігання: діалоги — 90 діб від останнього повідомлення, закриті інсайти — 90 діб, облік — 90 діб.
create or replace function public.ai_purge_old(p_days integer default 90) returns void
language sql security definer set search_path = '' as $$
  delete from public.ai_conversations where updated_at < now() - make_interval(days => greatest(p_days, 7));
  delete from public.ai_insights where resolved_at is not null and resolved_at < now() - make_interval(days => greatest(p_days, 7));
  delete from public.ai_usage where created_at < now() - make_interval(days => greatest(p_days, 7));
$$;
revoke all on function public.ai_purge_old(integer) from public, anon, authenticated;
grant execute on function public.ai_purge_old(integer) to service_role;

create extension if not exists pg_cron;
select cron.schedule('orbix-ai-retention', '17 3 * * *', $cron$ select public.ai_purge_old(90) $cron$);
