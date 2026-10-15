-- Demo bookings come from the AIGOAL calendar (service "DEMO"), matched to leads by phone/email. Nobody types them.
create table if not exists public.demo_bookings (
  id uuid primary key default gen_random_uuid(),
  appointment_id text not null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  staff_name text,
  staff_id uuid references public.profiles(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz,
  status text,
  zoom_url text,
  customer_name text,
  synced_at timestamptz not null default now(),
  unique (appointment_id, customer_id)
);
create index if not exists demo_bookings_customer_idx on public.demo_bookings (customer_id, start_at desc);
alter table public.demo_bookings enable row level security;
drop policy if exists "demo read" on public.demo_bookings;
create policy "demo read" on public.demo_bookings for select to authenticated
  using (public.is_admin() or staff_id = auth.uid() or exists (select 1 from public.customers c where c.id = customer_id));   -- no write policies: only the sync function writes

-- the person giving the demo (per the booking) can see that lead
drop policy if exists "customers staff own" on public.customers;
create policy "customers staff own" on public.customers for select to authenticated
  using (public.current_role_name() is not null and (owner_id = auth.uid() or demo_by_id = auth.uid()
         or exists (select 1 from public.demo_bookings b where b.customer_id = customers.id and b.staff_id = auth.uid())));

-- Pending Demo no longer needs typed details (they come from the booking)
alter table public.customers drop constraint if exists customers_demo_needs_who_when;
