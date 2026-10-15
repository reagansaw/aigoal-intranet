-- AIGOAL has two booking services for leads: DEMO and Consultation. Both come from the calendar sync.
alter table public.demo_bookings add column if not exists kind text not null default 'demo';
do $$ begin alter table public.demo_bookings add constraint demo_bookings_kind_chk check (kind in ('demo', 'consultation')); exception when duplicate_object then null; end $$;
alter table public.customers drop constraint if exists customers_lead_status_check;
alter table public.customers add constraint customers_lead_status_check
  check (lead_status in ('pending_management', 'pending_demo', 'pending_consultation', 'invite_webinar', 'potential', 'close_deal'));
