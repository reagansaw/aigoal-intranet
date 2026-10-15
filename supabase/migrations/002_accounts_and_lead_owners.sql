-- Purchase account list now mirrors the "AIGOAL" customer tab of the GHL Subscription Report
alter table public.purchase_accounts
  add column if not exists testimonial boolean not null default false,
  add column if not exists contact_person text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists category text,
  add column if not exists remarks text,
  add column if not exists issues text,
  add column if not exists action_plan text,
  add column if not exists deadline date,
  add column if not exists closed_by text,          -- 成交 (Webinar / person)
  add column if not exists sales text,
  add column if not exists onboarding_stage text,
  add column if not exists in_use text,             -- Y / N / P / ?
  add column if not exists ai_builder text,
  add column if not exists ai_builder_2 text,
  add column if not exists whatsapp_group text,
  add column if not exists opened_by text,          -- 开户
  add column if not exists coaching_1 text,
  add column if not exists docs_provided text,      -- 资料提供
  add column if not exists chatbot_done text,
  add column if not exists landing_page_done text,
  add column if not exists coaching_2 text,
  add column if not exists optimised text,          -- 优化完成
  add column if not exists final_coaching text,
  add column if not exists maintenance text;

-- Leads keep the sales person's name even before that person has an intranet login.
alter table public.customers add column if not exists owner_name text;

create or replace function public.link_customer_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is null and new.owner_name is not null then
    select id into new.owner_id from public.profiles
     where lower(full_name) = lower(new.owner_name) or lower(full_name) like lower(new.owner_name) || ' %'
     order by active desc limit 1;
  end if;
  return new;
end $$;
drop trigger if exists link_customer_owner on public.customers;
create trigger link_customer_owner before insert or update of owner_name, owner_id on public.customers
  for each row execute function public.link_customer_owner();

-- When a staff profile is created/renamed, claim the leads waiting under their name.
create or replace function public.link_owner_on_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.full_name, '') <> '' then
    update public.customers set owner_id = new.id
     where owner_id is null and owner_name is not null
       and (lower(new.full_name) = lower(owner_name) or lower(new.full_name) like lower(owner_name) || ' %');
  end if;
  return new;
end $$;
drop trigger if exists link_owner_on_profile on public.profiles;
create trigger link_owner_on_profile after insert or update of full_name on public.profiles
  for each row execute function public.link_owner_on_profile();
