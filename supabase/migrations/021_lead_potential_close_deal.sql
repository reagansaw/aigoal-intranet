-- Lead status: + Potential (reason required) + Close Deal (recorded under the login of whoever closes it)
alter table public.customers drop constraint if exists customers_lead_status_check;
alter table public.customers add constraint customers_lead_status_check
  check (lead_status in ('pending_management', 'pending_demo', 'invite_webinar', 'potential', 'close_deal'));
alter table public.customers drop constraint if exists customers_pending_mgmt_needs_remark;
alter table public.customers drop constraint if exists customers_status_needs_reason;
alter table public.customers add constraint customers_status_needs_reason
  check (lead_status not in ('pending_management', 'potential') or nullif(trim(coalesce(status_remark, '')), '') is not null);
alter table public.customers
  add column if not exists closed_by_id uuid references public.profiles(id) on delete set null,
  add column if not exists closed_by_name text,
  add column if not exists closed_at timestamptz;

create or replace function public.guard_customer_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  new.updated_at := now();
  select nullif(full_name, '') into who from public.profiles where id = auth.uid();
  if new.lead_status is distinct from old.lead_status or new.status_remark is distinct from old.status_remark then
    new.status_updated_at := now(); new.status_updated_by := coalesce(who, 'System');
    if new.lead_status is null or new.lead_status not in ('pending_management', 'potential') then new.status_remark := null; end if;
  end if;
  -- Close Deal is stamped by the server with the login that clicked it; it cannot be typed or reassigned
  if new.lead_status is distinct from old.lead_status then
    if new.lead_status = 'close_deal' then
      new.closed_by_id := auth.uid(); new.closed_by_name := coalesce(who, 'System'); new.closed_at := now();
      new.closed_date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
    elsif old.lead_status = 'close_deal' then
      new.closed_by_id := null; new.closed_by_name := null; new.closed_at := null; new.closed_date := null;
    end if;
  else
    new.closed_by_id := old.closed_by_id; new.closed_by_name := old.closed_by_name; new.closed_at := old.closed_at; new.closed_date := old.closed_date;
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

-- Sales follow-up timeline for leads (append-only, signed)
create table if not exists public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  kind text not null default 'followup' check (kind in ('followup', 'call', 'remark')),
  body text not null,
  next_action text,
  deadline date,
  resolved boolean not null default false,
  resolved_by_name text,
  resolved_at timestamptz,
  author_id uuid default auth.uid() references public.profiles(id) on delete set null,
  author_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists customer_notes_customer_idx on public.customer_notes (customer_id, created_at desc);
alter table public.customer_notes enable row level security;
drop policy if exists "cnotes select" on public.customer_notes;
drop policy if exists "cnotes insert" on public.customer_notes;
drop policy if exists "cnotes delete" on public.customer_notes;
create policy "cnotes select" on public.customer_notes for select to authenticated using (exists (select 1 from public.customers c where c.id = customer_id));
create policy "cnotes insert" on public.customer_notes for insert to authenticated with check (author_id = auth.uid() and exists (select 1 from public.customers c where c.id = customer_id));
create policy "cnotes delete" on public.customer_notes for delete to authenticated using (public.is_admin());
create or replace function public.customer_note_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if auth.uid() is not null then
    select nullif(full_name, '') into who from public.profiles where id = auth.uid();
    new.author_id := auth.uid(); new.author_name := coalesce(who, 'Unknown user'); new.created_at := now();
    new.resolved := false; new.resolved_by_name := null; new.resolved_at := null;
  end if;
  return new;
end $$;
drop trigger if exists customer_note_guard on public.customer_notes;
create trigger customer_note_guard before insert on public.customer_notes for each row execute function public.customer_note_guard();

-- audit: skip the technical columns
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
      continue when k in ('id', 'created_at', 'updated_at', 'owner_id', 'aigoal_synced_at', 'develop_started_by', 'develop_done_by', 'builder_ids',
                          'pending_on_id', 'pending_on_name', 'pending_since', 'pending_by_name', 'status_updated_at', 'status_updated_by',
                          'closed_by_id', 'closed_at', 'batch_date', 'demo_by_id');
      if (o->k) is distinct from (n->k) then
        insert into public.audit_log (table_name, record_id, record_label, action, field, old_value, new_value, changed_by, changed_by_name)
        values (TG_TABLE_NAME, rid, lbl, 'update', k, o->>k, n->>k, auth.uid(), who);
      end if;
    end loop;
  end if;
  return null;
end $$;
