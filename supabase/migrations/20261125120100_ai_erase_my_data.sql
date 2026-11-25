-- Orbix AI: право користувача видалити всі свої діалоги одним кліком (кнопка «Видалити всі діалоги»).
-- Потрібен вхід, а за ввімкненої 2FA — підтверджений другий фактор. Облік використання лишається: він потрібен для лімітів і не містить змісту.
create or replace function public.ai_erase_my_data() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not (select private.mfa_ok()) then
    raise exception 'Потрібен вхід із кодом 2FA' using errcode = '42501';
  end if;
  delete from public.ai_conversations where user_id = (select auth.uid());
end $$;
revoke all on function public.ai_erase_my_data() from public, anon;
grant execute on function public.ai_erase_my_data() to authenticated;
