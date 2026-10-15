-- Job roles (a person can be both): Sales and AI Builder. Only Admin sets them.
alter table public.profiles add column if not exists is_sales boolean not null default false;
alter table public.profiles add column if not exists is_ai_builder boolean not null default false;

create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if not public.is_admin_or_hr() then
    new.role := old.role; new.active := old.active; new.employment_type := old.employment_type;
    new.start_date := old.start_date; new.end_date := old.end_date; new.title := old.title;
    new.leave_entitlement := old.leave_entitlement; new.is_sales := old.is_sales; new.is_ai_builder := old.is_ai_builder;
    if coalesce(current_setting('app.pw_rpc', true), '') <> '1' then
      new.must_change_password := old.must_change_password;
    end if;
  elsif public.current_role_name() = 'hr' then
    new.role := old.role; new.is_sales := old.is_sales; new.is_ai_builder := old.is_ai_builder;
  end if;
  return new;
end $$;

-- starting point from the sheets (Admin can change in People)
update public.profiles set is_sales = true where full_name in ('Aaron', 'Winson', 'Bryan', 'Reagan', 'Wayne');
update public.profiles set is_ai_builder = true where full_name in ('Bryan', 'Reagan', 'Wayne', 'Harvard');
