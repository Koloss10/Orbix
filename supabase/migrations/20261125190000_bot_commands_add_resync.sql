-- Orbix v22: ще дві ручні команди для серверного бота.
--   resync — «Перезапустити угоду» після помилки: сервер повертає відсутні ордери бота на біржу й скидає помилку;
--   add    — «Докупити зараз» на суму amount (маржа, USDT): ринкова докупівля, решта лімітних докупівель переставляється.
-- Старий runner (v21) нові види пропускає як «невідома команда», тож міграцію можна застосувати до розгортання.

alter table public.bot_commands drop constraint if exists bot_commands_kind_check;
alter table public.bot_commands add constraint bot_commands_kind_check
  check (kind in ('close', 'cancel', 'stop_after', 'resume', 'resync', 'add'));

alter table public.bot_commands add column if not exists amount numeric;
alter table public.bot_commands drop constraint if exists bot_commands_amount_check;
alter table public.bot_commands add constraint bot_commands_amount_check
  check ((kind = 'add') = (amount is not null) and (amount is null or (amount > 0 and amount <= 1000000)));

grant insert (bot_id, kind, amount) on public.bot_commands to authenticated;
