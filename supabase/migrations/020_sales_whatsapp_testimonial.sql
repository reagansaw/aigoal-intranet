-- 1) "Sales" and "Assigned sales" are one thing: the assigned sales person (owner). Keep the old column mirrored.
create or replace function public.sync_sales_with_owner() returns trigger language plpgsql as $$
begin new.sales := new.owner_name; return new; end $$;
drop trigger if exists zz_sync_sales on public.purchase_accounts;
create trigger zz_sync_sales before insert or update on public.purchase_accounts for each row execute function public.sync_sales_with_owner();

-- 2) Testimonial counts as received ONLY when a Google Drive video link is saved.
alter table public.purchase_accounts add column if not exists testimonial_url text;
create or replace function public.sync_testimonial() returns trigger language plpgsql as $$
begin
  new.testimonial_url := nullif(trim(coalesce(new.testimonial_url, '')), '');
  new.testimonial := new.testimonial_url is not null;
  return new;
end $$;
drop trigger if exists zz_sync_testimonial on public.purchase_accounts;
create trigger zz_sync_testimonial before insert or update on public.purchase_accounts for each row execute function public.sync_testimonial();
do $$ begin
  alter table public.purchase_accounts add constraint purchase_accounts_testimonial_drive_chk
    check (testimonial_url is null or testimonial_url ~* '^https://(drive|docs)\.google\.com/');
exception when duplicate_object then null; end $$;

alter table public.purchase_accounts disable trigger audit_purchase_accounts;
update public.purchase_accounts set sales = owner_name where sales is distinct from owner_name;
alter table public.purchase_accounts enable trigger audit_purchase_accounts;
