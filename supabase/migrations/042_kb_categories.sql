-- Knowledge Base categories are a fixed list set by Admin (editors pick from it). Renaming a category renames its articles.
create table if not exists public.kb_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.kb_categories enable row level security;
create policy "kbcat read" on public.kb_categories for select to authenticated using (public.current_role_name() is not null);
create policy "kbcat admin" on public.kb_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.kb_category_rename() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then update public.kb_articles set category = new.name where category = old.name; end if;
  return new;
end $$;
drop trigger if exists kb_category_rename on public.kb_categories;
create trigger kb_category_rename after update of name on public.kb_categories for each row execute function public.kb_category_rename();

insert into public.kb_categories (name, sort) values
  ('Useful Link', 1), ('Payment & Pricing', 2), ('Scripts', 3), ('Onboarding', 4), ('Sales Flow', 5), ('名单', 6), ('Sales Report', 7),
  ('E-Invoice', 8), ('Service Line', 9), ('Social', 10), ('Design Reference', 11)
on conflict (name) do nothing;
-- any category already used by an article but not in the list above
insert into public.kb_categories (name, sort) select distinct category, 99 from public.kb_articles where category not in (select name from public.kb_categories);
