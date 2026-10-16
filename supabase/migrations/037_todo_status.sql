-- To-Do board (Trello style): a card is To do / Doing / Done. "Done" stays in step with the existing done flag.
alter table public.todos add column if not exists status text not null default 'todo' check (status in ('todo', 'doing', 'done'));
update public.todos set status = 'done' where done and status <> 'done';

create or replace function public.todo_status_sync() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.done then new.status := 'done'; elsif new.status = 'done' then new.done := true; new.done_at := coalesce(new.done_at, now()); end if;
  elsif new.done is distinct from old.done then
    new.status := case when new.done then 'done' when new.status = 'done' then 'todo' else new.status end;
  elsif new.status is distinct from old.status then
    new.done := (new.status = 'done');
    new.done_at := case when new.done then coalesce(new.done_at, now()) else null end;
  end if;
  return new;
end $$;
drop trigger if exists todo_status_sync on public.todos;
create trigger todo_status_sync before insert or update on public.todos for each row execute function public.todo_status_sync();
