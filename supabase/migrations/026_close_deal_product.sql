-- Close Deal records which product was closed and when; "Won" is written back to the AIGOAL customer list.
alter table public.customers
  add column if not exists deal_product text,
  add column if not exists deal_amount numeric,
  add column if not exists aigoal_won_at timestamptz,
  add column if not exists aigoal_won_error text;

create or replace function public.guard_customer_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  new.updated_at := now();
  select nullif(full_name, '') into who from public.profiles where id = auth.uid();
  if new.lead_status is distinct from old.lead_status or new.status_remark is distinct from old.status_remark then
    new.status_updated_at := now(); new.status_updated_by := coalesce(who, 'System');
    if new.lead_status is null or new.lead_status not in ('pending_management', 'potential') then new.status_remark := null; end if;
  end if;
  if new.lead_status is distinct from old.lead_status then
    if new.lead_status is distinct from 'pending_demo' then new.demo_by_id := null; new.demo_by_name := null; new.demo_date := null; new.demo_time := null; end if;
    if new.lead_status is distinct from 'invite_webinar' then new.webinar_invite_date := null; end if;
    if new.lead_status = 'close_deal' then
      new.closed_by_id := auth.uid(); new.closed_by_name := coalesce(who, 'System'); new.closed_at := now();
      if auth.uid() is not null and nullif(trim(coalesce(new.deal_product, '')), '') is null then
        raise exception 'Choose the product that was closed';
      end if;
      -- the sales person picks the close date (defaults to today); the product is picked in the same step
      new.closed_date := coalesce(case when new.closed_date is distinct from old.closed_date then new.closed_date end,
                                  (now() at time zone 'Asia/Kuala_Lumpur')::date);
      new.aigoal_won_at := null; new.aigoal_won_error := null;
    elsif old.lead_status = 'close_deal' then
      new.closed_by_id := null; new.closed_by_name := null; new.closed_at := null; new.closed_date := null;
      new.deal_product := null; new.deal_amount := null; new.aigoal_won_at := null; new.aigoal_won_error := null;
    end if;
  else
    new.closed_by_id := old.closed_by_id; new.closed_by_name := old.closed_by_name; new.closed_at := old.closed_at; new.closed_date := old.closed_date;
    new.deal_product := old.deal_product; new.deal_amount := old.deal_amount;
    if auth.uid() is not null then new.aigoal_won_at := old.aigoal_won_at; new.aigoal_won_error := old.aigoal_won_error; end if;
  end if;
  if auth.uid() is not null and not public.is_admin() then
    new.owner_id := old.owner_id; new.owner_name := old.owner_name;
    new.priority := old.priority; new.batch := old.batch;
    new.name := old.name; new.phone := old.phone; new.email := old.email;
    new.aigoal_contact_id := old.aigoal_contact_id; new.aigoal_tags := old.aigoal_tags; new.aigoal_status := old.aigoal_status;
    new.purchased := old.purchased; new.aigoal_synced_at := old.aigoal_synced_at;
  end if;
  return new;
end $$;
