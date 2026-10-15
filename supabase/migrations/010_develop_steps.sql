-- Pipeline: Onboarding 1 > Develop > Develop Done > Onboarding 2 > Onboarding 3.
-- Onboarding 1/2/3 come from the AIGOAL calendar; Develop / Develop Done are one-click buttons (time + person recorded by the server).
alter table public.purchase_accounts
  add column if not exists develop_started_at timestamptz,
  add column if not exists develop_started_by uuid references public.profiles(id) on delete set null,
  add column if not exists develop_done_at timestamptz,
  add column if not exists develop_done_by uuid references public.profiles(id) on delete set null;

-- The develop fields can only be changed through set_develop() below, never typed or edited directly.
create or replace function public.freeze_develop_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(current_setting('app.develop_rpc', true), '') <> '1' then
    new.develop_started_at := old.develop_started_at; new.develop_started_by := old.develop_started_by;
    new.develop_done_at := old.develop_done_at; new.develop_done_by := old.develop_done_by;
  end if;
  return new;
end $$;
drop trigger if exists freeze_develop_fields on public.purchase_accounts;
create trigger freeze_develop_fields before update on public.purchase_accounts for each row execute function public.freeze_develop_fields();

-- action: 'start' (Develop), 'done' (Develop Done), 'reset' (Admin only: undo both)
create or replace function public.set_develop(account_id uuid, action text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.purchase_accounts;
begin
  select * into a from public.purchase_accounts where id = account_id;
  if not found then raise exception 'Account not found'; end if;
  if not (public.is_admin() or (a.owner_id = auth.uid() and public.current_role_name() is not null)) then raise exception 'Not allowed'; end if;
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
revoke all on function public.set_develop(uuid, text) from public, anon;
grant execute on function public.set_develop(uuid, text) to authenticated;

-- Keep the history readable: log WHEN a develop step happened, not the raw user ids.
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb; k text; who text; lbl text; rid uuid;
begin
  select nullif(full_name, '') into who from public.profiles where id = auth.uid();
  who := coalesce(who, case when auth.uid() is null then 'System' else 'Unknown user' end);
  if TG_OP = 'INSERT' then
    n := to_jsonb(new); rid := new.id; lbl := coalesce(n->>'account_name', n->>'name');
    insert into public.audit_log (table_name, record_id, record_label, action, changed_by, changed_by_name) values (TG_TABLE_NAME, rid, lbl, 'insert', auth.uid(), who);
  elsif TG_OP = 'DELETE' then
    o := to_jsonb(old); rid := old.id; lbl := coalesce(o->>'account_name', o->>'name');
    insert into public.audit_log (table_name, record_id, record_label, action, changed_by, changed_by_name) values (TG_TABLE_NAME, rid, lbl, 'delete', auth.uid(), who);
  else
    o := to_jsonb(old); n := to_jsonb(new); rid := new.id; lbl := coalesce(n->>'account_name', n->>'name');
    for k in select jsonb_object_keys(n) loop
      continue when k in ('id', 'created_at', 'updated_at', 'owner_id', 'aigoal_synced_at', 'develop_started_by', 'develop_done_by');
      if (o->k) is distinct from (n->k) then
        insert into public.audit_log (table_name, record_id, record_label, action, field, old_value, new_value, changed_by, changed_by_name)
        values (TG_TABLE_NAME, rid, lbl, 'update', k, o->>k, n->>k, auth.uid(), who);
      end if;
    end loop;
  end if;
  return null;
end $$;
