alter table public.sync_log add column if not exists leads_added int, add column if not exists leads_updated int;
