-- An employee whose end date has passed (Kuala Lumpur time) loses access the next day:
-- every role helper goes through current_role_name(), which now returns null for them,
-- and a nightly job also flips the profile to inactive so People shows it.
create or replace function public.kl_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kuala_Lumpur')::date $$;

create or replace function public.current_role_name() returns text
language sql stable security definer set search_path = public as $$
  select role::text from public.profiles
  where id = auth.uid() and active and (end_date is null or end_date >= public.kl_today())
$$;

create or replace function public.can_view_all_leads() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.can_view_all_leads and p.active and p.role <> 'external' and (p.end_date is null or p.end_date >= public.kl_today())
                   from public.profiles p where p.id = auth.uid()), false)
$$;

create or replace function public.deactivate_ended_staff() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.profiles set active = false where active and end_date is not null and end_date < public.kl_today();
  get diagnostics n = row_count;
  return n;
end $$;
-- 00:05 Kuala Lumpur = 16:05 UTC the day before
select cron.unschedule(jobid) from cron.job where jobname = 'deactivate-ended-staff';
select cron.schedule('deactivate-ended-staff', '5 16 * * *', $$select public.deactivate_ended_staff()$$);
