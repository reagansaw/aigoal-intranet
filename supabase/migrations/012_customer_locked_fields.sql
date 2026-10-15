-- Customers: priority, assigned sales, webinar, name, phone, email can only be changed by Admin.
create or replace function public.guard_customer_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is not null and not public.is_admin() then
    new.owner_id := old.owner_id; new.owner_name := old.owner_name;
    new.priority := old.priority; new.batch := old.batch;
    new.name := old.name; new.phone := old.phone; new.email := old.email;
    new.aigoal_contact_id := old.aigoal_contact_id; new.aigoal_tags := old.aigoal_tags; new.aigoal_status := old.aigoal_status;
    new.purchased := old.purchased; new.aigoal_synced_at := old.aigoal_synced_at;
  end if;
  return new;
end $$;
