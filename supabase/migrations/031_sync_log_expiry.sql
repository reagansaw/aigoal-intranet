alter table public.sync_log add column if not exists token_expires_at timestamptz;
