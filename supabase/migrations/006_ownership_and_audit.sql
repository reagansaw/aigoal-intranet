-- 1) Purchase accounts belong to a person; everyone else only sees their own (Admin sees all).
alter table public.purchase_accounts
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists owner_name text;
create index if not exists purchase_accounts_owner_idx on public.purchase_accounts (owner_id);

-- Backfill from the sheet: the Sales column, else the person who closed it (a webinar sale has no person).
alter table public.purchase_accounts disable trigger audit_purchase_accounts;
update public.purchase_accounts
   set owner_name = coalesce(nullif(trim(sales), ''), case when nullif(trim(closed_by), '') is not null and lower(trim(closed_by)) <> 'webinar' then trim(split_part(closed_by, '/', 1)) end)
 where owner_name is null;
alter table public.purchase_accounts enable trigger audit_purchase_accounts;

create or replace function public.link_account_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then   -- staff: always their own, never reassigned
    if TG_OP = 'INSERT' then
      new.owner_id := auth.uid();
      select full_name into new.owner_name from public.profiles where id = auth.uid();
    else
      new.owner_id := old.owner_id; new.owner_name := old.owner_name;
    end if;
  elsif new.owner_id is null and new.owner_name is not null then
    select id into new.owner_id from public.profiles
     where lower(full_name) = lower(new.owner_name) or lower(full_name) like lower(new.owner_name) || ' %'
     order by active desc limit 1;
  end if;
  return new;
end $$;
drop trigger if exists link_account_owner on public.purchase_accounts;
create trigger link_account_owner before insert or update on public.purchase_accounts
  for each row execute function public.link_account_owner();

-- When a staff profile is created/renamed, claim the leads AND accounts waiting under their name.
create or replace function public.link_owner_on_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.full_name, '') <> '' then
    update public.customers set owner_id = new.id
     where owner_id is null and owner_name is not null
       and (lower(new.full_name) = lower(owner_name) or lower(new.full_name) like lower(owner_name) || ' %');
    update public.purchase_accounts set owner_id = new.id
     where owner_id is null and owner_name is not null
       and (lower(new.full_name) = lower(owner_name) or lower(new.full_name) like lower(owner_name) || ' %');
  end if;
  return new;
end $$;

drop policy if exists "accounts read" on public.purchase_accounts;
drop policy if exists "accounts write" on public.purchase_accounts;
create policy "accounts admin all" on public.purchase_accounts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "accounts own select" on public.purchase_accounts for select to authenticated
  using (owner_id = auth.uid() and public.current_role_name() is not null);
create policy "accounts own insert" on public.purchase_accounts for insert to authenticated
  with check (owner_id = auth.uid() and public.current_role_name() is not null);
create policy "accounts own update" on public.purchase_accounts for update to authenticated
  using (owner_id = auth.uid() and public.current_role_name() is not null)
  with check (owner_id = auth.uid() and public.current_role_name() is not null);

-- Customers: same "active user only" condition on the existing own-lead policies.
drop policy if exists "customers staff own" on public.customers;
drop policy if exists "customers staff update own" on public.customers;
create policy "customers staff own" on public.customers for select to authenticated
  using (owner_id = auth.uid() and public.current_role_name() is not null);
create policy "customers staff update own" on public.customers for update to authenticated
  using (owner_id = auth.uid() and public.current_role_name() is not null)
  with check (owner_id = auth.uid() and public.current_role_name() is not null);

-- 2) Audit trail for customers too; skip noisy/internal columns.
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb; k text; who text; lbl text; rid uuid;
begin
  select nullif(full_name, '') into who from public.profiles where id = auth.uid();
  who := coalesce(who, case when auth.uid() is null then 'System' else 'Unknown user' end);
  if TG_OP = 'INSERT' then
    n := to_jsonb(new); rid := new.id; lbl := coalesce(n->>'account_name', n->>'name');
    insert into public.audit_log (table_name, record_id, record_label, action, changed_by, changed_by_name)
    values (TG_TABLE_NAME, rid, lbl, 'insert', auth.uid(), who);
  elsif TG_OP = 'DELETE' then
    o := to_jsonb(old); rid := old.id; lbl := coalesce(o->>'account_name', o->>'name');
    insert into public.audit_log (table_name, record_id, record_label, action, changed_by, changed_by_name)
    values (TG_TABLE_NAME, rid, lbl, 'delete', auth.uid(), who);
  else
    o := to_jsonb(old); n := to_jsonb(new); rid := new.id; lbl := coalesce(n->>'account_name', n->>'name');
    for k in select jsonb_object_keys(n) loop
      continue when k in ('id', 'created_at', 'updated_at', 'owner_id', 'aigoal_synced_at');
      if (o->k) is distinct from (n->k) then
        insert into public.audit_log (table_name, record_id, record_label, action, field, old_value, new_value, changed_by, changed_by_name)
        values (TG_TABLE_NAME, rid, lbl, 'update', k, o->>k, n->>k, auth.uid(), who);
      end if;
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists audit_customers on public.customers;
create trigger audit_customers after insert or update or delete on public.customers
  for each row execute function public.audit_row();

-- People only read history of records they can see; Admin reads everything.
drop policy if exists "audit read" on public.audit_log;
create policy "audit read" on public.audit_log for select to authenticated using (
  public.is_admin()
  or (table_name = 'purchase_accounts' and exists (select 1 from public.purchase_accounts p where p.id = record_id))
  or (table_name = 'customers' and exists (select 1 from public.customers c where c.id = record_id))
);
