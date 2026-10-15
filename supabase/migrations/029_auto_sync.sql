-- Automatic AIGOAL calendar sync every 30 minutes (needs the AIGOAL_API_TOKEN function secret) + a log the dashboard reads.
create table if not exists public.sync_log (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  source text not null,
  ok boolean not null,
  error text,
  onboarding int,
  bookings int
);
alter table public.sync_log enable row level security;
create policy "sync_log admin read" on public.sync_log for select to authenticated using (public.is_admin());
create index if not exists sync_log_ran_idx on public.sync_log (ran_at desc);

create extension if not exists pg_net;
create extension if not exists pg_cron;
