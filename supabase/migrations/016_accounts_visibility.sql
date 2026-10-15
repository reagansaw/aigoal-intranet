-- Purchase accounts: everyone signed in can SEE every account; only Admin and that account's AI Builder(s) can EDIT it.
drop policy if exists "accounts own select" on public.purchase_accounts;
drop policy if exists "accounts own update" on public.purchase_accounts;
drop policy if exists "accounts own insert" on public.purchase_accounts;
create policy "accounts read all" on public.purchase_accounts for select to authenticated using (public.current_role_name() is not null);
create policy "accounts builder update" on public.purchase_accounts for update to authenticated
  using (public.current_role_name() is not null and auth.uid() = any (builder_ids))
  with check (public.current_role_name() is not null and auth.uid() = any (builder_ids));
-- (Admin keeps the existing "accounts admin all" policy; only Admin creates or deletes accounts.)

-- Develop / Develop Done: AI Builder or Admin
create or replace function public.set_develop(account_id uuid, action text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.purchase_accounts;
begin
  select * into a from public.purchase_accounts where id = account_id;
  if not found then raise exception 'Account not found'; end if;
  if not (public.is_admin() or (public.current_role_name() is not null and auth.uid() = any (a.builder_ids))) then raise exception 'Only the AI Builder can do this'; end if;
  perform set_config('app.develop_rpc', '1', true);
  if action = 'start' then
    if a.develop_started_at is not null then return; end if;
    update public.purchase_accounts set develop_started_at = now(), develop_started_by = auth.uid() where id = account_id;
  elsif action = 'done' then
    if a.develop_started_at is null then raise exception 'Click Develop first'; end if;
    if a.develop_done_at is not null then return; end if;
    update public.purchase_accounts set develop_done_at = now(), develop_done_by = auth.uid() where id = account_id;
  elsif action = 'reset' then
    if not public.is_admin() then raise exception 'Only Admin can undo a develop step'; end if;
    update public.purchase_accounts set develop_started_at = null, develop_started_by = null, develop_done_at = null, develop_done_by = null where id = account_id;
  else raise exception 'Unknown action'; end if;
end $$;

-- Remind: any signed-in user can ask a person to look at an account. Clear: that person, an AI Builder, or Admin.
create or replace function public.remind_account(account_id uuid, person_id uuid, note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a public.purchase_accounts; me text; target text;
begin
  select * into a from public.purchase_accounts where id = account_id;
  if not found then raise exception 'Account not found'; end if;
  if public.current_role_name() is null then raise exception 'Not allowed'; end if;
  select full_name into target from public.profiles where id = person_id and active;
  if target is null then raise exception 'That person has no active login'; end if;
  select coalesce(nullif(full_name, ''), 'Someone') into me from public.profiles where id = auth.uid();
  perform set_config('app.pending_rpc', '1', true);
  update public.purchase_accounts set pending_on_id = person_id, pending_on_name = target, pending_since = now(), pending_by_name = me where id = account_id;
  insert into public.account_notes (account_id, kind, body, author_id, author_name)
  values (account_id, 'reminder', 'Reminder sent to ' || target || coalesce(': ' || nullif(trim(note), ''), ''), auth.uid(), me);
end $$;

create or replace function public.clear_reminder(account_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.purchase_accounts; me text;
begin
  select * into a from public.purchase_accounts where id = account_id;
  if not found then raise exception 'Account not found'; end if;
  if public.current_role_name() is null or not (public.is_admin() or a.pending_on_id = auth.uid() or auth.uid() = any (a.builder_ids)) then raise exception 'Only the person it is waiting on, an AI Builder or Admin can clear this'; end if;
  if a.pending_on_id is null then return; end if;
  select coalesce(nullif(full_name, ''), 'Someone') into me from public.profiles where id = auth.uid();
  perform set_config('app.pending_rpc', '1', true);
  update public.purchase_accounts set pending_on_id = null, pending_on_name = null, pending_since = null, pending_by_name = null where id = account_id;
  insert into public.account_notes (account_id, kind, body, author_id, author_name)
  values (account_id, 'reminder', a.pending_on_name || ' is done (marked by ' || me || ')', auth.uid(), me);
end $$;

-- Timeline notes: anyone who can see the account may add a follow-up; only builders/Admin may mark issues resolved.
drop policy if exists "notes update" on public.account_notes;
create policy "notes update" on public.account_notes for update to authenticated
  using (public.is_admin() or exists (select 1 from public.purchase_accounts p where p.id = account_id and auth.uid() = any (p.builder_ids)));
