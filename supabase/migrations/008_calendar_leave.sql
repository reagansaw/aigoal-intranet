-- Company settings (key/value) and per-person leave entitlement. Standard = 8 days per year; Admin/HR can change it.
create table if not exists public.company_settings (key text primary key, value text not null);
insert into public.company_settings (key, value) values ('default_leave_days', '8') on conflict (key) do nothing;
alter table public.company_settings enable row level security;
create policy "settings read" on public.company_settings for select to authenticated using (true);
create policy "settings admin write" on public.company_settings for all to authenticated using (public.is_admin_or_hr()) with check (public.is_admin_or_hr());

alter table public.profiles add column if not exists leave_entitlement numeric not null default 8;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, leave_entitlement)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''),
          coalesce((select value::numeric from public.company_settings where key = 'default_leave_days'), 8));
  return new;
end $$;

create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if not public.is_admin_or_hr() then
    new.role := old.role; new.active := old.active; new.employment_type := old.employment_type;
    new.start_date := old.start_date; new.end_date := old.end_date; new.title := old.title;
    new.leave_entitlement := old.leave_entitlement;
    if coalesce(current_setting('app.pw_rpc', true), '') <> '1' then
      new.must_change_password := old.must_change_password;
    end if;
  elsif public.current_role_name() = 'hr' then
    new.role := old.role;
  end if;
  return new;
end $$;

-- Public holidays (Admin-editable; dates for Islamic holidays can shift, so check each year).
create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null,
  name text not null,
  region text not null default 'National',
  active boolean not null default true,
  unique (holiday_date, name)
);
alter table public.holidays enable row level security;
create policy "holidays read" on public.holidays for select to authenticated using (true);
create policy "holidays admin write" on public.holidays for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.holidays (holiday_date, name, region) values
 ('2026-01-01','New Year''s Day','KL & Selangor'),('2026-02-02','Federal Territory Day / Thaipusam (in lieu)','KL & Selangor'),
 ('2026-02-17','Chinese New Year','National'),('2026-02-18','Chinese New Year (2nd day)','National'),
 ('2026-03-07','Nuzul Al-Quran','KL & Selangor'),('2026-03-20','Hari Raya Aidilfitri holiday','National'),('2026-03-21','Hari Raya Aidilfitri','National'),
 ('2026-03-22','Hari Raya Aidilfitri (2nd day)','National'),('2026-03-23','Hari Raya Aidilfitri holiday','National'),
 ('2026-05-01','Labour Day','National'),('2026-05-27','Hari Raya Haji','National'),('2026-05-31','Wesak Day','National'),
 ('2026-06-01','Agong''s Birthday','National'),('2026-06-17','Awal Muharram','National'),('2026-08-25','Maulidur Rasul','National'),
 ('2026-08-31','Merdeka Day','National'),('2026-09-16','Malaysia Day','National'),('2026-11-08','Deepavali','KL & Selangor'),
 ('2026-11-09','Deepavali (in lieu)','KL & Selangor'),('2026-12-25','Christmas Day','National'),
 ('2027-01-01','New Year''s Day','KL & Selangor'),('2027-01-22','Thaipusam','KL & Selangor'),('2027-02-06','Chinese New Year','National'),
 ('2027-02-07','Chinese New Year (2nd day)','National'),('2027-02-24','Nuzul Al-Quran','KL & Selangor'),('2027-03-10','Hari Raya Aidilfitri','National'),
 ('2027-03-11','Hari Raya Aidilfitri (2nd day)','National'),('2027-05-01','Labour Day','National'),('2027-05-17','Hari Raya Haji','National'),
 ('2027-05-20','Wesak Day','National'),('2027-06-06','Awal Muharram','National'),('2027-06-07','Agong''s Birthday','National'),
 ('2027-08-15','Maulidur Rasul','National'),('2027-08-31','Merdeka Day','National'),('2027-09-16','Malaysia Day','National'),
 ('2027-10-29','Deepavali','KL & Selangor'),('2027-12-25','Christmas Day','National')
on conflict do nothing;

create or replace function public.working_days(s date, e date) returns numeric
language sql stable as $$
  select count(*)::numeric from generate_series(s, e, interval '1 day') d
   where extract(isodow from d) < 6
     and not exists (select 1 from public.holidays h where h.active and h.holiday_date = d::date)
$$;

-- Leave and business travel requests (travel never uses up leave days).
create table if not exists public.time_off_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  type text not null check (type in ('leave', 'travel')),
  start_date date not null,
  end_date date not null,
  half_day boolean not null default false,
  days numeric not null default 0,
  reason text,
  destination text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists time_off_user_idx on public.time_off_requests (user_id, start_date);
alter table public.time_off_requests enable row level security;
create policy "toff read" on public.time_off_requests for select to authenticated using (user_id = auth.uid() or public.is_admin_or_hr());
create policy "toff insert" on public.time_off_requests for insert to authenticated with check (user_id = auth.uid() and public.current_role_name() is not null);
create policy "toff update" on public.time_off_requests for update to authenticated
  using ((user_id = auth.uid() or public.is_admin_or_hr()) and public.current_role_name() is not null);
create policy "toff delete" on public.time_off_requests for delete to authenticated using (public.is_admin());

create or replace function public.leave_figures(uid uuid, yr int, exclude_id uuid default null)
returns table (entitlement numeric, used numeric, pending numeric, remaining numeric)
language sql stable security definer set search_path = public as $$
  select p.leave_entitlement,
    coalesce(sum(r.days) filter (where r.status = 'approved'), 0),
    coalesce(sum(r.days) filter (where r.status = 'pending'), 0),
    p.leave_entitlement - coalesce(sum(r.days) filter (where r.status in ('approved', 'pending')), 0)
  from public.profiles p
  left join public.time_off_requests r on r.user_id = p.id and r.type = 'leave' and extract(year from r.start_date) = yr and r.id is distinct from exclude_id
  where p.id = uid group by p.id, p.leave_entitlement
$$;

create or replace function public.guard_time_off() returns trigger
language plpgsql security definer set search_path = public as $$
declare f record; mgr boolean := public.is_admin_or_hr(); me uuid := auth.uid();
begin
  if me is not null and TG_OP = 'UPDATE' then
    if mgr and old.user_id <> me or public.is_admin() then
      -- decision by Admin/HR: only status + note may change; HR cannot approve their own request
      new.user_id := old.user_id; new.type := old.type; new.start_date := old.start_date; new.end_date := old.end_date;
      new.half_day := old.half_day; new.reason := old.reason; new.destination := old.destination;
      if new.status is distinct from old.status then
        if new.status in ('approved', 'rejected') then new.decided_by := me; new.decided_at := now(); end if;
      end if;
    else
      -- the requester (or HR on their own request) may only cancel
      new.type := old.type; new.start_date := old.start_date; new.end_date := old.end_date; new.half_day := old.half_day;
      new.reason := old.reason; new.destination := old.destination; new.user_id := old.user_id;
      new.decided_by := old.decided_by; new.decided_at := old.decided_at; new.decision_note := old.decision_note;
      if new.status is distinct from old.status and not (new.status = 'cancelled' and old.status in ('pending', 'approved')) then
        raise exception 'You can only cancel your own request';
      end if;
    end if;
  elsif me is not null and TG_OP = 'INSERT' then
    new.status := 'pending'; new.decided_by := null; new.decided_at := null; new.decision_note := null; new.user_id := me;
  end if;

  if new.half_day and new.start_date <> new.end_date then new.half_day := false; end if;
  new.days := case when new.half_day then (case when public.working_days(new.start_date, new.start_date) > 0 then 0.5 else 0 end)
                   else public.working_days(new.start_date, new.end_date) end;

  if new.status in ('pending', 'approved') then
    if new.type = 'leave' and new.days = 0 then raise exception 'The selected dates have no working days (weekends and public holidays are not counted)'; end if;
    if exists (select 1 from public.time_off_requests o where o.user_id = new.user_id and o.id is distinct from new.id and o.status in ('pending', 'approved')
               and o.start_date <= new.end_date and o.end_date >= new.start_date) then
      raise exception 'You already have a request that overlaps these dates';
    end if;
    if new.type = 'leave' then
      select * into f from public.leave_figures(new.user_id, extract(year from new.start_date)::int, new.id);
      if f.remaining < new.days then
        raise exception 'Not enough leave: % day(s) remaining, % requested', f.remaining, new.days;
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_time_off on public.time_off_requests;
create trigger guard_time_off before insert or update on public.time_off_requests for each row execute function public.guard_time_off();

-- Who is away (approved only). Reasons stay private: the view exposes no reason or notes.
create or replace view public.calendar_time_off as
  select r.id, r.user_id, p.full_name, r.type, r.start_date, r.end_date, r.half_day, r.days, r.destination
  from public.time_off_requests r join public.profiles p on p.id = r.user_id where r.status = 'approved';
revoke all on public.calendar_time_off from anon, public;
grant select on public.calendar_time_off to authenticated;

create or replace function public.my_leave(yr int) returns table (entitlement numeric, used numeric, pending numeric, remaining numeric)
language sql stable security definer set search_path = public as $$ select * from public.leave_figures(auth.uid(), yr) $$;

create or replace function public.leave_balances(yr int)
returns table (user_id uuid, full_name text, entitlement numeric, used numeric, pending numeric, remaining numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_or_hr() then raise exception 'Not allowed'; end if;
  return query select p.id, p.full_name, f.entitlement, f.used, f.pending, f.remaining
    from public.profiles p cross join lateral public.leave_figures(p.id, yr) f where p.active order by p.full_name;
end $$;

create or replace function public.set_leave_for_everyone(days numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_or_hr() then raise exception 'Not allowed'; end if;
  update public.profiles set leave_entitlement = days where active;
  insert into public.company_settings (key, value) values ('default_leave_days', days::text)
    on conflict (key) do update set value = excluded.value;
end $$;
revoke all on function public.my_leave(int), public.leave_balances(int), public.set_leave_for_everyone(numeric) from public, anon;
grant execute on function public.my_leave(int), public.leave_balances(int), public.set_leave_for_everyone(numeric) to authenticated;
