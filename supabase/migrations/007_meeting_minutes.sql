-- To-Do items may now be unscheduled (imported from a meeting, waiting for the owner to pick a day).
alter table public.todos alter column due_date drop not null;
alter table public.todos
  add column if not exists deadline date,            -- the deadline agreed in the meeting
  add column if not exists source text,              -- e.g. "Meeting: Weekly sales sync"
  add column if not exists meeting_task_id uuid;

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  meeting_date date not null default current_date,
  minute_taker_id uuid references public.profiles(id) on delete set null,   -- 谁负责做总结
  attendee_ids uuid[] not null default '{}',
  discussion text,                                                          -- 开会谈到的东西
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.meeting_tasks (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  sort int not null default 0,
  title text not null,
  assignee_id uuid references public.profiles(id) on delete set null,       -- 谁负责
  deadline date,
  status text not null default 'open' check (status in ('open', 'done')),
  todo_id uuid references public.todos(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists meeting_tasks_meeting_idx on public.meeting_tasks (meeting_id, sort);
create index if not exists meeting_tasks_assignee_idx on public.meeting_tasks (assignee_id);

create or replace function public.can_see_meeting(mid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_role_name() is not null and (
    public.is_admin()
    or exists (select 1 from public.meetings m where m.id = mid and (m.created_by = auth.uid() or m.minute_taker_id = auth.uid() or auth.uid() = any (m.attendee_ids)))
    or exists (select 1 from public.meeting_tasks t where t.meeting_id = mid and t.assignee_id = auth.uid()))
$$;
create or replace function public.can_edit_meeting(mid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_role_name() is not null and (
    public.is_admin()
    or exists (select 1 from public.meetings m where m.id = mid and (m.created_by = auth.uid() or m.minute_taker_id = auth.uid())))
$$;

alter table public.meetings enable row level security;
alter table public.meeting_tasks enable row level security;
create policy "meetings select" on public.meetings for select to authenticated using (public.can_see_meeting(id));
create policy "meetings insert" on public.meetings for insert to authenticated with check (public.current_role_name() is not null and created_by = auth.uid());
create policy "meetings update" on public.meetings for update to authenticated using (public.can_edit_meeting(id)) with check (public.can_edit_meeting(id));
create policy "meetings delete" on public.meetings for delete to authenticated using (public.can_edit_meeting(id));
create policy "mtasks select" on public.meeting_tasks for select to authenticated using (public.can_see_meeting(meeting_id));
create policy "mtasks insert" on public.meeting_tasks for insert to authenticated with check (public.can_edit_meeting(meeting_id));
create policy "mtasks update" on public.meeting_tasks for update to authenticated
  using (public.can_edit_meeting(meeting_id) or (assignee_id = auth.uid() and public.current_role_name() is not null));
create policy "mtasks delete" on public.meeting_tasks for delete to authenticated using (public.can_edit_meeting(meeting_id));

-- The person responsible may only tick their task done; everything else is for the minute taker / Admin.
create or replace function public.guard_meeting_task() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.can_edit_meeting(old.meeting_id) then
    new.meeting_id := old.meeting_id; new.sort := old.sort; new.title := old.title; new.assignee_id := old.assignee_id;
    new.deadline := old.deadline; new.todo_id := old.todo_id;
  end if;
  return new;
end $$;
create trigger guard_meeting_task before update on public.meeting_tasks for each row execute function public.guard_meeting_task();

create or replace function public.touch_meeting() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger touch_meeting before update on public.meetings for each row execute function public.touch_meeting();

-- Keep the meeting task and its To-Do item in step (done <-> done).
create or replace function public.sync_task_to_todo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.todo_id is not null and new.status is distinct from old.status then
    update public.todos set done = (new.status = 'done'), done_at = case when new.status = 'done' then now() end
     where id = new.todo_id and done is distinct from (new.status = 'done');
  end if;
  return new;
end $$;
create trigger sync_task_to_todo after update of status on public.meeting_tasks for each row execute function public.sync_task_to_todo();

create or replace function public.sync_todo_to_task() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.meeting_task_id is not null and new.done is distinct from old.done then
    update public.meeting_tasks set status = case when new.done then 'done' else 'open' end
     where id = new.meeting_task_id and status is distinct from (case when new.done then 'done' else 'open' end);
  end if;
  return new;
end $$;
create trigger sync_todo_to_task after update of done on public.todos for each row execute function public.sync_todo_to_task();

-- Import: creates an UNSCHEDULED To-Do for the person responsible (they choose the day afterwards).
create or replace function public.import_meeting_task(task_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare t public.meeting_tasks; m public.meetings; tid uuid;
begin
  select * into t from public.meeting_tasks where id = task_id;
  if not found then raise exception 'Task not found'; end if;
  if not (t.assignee_id = auth.uid() or public.can_edit_meeting(t.meeting_id)) then raise exception 'Not allowed'; end if;
  if t.assignee_id is null then raise exception 'Assign someone responsible first'; end if;
  if t.todo_id is not null and exists (select 1 from public.todos where id = t.todo_id) then return t.todo_id; end if;
  select * into m from public.meetings where id = t.meeting_id;
  insert into public.todos (user_id, title, due_date, deadline, source, meeting_task_id, created_by, done)
  values (t.assignee_id, t.title, null, t.deadline, 'Meeting: ' || m.title, t.id, auth.uid(), t.status = 'done')
  returning id into tid;
  update public.meeting_tasks set todo_id = tid where id = t.id;
  return tid;
end $$;
revoke all on function public.import_meeting_task(uuid) from public, anon;
grant execute on function public.import_meeting_task(uuid) to authenticated;
