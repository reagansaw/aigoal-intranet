-- Knowledge Base sub-categories: each category can hold an Admin-set list of sub-categories; articles may pick one.
create table if not exists public.kb_subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.kb_categories(id) on delete cascade,
  name text not null,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (category_id, name)
);
alter table public.kb_subcategories enable row level security;
drop policy if exists "kbsub read" on public.kb_subcategories;
drop policy if exists "kbsub admin" on public.kb_subcategories;
create policy "kbsub read" on public.kb_subcategories for select to authenticated using (public.current_role_name() is not null);
create policy "kbsub admin" on public.kb_subcategories for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.kb_articles add column if not exists subcategory text;

-- renaming a sub-category renames it on its articles; deleting one just clears it on the articles (they stay in the category)
create or replace function public.kb_subcategory_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare cat text;
begin
  if tg_op = 'UPDATE' then
    if new.name is distinct from old.name then
      select name into cat from public.kb_categories where id = new.category_id;
      update public.kb_articles set subcategory = new.name where category = cat and subcategory = old.name;
    end if;
    return new;
  else
    select name into cat from public.kb_categories where id = old.category_id;
    update public.kb_articles set subcategory = null where category = cat and subcategory = old.name;
    return old;
  end if;
end $$;
drop trigger if exists kb_subcategory_sync on public.kb_subcategories;
create trigger kb_subcategory_sync after update of name or delete on public.kb_subcategories for each row execute function public.kb_subcategory_sync();

-- a category that still has articles cannot be deleted (the UI blocks it too)
create or replace function public.kb_category_delete_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.kb_articles where category = old.name) then
    raise exception 'Category "%" still has articles — move them to another category first', old.name;
  end if;
  return old;
end $$;
drop trigger if exists kb_category_delete_guard on public.kb_categories;
create trigger kb_category_delete_guard before delete on public.kb_categories for each row execute function public.kb_category_delete_guard();
