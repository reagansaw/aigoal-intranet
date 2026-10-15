-- Onboarding 1 / 2 / 3 come from the AIGOAL calendar (app.aigoal.ai). Nobody can type them in the intranet:
-- the table has no write policies (only the sync function, using the service role, writes it).
create table if not exists public.onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  appointment_id text not null unique,
  account_id uuid not null references public.purchase_accounts(id) on delete cascade,
  round int not null check (round between 1 and 3),
  service text,
  start_at timestamptz not null,
  end_at timestamptz,
  status text,
  host text,
  zoom_url text,
  customer_name text,
  synced_at timestamptz not null default now()
);
create index if not exists onboarding_sessions_account_idx on public.onboarding_sessions (account_id, round, start_at desc);
alter table public.onboarding_sessions enable row level security;
-- You see the sessions of the accounts you can see (Admin: all).
create policy "onboarding read" on public.onboarding_sessions for select to authenticated
  using (public.is_admin() or exists (select 1 from public.purchase_accounts p where p.id = account_id));

-- The old hand-typed coaching dates are frozen for everyone using the app.
create or replace function public.freeze_coaching_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.coaching_1 := old.coaching_1; new.coaching_2 := old.coaching_2; new.final_coaching := old.final_coaching;
  end if;
  return new;
end $$;
drop trigger if exists freeze_coaching_fields on public.purchase_accounts;
create trigger freeze_coaching_fields before update on public.purchase_accounts for each row execute function public.freeze_coaching_fields();
