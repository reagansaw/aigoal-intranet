-- Pending Demo needs WHO demos and WHEN; Invite Webinar needs the webinar DATE invited to.
alter table public.customers
  add column if not exists demo_by_id uuid references public.profiles(id) on delete set null,
  add column if not exists demo_by_name text,
  add column if not exists demo_date date,
  add column if not exists demo_time text,
  add column if not exists webinar_invite_date date;
alter table public.customers drop constraint if exists customers_demo_needs_who_when;
alter table public.customers add constraint customers_demo_needs_who_when
  check (lead_status is distinct from 'pending_demo' or (nullif(trim(coalesce(demo_by_name, '')), '') is not null and demo_date is not null and nullif(trim(coalesce(demo_time, '')), '') is not null));
alter table public.customers drop constraint if exists customers_invite_needs_date;
alter table public.customers add constraint customers_invite_needs_date
  check (lead_status is distinct from 'invite_webinar' or webinar_invite_date is not null);

-- the person who will give the demo can see that lead (read-only)
drop policy if exists "customers staff own" on public.customers;
create policy "customers staff own" on public.customers for select to authenticated
  using (public.current_role_name() is not null and (owner_id = auth.uid() or demo_by_id = auth.uid()));

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
  if new.lead_status is distinct from old.lead_status then
    if new.lead_status is distinct from 'pending_demo' then new.demo_by_id := null; new.demo_by_name := null; new.demo_date := null; new.demo_time := null; end if;
    if new.lead_status is distinct from 'invite_webinar' then new.webinar_invite_date := null; end if;
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
