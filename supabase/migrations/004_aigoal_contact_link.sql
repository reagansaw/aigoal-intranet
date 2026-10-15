-- Link each lead to its contact in app.aigoal.ai (AIGOAL.ai tenant) and flag purchasers.
alter table public.customers
  add column if not exists aigoal_contact_id text,
  add column if not exists aigoal_tags text[] not null default '{}',
  add column if not exists aigoal_status text,            -- new / contacted / won (from the app)
  add column if not exists purchased boolean not null default false,  -- status 'won' or tag 'purchased'
  add column if not exists aigoal_synced_at timestamptz;
create index if not exists customers_aigoal_contact_idx on public.customers (aigoal_contact_id);

-- Staff may edit their lead's details but not the synced / admin-controlled fields.
create or replace function public.guard_customer_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is not null and not public.is_admin() then
    new.owner_id := old.owner_id;
    new.owner_name := old.owner_name;
    new.priority := old.priority;
    new.batch := old.batch;
    new.aigoal_contact_id := old.aigoal_contact_id;
    new.aigoal_tags := old.aigoal_tags;
    new.aigoal_status := old.aigoal_status;
    new.purchased := old.purchased;
    new.aigoal_synced_at := old.aigoal_synced_at;
  end if;
  return new;
end $$;
