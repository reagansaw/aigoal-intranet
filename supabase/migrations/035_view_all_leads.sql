-- A sales person can be allowed to VIEW every lead (read only); editing still needs the lead to be theirs. Admin sets it in People.
alter table public.profiles add column if not exists can_view_all_leads boolean not null default false;

create or replace function public.can_view_all_leads() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.can_view_all_leads and p.active from public.profiles p where p.id = auth.uid()), false)
$$;

drop policy if exists "customers staff own" on public.customers;
create policy "customers staff own" on public.customers for select to authenticated
  using (public.current_role_name() is not null and (owner_id = auth.uid() or demo_by_id = auth.uid() or public.is_booking_staff(id) or public.can_view_all_leads()));

-- only Admin can change the flag (same rule as the other job-role flags)
create or replace function public.guard_profile_view_all() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.can_view_all_leads := old.can_view_all_leads;
  end if;
  return new;
end $$;
drop trigger if exists guard_profile_view_all on public.profiles;
create trigger guard_profile_view_all before update on public.profiles for each row execute function public.guard_profile_view_all();

update public.profiles set can_view_all_leads = true where full_name = 'Winson';
