-- Orbix v18: налаштування карток сигналів у Telegram (для кожного користувача свої).
-- Що надсилати (події), що показувати на картці, тема, кількість свічок, вимкнення для окремих ботів.
-- Читає й змінює лише власник (RLS) і лише з 2FA, якщо її ввімкнено (private.mfa_ok()); сервер (runner) читає через service_role.
-- Токен Telegram тут не зберігається: він і далі лише у Vault (private.tg_settings).

create table if not exists public.tg_card_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default true,
  events jsonb not null default '{"open": true, "dca": true, "close": true, "risk": true, "error": true, "other": true}'::jsonb
    check (jsonb_typeof(events) = 'object'),
  parts jsonb not null default '{"chart": true, "orders": true, "tpsl": true, "logic": true, "result": true}'::jsonb
    check (jsonb_typeof(parts) = 'object'),
  theme text not null default 'dark' check (theme in ('dark', 'light', 'auto')),
  candles integer not null default 80 check (candles in (40, 80, 150)),
  bots_off uuid[] not null default '{}' check (cardinality(bots_off) <= 200),
  updated_at timestamptz not null default now()
);

alter table public.tg_card_prefs enable row level security;
revoke all on public.tg_card_prefs from anon, authenticated;
grant select, insert, update on public.tg_card_prefs to authenticated;
grant all on public.tg_card_prefs to service_role;

drop policy if exists "own tg card prefs" on public.tg_card_prefs;
create policy "own tg card prefs" on public.tg_card_prefs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "mfa required when enrolled" on public.tg_card_prefs;
create policy "mfa required when enrolled" on public.tg_card_prefs as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
