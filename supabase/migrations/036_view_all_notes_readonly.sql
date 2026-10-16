-- "Can view all leads" is read only: such a person cannot add follow-ups to leads that are not theirs
drop policy if exists "cnotes insert" on public.customer_notes;
create policy "cnotes insert" on public.customer_notes for insert to authenticated with check (
  author_id = auth.uid()
  and exists (select 1 from public.customers c where c.id = customer_id)
  and (not public.can_view_all_leads() or public.is_admin()
       or exists (select 1 from public.customers c where c.id = customer_id and (c.owner_id = auth.uid() or c.demo_by_id = auth.uid() or public.is_booking_staff(c.id)))));
