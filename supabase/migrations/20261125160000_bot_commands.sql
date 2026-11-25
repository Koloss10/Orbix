-- Orbix v19: ручні команди для серверного бота (кнопки на картці): закрити угоду за ринком, скасувати угоду,
-- пауза до кінця угоди, відновити входи. Браузер лише записує команду; виконує її сервер (runner), той самий
-- порядок, що й для сигналів: стан зберігається з перевіркою версії, потім біржа (runner/commands.js).
-- Після запису тригер одразу будить runner для цього бота (pg_net, секрет розкладу з Vault) — не чекати 5 хв.

create table if not exists public.bot_commands (
  id bigint generated always as identity primary key,
  bot_id uuid not null references public.bots (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('close', 'cancel', 'stop_after', 'resume')),
  status text not null default 'new' check (status in ('new', 'done', 'skipped')),
  result text check (result is null or length(result) <= 300),
  created_at timestamptz not null default now(),
  done_at timestamptz
);
-- одна команда, що чекає, на бота: подвійний натиск не створює другої
create unique index if not exists bot_commands_one_pending on public.bot_commands (bot_id) where status = 'new';
create index if not exists bot_commands_user_created on public.bot_commands (user_id, created_at desc);

alter table public.bot_commands enable row level security;
revoke all on public.bot_commands from anon, authenticated;
grant select on public.bot_commands to authenticated;
grant insert (bot_id, kind) on public.bot_commands to authenticated;
grant all on public.bot_commands to service_role;

drop policy if exists "own bot commands read" on public.bot_commands;
create policy "own bot commands read" on public.bot_commands for select to authenticated
  using (user_id = (select auth.uid()));
-- команду можна дати лише власному боту
drop policy if exists "own bot commands insert" on public.bot_commands;
create policy "own bot commands insert" on public.bot_commands for insert to authenticated
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.bots b where b.id = bot_id and b.user_id = (select auth.uid())));
drop policy if exists "mfa required when enrolled" on public.bot_commands;
create policy "mfa required when enrolled" on public.bot_commands as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- розбудити runner для одного бота (як розклад orbix-runner, але з тілом { bot })
create or replace function private.kick_runner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://krmnaypaitruhqgaxkfw.supabase.co/functions/v1/runner',
    headers := jsonb_build_object('content-type', 'application/json',
      'x-runner-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'orbix_runner_secret')),
    body := jsonb_build_object('bot', new.bot_id),
    timeout_milliseconds := 120000);
  return null;
exception when others then
  return null; -- не вдалося розбудити — команду виконає розклад протягом 5 хв
end $$;
revoke all on function private.kick_runner() from public;

drop trigger if exists bot_commands_kick on public.bot_commands;
create trigger bot_commands_kick after insert on public.bot_commands
  for each row execute function private.kick_runner();
