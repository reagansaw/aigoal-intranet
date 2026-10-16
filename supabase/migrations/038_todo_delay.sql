-- Moving a task to a later day leaves a permanent, non-editable delay record (how many days late, from which day).
alter table public.todos
  add column if not exists original_due date,
  add column if not exists delayed_days int not null default 0,
  add column if not exists delay_log jsonb not null default '[]';

create or replace function public.todo_delay_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare kl date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  if tg_op = 'INSERT' then
    new.original_due := new.due_date; new.delayed_days := 0; new.delay_log := '[]'; return new;
  end if;
  -- the delay fields are written only here, never by the app
  new.original_due := old.original_due; new.delayed_days := old.delayed_days; new.delay_log := old.delay_log;
  if new.due_date is distinct from old.due_date and new.due_date is not null then
    if old.due_date is null then
      new.original_due := new.due_date;                      -- first time it gets a day: not a delay
    elsif not old.done and new.due_date > old.due_date then  -- moved later: count the delay from the ORIGINAL day; it never shrinks
      new.original_due := coalesce(old.original_due, old.due_date);
      new.delayed_days := greatest(old.delayed_days, new.due_date - new.original_due);
      new.delay_log := old.delay_log || jsonb_build_object('from', old.due_date, 'to', new.due_date, 'at', now(), 'by', coalesce((select full_name from public.profiles where id = auth.uid()), 'System'));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists todo_delay_guard on public.todos;
create trigger todo_delay_guard before insert or update on public.todos for each row execute function public.todo_delay_guard();
update public.todos set original_due = due_date where original_due is null and due_date is not null;
