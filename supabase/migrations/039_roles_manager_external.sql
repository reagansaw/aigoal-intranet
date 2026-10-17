-- Roles: Manager (edits Follow-Up Customers and Purchase Accounts like Admin) and External (sees only their own accounts and leads).
-- (the enum values 'manager' and 'external' were added to type user_role before this file)
create or replace function public.can_manage_crm() returns boolean language sql stable as $$ select coalesce(public.current_role_name() in ('admin', 'manager'), false) $$;
create or replace function public.is_external() returns boolean language sql stable as $$ select coalesce(public.current_role_name() = 'external', false) $$;

-- CRM rules that said 'Admin' now mean 'Admin or Manager'
CREATE OR REPLACE FUNCTION public.clear_reminder(account_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a public.purchase_accounts; me text;
begin
  select * into a from public.purchase_accounts where id = account_id;
  if not found then raise exception 'Account not found'; end if;
  if public.current_role_name() is null or not (public.can_manage_crm() or a.pending_on_id = auth.uid() or auth.uid() = any (a.builder_ids)) then raise exception 'Only the person it is waiting on, an AI Builder or Admin can clear this'; end if;
  if a.pending_on_id is null then return; end if;
  select coalesce(nullif(full_name, ''), 'Someone') into me from public.profiles where id = auth.uid();
  perform set_config('app.pending_rpc', '1', true);
  update public.purchase_accounts set pending_on_id = null, pending_on_name = null, pending_since = null, pending_by_name = null where id = account_id;
  insert into public.account_notes (account_id, kind, body, author_id, author_name)
  values (account_id, 'reminder', a.pending_on_name || ' is done (marked by ' || me || ')', auth.uid(), me);
end $function$;
CREATE OR REPLACE FUNCTION public.guard_account_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or public.can_manage_crm() then return new; end if;
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
end $function$;
CREATE OR REPLACE FUNCTION public.guard_account_frozen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null and not public.can_manage_crm() then
    new.frozen := old.frozen; new.frozen_reason := old.frozen_reason; new.frozen_at := old.frozen_at; new.frozen_by_name := old.frozen_by_name;
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.guard_customer_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if auth.uid() is not null and not public.can_manage_crm() then
    new.owner_id := old.owner_id; new.owner_name := old.owner_name;
    new.priority := old.priority; new.batch := old.batch;
    new.name := old.name; new.phone := old.phone; new.email := old.email;
    new.aigoal_contact_id := old.aigoal_contact_id; new.aigoal_tags := old.aigoal_tags; new.aigoal_status := old.aigoal_status;
    new.purchased := old.purchased; new.aigoal_synced_at := old.aigoal_synced_at;
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.remind_account(account_id uuid, person_id uuid, note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a public.purchase_accounts; me text; target text;
begin
  select * into a from public.purchase_accounts where id = account_id;
  if not found then raise exception 'Account not found'; end if;
  if public.current_role_name() is null then raise exception 'Not allowed'; end if;
  select full_name into target from public.profiles where id = person_id and active;
  if target is null then raise exception 'That person has no active login'; end if;
  select coalesce(nullif(full_name, ''), 'Someone') into me from public.profiles where id = auth.uid();
  perform set_config('app.pending_rpc', '1', true);
  update public.purchase_accounts set pending_on_id = person_id, pending_on_name = target, pending_since = now(), pending_by_name = me where id = account_id;
  insert into public.account_notes (account_id, kind, body, author_id, author_name)
  values (account_id, 'reminder', 'Reminder sent to ' || target || coalesce(': ' || nullif(trim(note), ''), ''), auth.uid(), me);
end $function$;
CREATE OR REPLACE FUNCTION public.set_account_frozen(account_id uuid, do_freeze boolean, reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me text;
begin
  if not public.can_manage_crm() then raise exception 'Only Admin or Manager can freeze an account'; end if;
  if do_freeze and nullif(trim(coalesce(reason, '')), '') is null then raise exception 'Say why the account is frozen'; end if;
  select coalesce(nullif(full_name, ''), 'Admin') into me from public.profiles where id = auth.uid();
  update public.purchase_accounts set frozen = do_freeze, frozen_reason = case when do_freeze then trim(reason) end,
    frozen_at = case when do_freeze then now() end, frozen_by_name = case when do_freeze then me end where id = account_id;
  insert into public.account_notes (account_id, kind, body, author_id, author_name)
  values (account_id, 'remark', case when do_freeze then 'Account frozen: ' || trim(reason) else 'Account unfrozen' end, auth.uid(), me);
end $function$;
CREATE OR REPLACE FUNCTION public.set_develop(account_id uuid, action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a public.purchase_accounts;
begin
  select * into a from public.purchase_accounts where id = account_id;
  if not found then raise exception 'Account not found'; end if;
  if not (public.can_manage_crm() or (public.current_role_name() is not null and auth.uid() = any (a.builder_ids))) then raise exception 'Only the AI Builder can do this'; end if;
  perform set_config('app.develop_rpc', '1', true);
  if action = 'start' then
    if a.develop_started_at is not null then return; end if;
    update public.purchase_accounts set develop_started_at = now(), develop_started_by = auth.uid() where id = account_id;
  elsif action = 'done' then
    if a.develop_started_at is null then raise exception 'Click Develop first'; end if;
    if a.develop_done_at is not null then return; end if;
    update public.purchase_accounts set develop_done_at = now(), develop_done_by = auth.uid() where id = account_id;
  elsif action = 'reset' then
    if not public.can_manage_crm() then raise exception 'Only Admin or Manager can undo a develop step'; end if;
    update public.purchase_accounts set develop_started_at = null, develop_started_by = null, develop_done_at = null, develop_done_by = null where id = account_id;
  else raise exception 'Unknown action'; end if;
end $function$;

drop policy if exists "customers admin all" on public.customers;
create policy "customers admin all" on public.customers for all to authenticated using (public.can_manage_crm()) with check (public.can_manage_crm());
drop policy if exists "accounts admin all" on public.purchase_accounts;
create policy "accounts admin all" on public.purchase_accounts for all to authenticated using (public.can_manage_crm()) with check (public.can_manage_crm());
drop policy if exists "notes update" on public.account_notes;
create policy "notes update" on public.account_notes for update to authenticated
  using (public.can_manage_crm() or exists (select 1 from public.purchase_accounts p where p.id = account_id and auth.uid() = any (p.builder_ids)));

-- External: only the purchase accounts they own / build / are reminded on (everyone else still sees the whole list)
drop policy if exists "accounts read all" on public.purchase_accounts;
create policy "accounts read all" on public.purchase_accounts for select to authenticated
  using (public.current_role_name() is not null and (not public.is_external() or owner_id = auth.uid() or auth.uid() = any (builder_ids) or pending_on_id = auth.uid()));
-- External never gets "view all leads", whatever the flag says
create or replace function public.can_view_all_leads() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.can_view_all_leads and p.active and p.role <> 'external' from public.profiles p where p.id = auth.uid()), false)
$$;

-- To-Do: a task that is overdue or carries a delay record cannot be deleted by its owner (Admin / HR only)
create or replace function public.todo_delete_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin_or_hr()
     and (old.delayed_days > 0 or (old.due_date is not null and old.due_date < (now() at time zone 'Asia/Kuala_Lumpur')::date and not old.done)) then
    raise exception 'This task is overdue or was delayed, so it cannot be deleted. Finish it or move it to a later day.';
  end if;
  return old;
end $$;
drop trigger if exists todo_delete_guard on public.todos;
create trigger todo_delete_guard before delete on public.todos for each row execute function public.todo_delete_guard();

