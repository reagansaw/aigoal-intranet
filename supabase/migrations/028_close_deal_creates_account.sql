-- A deal closed AFTER 15 Oct 2026 creates its Purchase Account automatically (once per customer).
alter table public.purchase_accounts add column if not exists source_customer_id uuid references public.customers(id) on delete set null;
create unique index if not exists purchase_accounts_source_customer_uidx on public.purchase_accounts (source_customer_id) where source_customer_id is not null;

create or replace function public.account_from_closed_deal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lead_status = 'close_deal' and old.lead_status is distinct from 'close_deal'
     and new.closed_date > date '2026-10-15'
     and not exists (select 1 from public.purchase_accounts a where a.source_customer_id = new.id
                     or (nullif(new.email, '') is not null and lower(a.email) = lower(new.email))) then
    insert into public.purchase_accounts (account_name, contact_person, phone, email, industry, product, purchase_date,
                                          owner_id, owner_name, sales, closed_by, source_customer_id)
    values (new.name, new.name, new.phone, new.email, new.industry, coalesce(new.deal_product, 'AIGOAL'), new.closed_date,
            new.owner_id, new.owner_name, new.owner_name, new.closed_by_name, new.id);
  end if;
  return new;
end $$;
drop trigger if exists customers_close_creates_account on public.customers;
create trigger customers_close_creates_account after update on public.customers
  for each row execute function public.account_from_closed_deal();
