-- Products that can be closed; Admin adds / edits / retires them in the app.
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price numeric not null default 0,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.products enable row level security;
create policy "products read" on public.products for select to authenticated using (public.current_role_name() is not null);
create policy "products admin write" on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());
insert into public.products (name, price, sort) values
  ('AI转化变现系统', 4998, 1), ('AI转化变现系统（Top Up Difference）', 3198, 2), ('AI流量变现系统&课程', 1800, 3)
on conflict (name) do nothing;
