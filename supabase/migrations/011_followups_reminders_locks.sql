-- 1) New columns: AI-builder visibility + "pending on <person>" reminder status
alter table public.purchase_accounts
  add column if not exists builder_ids uuid[] not null default '{}',
  add column if not exists pending_on_id uuid references public.profiles(id) on delete set null,
  add column if not exists pending_on_name text,
  add column if not exists pending_since timestamptz,
  add column if not exists pending_by_name text;

-- keep the audit trail readable: skip the technical columns
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
                          'builder_ids', 'pending_on_id', 'pending_on_name', 'pending_since', 'pending_by_name');
      if (o->k) is distinct from (n->k) then
        insert into public.audit_log (table_name, record_id, record_label, action, field, old_value, new_value, changed_by, changed_by_name)
        values (TG_TABLE_NAME, rid, lbl, 'update', k, o->>k, n->>k, auth.uid(), who);
      end if;
    end loop;
  end if;
  return null;
end $$;

-- 2) AI builders (text names) -> profile ids, so a builder can see and work on "their" accounts
create or replace function public.match_builders(n1 text, n2 text) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct p.id), '{}'::uuid[]) from public.profiles p
   where p.active and (
     (nullif(trim(n1), '') is not null and (lower(p.full_name) = lower(trim(n1)) or lower(p.full_name) like lower(trim(n1)) || ' %'))
     or (nullif(trim(n2), '') is not null and (lower(p.full_name) = lower(trim(n2)) or lower(p.full_name) like lower(trim(n2)) || ' %')))
$$;

create or replace function public.link_account_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
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
  new.builder_ids := public.match_builders(new.ai_builder, new.ai_builder_2);
  return new;
end $$;

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
    update public.purchase_accounts set builder_ids = public.match_builders(ai_builder, ai_builder_2)
     where ai_builder is not null or ai_builder_2 is not null;
  end if;
  return new;
end $$;

-- 3) Who may change what on an account
create or replace function public.guard_account_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  -- people assignment: Admin only
  new.ai_builder := old.ai_builder; new.ai_builder_2 := old.ai_builder_2; new.closed_by := old.closed_by; new.sales := old.sales; new.builder_ids := old.builder_ids;
  -- identity details come from AIGOAL: only Admin or this account's AI builder can change them
  if not (auth.uid() = any (old.builder_ids)) then
    new.account_name := old.account_name; new.contact_person := old.contact_person; new.phone := old.phone; new.email := old.email;
    new.industry := old.industry; new.category := old.category; new.purchase_date := old.purchase_date;
  end if;
  -- the "pending on" status only changes through remind_account() / clear_reminder()
  if coalesce(current_setting('app.pending_rpc', true), '') <> '1' then
    new.pending_on_id := old.pending_on_id; new.pending_on_name := old.pending_on_name; new.pending_since := old.pending_since; new.pending_by_name := old.pending_by_name;
  end if;
  return new;
end $$;
drop trigger if exists guard_account_fields on public.purchase_accounts;
create trigger guard_account_fields before update on public.purchase_accounts for each row execute function public.guard_account_fields();

drop policy if exists "accounts own select" on public.purchase_accounts;
drop policy if exists "accounts own update" on public.purchase_accounts;
create policy "accounts own select" on public.purchase_accounts for select to authenticated
  using (public.current_role_name() is not null and (owner_id = auth.uid() or auth.uid() = any (builder_ids) or pending_on_id = auth.uid()));
create policy "accounts own update" on public.purchase_accounts for update to authenticated
  using (public.current_role_name() is not null and (owner_id = auth.uid() or auth.uid() = any (builder_ids) or pending_on_id = auth.uid()))
  with check (public.current_role_name() is not null and (owner_id = auth.uid() or auth.uid() = any (builder_ids) or pending_on_id = auth.uid()));

-- 4) Follow-up timeline (append-only: each entry keeps who wrote it and when)
create table if not exists public.account_notes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.purchase_accounts(id) on delete cascade,
  kind text not null default 'followup' check (kind in ('followup', 'issue', 'remark', 'reminder')),
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
create index if not exists account_notes_account_idx on public.account_notes (account_id, created_at desc);
alter table public.account_notes enable row level security;
create policy "notes select" on public.account_notes for select to authenticated using (exists (select 1 from public.purchase_accounts p where p.id = account_id));
create policy "notes insert" on public.account_notes for insert to authenticated
  with check (author_id = auth.uid() and kind <> 'reminder' and exists (select 1 from public.purchase_accounts p where p.id = account_id));
create policy "notes update" on public.account_notes for update to authenticated using (exists (select 1 from public.purchase_accounts p where p.id = account_id));
create policy "notes delete" on public.account_notes for delete to authenticated using (public.is_admin());

create or replace function public.account_note_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if TG_OP = 'INSERT' then
    if auth.uid() is not null then
      select nullif(full_name, '') into who from public.profiles where id = auth.uid();
      new.author_id := auth.uid(); new.author_name := coalesce(who, 'Unknown user');
      new.resolved := false; new.resolved_by_name := null; new.resolved_at := null; new.created_at := now();
    end if;
  elsif auth.uid() is not null then            -- only "resolved" can change
    new.account_id := old.account_id; new.kind := old.kind; new.body := old.body; new.next_action := old.next_action; new.deadline := old.deadline;
    new.author_id := old.author_id; new.author_name := old.author_name; new.created_at := old.created_at;
    if new.resolved and not old.resolved then
      select nullif(full_name, '') into who from public.profiles where id = auth.uid();
      new.resolved_by_name := coalesce(who, 'Unknown user'); new.resolved_at := now();
    elsif not new.resolved then new.resolved_by_name := null; new.resolved_at := null;
    else new.resolved_by_name := old.resolved_by_name; new.resolved_at := old.resolved_at; end if;
  end if;
  return new;
end $$;
drop trigger if exists account_note_guard on public.account_notes;
create trigger account_note_guard before insert or update on public.account_notes for each row execute function public.account_note_guard();

-- carry over what was typed in the old single fields
insert into public.account_notes (account_id, kind, body, next_action, deadline, author_name, created_at)
select a.id, 'issue', a.issues, null, null, 'Sheet import', coalesce(a.purchase_date::timestamptz, a.created_at) from public.purchase_accounts a
 where nullif(trim(a.issues), '') is not null and not exists (select 1 from public.account_notes n where n.account_id = a.id and n.author_name = 'Sheet import' and n.kind = 'issue');
insert into public.account_notes (account_id, kind, body, next_action, deadline, author_name, created_at)
select a.id, 'followup', a.action_plan, a.action_plan, a.deadline, 'Sheet import', coalesce(a.purchase_date::timestamptz, a.created_at) from public.purchase_accounts a
 where nullif(trim(a.action_plan), '') is not null and not exists (select 1 from public.account_notes n where n.account_id = a.id and n.author_name = 'Sheet import' and n.kind = 'followup');
insert into public.account_notes (account_id, kind, body, author_name, created_at)
select a.id, 'remark', a.remarks, 'Sheet import', coalesce(a.purchase_date::timestamptz, a.created_at) from public.purchase_accounts a
 where nullif(trim(a.remarks), '') is not null and not exists (select 1 from public.account_notes n where n.account_id = a.id and n.author_name = 'Sheet import' and n.kind = 'remark');

-- 5) Remind: "Pending <person>"
create or replace function public.remind_account(account_id uuid, person_id uuid, note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a public.purchase_accounts; me text; target text;
begin
  select * into a from public.purchase_accounts where id = account_id;
  if not found then raise exception 'Account not found'; end if;
  if public.current_role_name() is null or not (public.is_admin() or a.owner_id = auth.uid() or auth.uid() = any (a.builder_ids) or a.pending_on_id = auth.uid()) then raise exception 'Not allowed'; end if;
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
  if public.current_role_name() is null or not (public.is_admin() or a.owner_id = auth.uid() or auth.uid() = any (a.builder_ids) or a.pending_on_id = auth.uid()) then raise exception 'Not allowed'; end if;
  if a.pending_on_id is null then return; end if;
  select coalesce(nullif(full_name, ''), 'Someone') into me from public.profiles where id = auth.uid();
  perform set_config('app.pending_rpc', '1', true);
  update public.purchase_accounts set pending_on_id = null, pending_on_name = null, pending_since = null, pending_by_name = null where id = account_id;
  insert into public.account_notes (account_id, kind, body, author_id, author_name)
  values (account_id, 'reminder', a.pending_on_name || ' is done (marked by ' || me || ')', auth.uid(), me);
end $$;
revoke all on function public.remind_account(uuid, uuid, text), public.clear_reminder(uuid) from public, anon;
grant execute on function public.remind_account(uuid, uuid, text), public.clear_reminder(uuid) to authenticated;

-- AI builders can now see their accounts: fill builder_ids for existing rows
update public.purchase_accounts set builder_ids = public.match_builders(ai_builder, ai_builder_2) where ai_builder is not null or ai_builder_2 is not null;
