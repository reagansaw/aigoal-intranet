-- The AIGOAL login token pasted in the portal (expires in about an hour). Only the sync function (service role) can read it.
create table if not exists public.aigoal_token (
  id int primary key default 1 check (id = 1),
  token text not null,
  expires_at timestamptz,
  saved_by text,
  saved_at timestamptz not null default now()
);
alter table public.aigoal_token enable row level security;  -- no policies: invisible to every app user
