-- 023 made the customers and demo_bookings policies reference each other (infinite recursion).
-- Break the loop: the "am I the person giving this lead's demo?" check runs as definer (bypasses RLS).
create or replace function public.is_booking_staff(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.demo_bookings b where b.customer_id = cid and b.staff_id = auth.uid())
$$;
drop policy if exists "customers staff own" on public.customers;
create policy "customers staff own" on public.customers for select to authenticated
  using (public.current_role_name() is not null and (owner_id = auth.uid() or demo_by_id = auth.uid() or public.is_booking_staff(id)));
drop policy if exists "demo read" on public.demo_bookings;
create policy "demo read" on public.demo_bookings for select to authenticated
  using (public.is_admin() or staff_id = auth.uid() or exists (select 1 from public.customers c where c.id = customer_id));
