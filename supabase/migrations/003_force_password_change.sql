-- New users and users whose password was reset by Admin/HR must set their own password at next login.
alter table public.profiles add column if not exists must_change_password boolean not null default true;
update public.profiles set must_change_password = false;  -- existing accounts are unaffected

create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- service role / SQL editor: unrestricted
  if not public.is_admin_or_hr() then
    new.role := old.role;
    new.active := old.active;
    new.employment_type := old.employment_type;
    new.start_date := old.start_date;
    new.end_date := old.end_date;
    new.title := old.title;
    if coalesce(current_setting('app.pw_rpc', true), '') <> '1' then
      new.must_change_password := old.must_change_password;  -- staff can only clear it via password_changed()
    end if;
  elsif public.current_role_name() = 'hr' then
    new.role := old.role; -- only admin can change roles
  end if;
  return new;
end $$;

-- Called by the app right after the user has set their own new password.
create or replace function public.password_changed() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.pw_rpc', '1', true);
  update public.profiles set must_change_password = false where id = auth.uid();
end $$;
revoke all on function public.password_changed() from public, anon;
grant execute on function public.password_changed() to authenticated;
