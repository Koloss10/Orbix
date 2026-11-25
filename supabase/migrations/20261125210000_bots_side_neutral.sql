-- Orbix: нейтральний бот (напрям угоди обирається на вході за сигналами) — сторона 'neutral' у таблиці ботів.
alter table public.bots drop constraint if exists bots_side_check;
alter table public.bots add constraint bots_side_check check (side in ('long', 'short', 'neutral'));
