-- 1. To-Do: how long the task takes (remarks use the existing notes column)
alter table public.todos add column if not exists duration_min int check (duration_min is null or duration_min > 0);

-- 2. Action items: extra members and remarks besides the person responsible
alter table public.meeting_tasks add column if not exists remarks text, add column if not exists member_ids uuid[] not null default '{}';
create or replace function public.can_see_meeting(mid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_role_name() is not null and (
    public.is_admin()
    or exists (select 1 from public.meetings m where m.id = mid and (m.created_by = auth.uid() or m.minute_taker_id = auth.uid() or auth.uid() = any (m.attendee_ids)))
    or exists (select 1 from public.meeting_tasks t where t.meeting_id = mid and (t.assignee_id = auth.uid() or auth.uid() = any (t.member_ids))))
$$;
create or replace function public.guard_meeting_task() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.can_edit_meeting(old.meeting_id) then
    new.meeting_id := old.meeting_id; new.sort := old.sort; new.title := old.title; new.assignee_id := old.assignee_id;
    new.deadline := old.deadline; new.todo_id := old.todo_id; new.remarks := old.remarks; new.member_ids := old.member_ids;
  end if;
  return new;
end $$;

-- 3. End-of-day mark: what was done out of what was planned, with a closing note
create table if not exists public.todo_day_marks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  done int not null default 0,
  total int not null default 0,
  carried int not null default 0,
  note text,
  closed_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.todo_day_marks enable row level security;
create policy "marks own or manager" on public.todo_day_marks for all to authenticated
  using (user_id = auth.uid() or public.is_admin_or_hr()) with check (user_id = auth.uid() or public.is_admin_or_hr());

-- 4. Admin dashboard: the lead pipeline, from marketing to purchased (webinars that have already taken place)
create or replace function public.lead_pipeline() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Kuala_Lumpur')::date; r jsonb;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  with l as (
    select c.*, (c.owner_id is not null or nullif(c.owner_name, '') is not null) as has_sales,
      (c.called or c.lead_status is not null or exists (select 1 from public.customer_notes n where n.customer_id = c.id)) as followed
    from public.customers c where c.batch_date is null or c.batch_date < today)
  select jsonb_build_object(
    'leads', count(*),
    'with_sales', count(*) filter (where has_sales),
    'no_sales', count(*) filter (where not has_sales),
    'following_up', count(*) filter (where followed and lead_status is distinct from 'close_deal'),
    'not_touched', count(*) filter (where has_sales and not followed),
    'pending_management', count(*) filter (where lead_status = 'pending_management'),
    'pending_demo', count(*) filter (where lead_status = 'pending_demo'),
    'pending_consultation', count(*) filter (where lead_status = 'pending_consultation'),
    'invite_webinar', count(*) filter (where lead_status = 'invite_webinar'),
    'potential', count(*) filter (where lead_status = 'potential'),
    'purchased', count(*) filter (where lead_status = 'close_deal'),
    'followups_total', (select count(*) from public.customer_notes),
    'followups_week', (select count(*) from public.customer_notes where created_at >= now() - interval '7 days')
  ) into r from l;
  return r;
end $$;
revoke all on function public.lead_pipeline() from public, anon;
grant execute on function public.lead_pipeline() to authenticated;
