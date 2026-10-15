-- Customer block on a purchase account: AI Builder may change ONLY the company name; Admin changes everything.
-- Category is a fixed list.
alter table public.purchase_accounts disable trigger audit_purchase_accounts;
update public.purchase_accounts set category = 'AIGOAL Conversion' where category = 'AIGOAL';
update public.purchase_accounts set category = 'Marketing Services' where category = 'Marketing';
update public.purchase_accounts set category = null where category is not null and category not in ('AIGOAL Conversion', 'Both', 'AI Studio', 'Marketing Services');
alter table public.purchase_accounts enable trigger audit_purchase_accounts;
do $$ begin
  alter table public.purchase_accounts add constraint purchase_accounts_category_chk
    check (category is null or category in ('AIGOAL Conversion', 'Both', 'AI Studio', 'Marketing Services'));
exception when duplicate_object then null; end $$;

create or replace function public.guard_account_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  -- people assignment: Admin only
  new.ai_builder := old.ai_builder; new.ai_builder_2 := old.ai_builder_2; new.closed_by := old.closed_by; new.sales := old.sales; new.builder_ids := old.builder_ids;
  -- customer details: Admin only, except the company name which this account's AI Builder may change
  new.contact_person := old.contact_person; new.phone := old.phone; new.email := old.email;
  new.industry := old.industry; new.category := old.category; new.purchase_date := old.purchase_date;
  if not (auth.uid() = any (old.builder_ids)) then new.account_name := old.account_name; end if;
  -- the "pending on" status only changes through remind_account() / clear_reminder()
  if coalesce(current_setting('app.pending_rpc', true), '') <> '1' then
    new.pending_on_id := old.pending_on_id; new.pending_on_name := old.pending_on_name; new.pending_since := old.pending_since; new.pending_by_name := old.pending_by_name;
  end if;
  return new;
end $$;
