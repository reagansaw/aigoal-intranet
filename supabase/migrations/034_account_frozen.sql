-- Admin can freeze a purchase account (customer paused / stopped AIGOAL). Frozen accounts leave the onboarding queues.
alter table public.purchase_accounts
  add column if not exists frozen boolean not null default false,
  add column if not exists frozen_reason text,
  add column if not exists frozen_at timestamptz,
  add column if not exists frozen_by_name text;

-- only Admin (through set_account_frozen) can change these
create or replace function public.guard_account_frozen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.frozen := old.frozen; new.frozen_reason := old.frozen_reason; new.frozen_at := old.frozen_at; new.frozen_by_name := old.frozen_by_name;
  end if;
  return new;
end $$;
drop trigger if exists guard_account_frozen on public.purchase_accounts;
create trigger guard_account_frozen before update on public.purchase_accounts for each row execute function public.guard_account_frozen();

create or replace function public.set_account_frozen(account_id uuid, do_freeze boolean, reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare me text;
begin
  if not public.is_admin() then raise exception 'Only Admin can freeze an account'; end if;
  if do_freeze and nullif(trim(coalesce(reason, '')), '') is null then raise exception 'Say why the account is frozen'; end if;
  select coalesce(nullif(full_name, ''), 'Admin') into me from public.profiles where id = auth.uid();
  update public.purchase_accounts set frozen = do_freeze, frozen_reason = case when do_freeze then trim(reason) end,
    frozen_at = case when do_freeze then now() end, frozen_by_name = case when do_freeze then me end where id = account_id;
  insert into public.account_notes (account_id, kind, body, author_id, author_name)
  values (account_id, 'remark', case when do_freeze then 'Account frozen: ' || trim(reason) else 'Account unfrozen' end, auth.uid(), me);
end $$;
revoke all on function public.set_account_frozen(uuid, boolean, text) from public, anon;
grant execute on function public.set_account_frozen(uuid, boolean, text) to authenticated;
