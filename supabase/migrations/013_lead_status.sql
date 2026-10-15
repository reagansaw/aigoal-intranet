-- Lead status for the Customers list: Pending Management (remark required), Pending Demo, Invite Webinar.
alter table public.customers
  add column if not exists lead_status text check (lead_status in ('pending_management', 'pending_demo', 'invite_webinar')),
  add column if not exists status_remark text,
  add column if not exists status_updated_at timestamptz,
  add column if not exists status_updated_by text;
do $$ begin
  alter table public.customers add constraint customers_pending_mgmt_needs_remark
    check (lead_status is distinct from 'pending_management' or nullif(trim(coalesce(status_remark, '')), '') is not null);
exception when duplicate_object then null; end $$;

create or replace function public.guard_customer_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  new.updated_at := now();
  if new.lead_status is distinct from old.lead_status or new.status_remark is distinct from old.status_remark then
    select nullif(full_name, '') into who from public.profiles where id = auth.uid();
    new.status_updated_at := now(); new.status_updated_by := coalesce(who, 'System');
    if new.lead_status is distinct from 'pending_management' then new.status_remark := null; end if;
  end if;
  if auth.uid() is not null and not public.is_admin() then
    new.owner_id := old.owner_id; new.owner_name := old.owner_name;
    new.priority := old.priority; new.batch := old.batch;
    new.name := old.name; new.phone := old.phone; new.email := old.email;
    new.aigoal_contact_id := old.aigoal_contact_id; new.aigoal_tags := old.aigoal_tags; new.aigoal_status := old.aigoal_status;
    new.purchased := old.purchased; new.aigoal_synced_at := old.aigoal_synced_at;
  end if;
  return new;
end $$;

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
      continue when k in ('id', 'created_at', 'updated_at', 'owner_id', 'aigoal_synced_at', 'develop_started_by', 'develop_done_by',
                          'builder_ids', 'pending_on_id', 'pending_on_name', 'pending_since', 'pending_by_name', 'status_updated_at', 'status_updated_by');
      if (o->k) is distinct from (n->k) then
        insert into public.audit_log (table_name, record_id, record_label, action, field, old_value, new_value, changed_by, changed_by_name)
        values (TG_TABLE_NAME, rid, lbl, 'update', k, o->>k, n->>k, auth.uid(), who);
      end if;
    end loop;
  end if;
  return null;
end $$;
