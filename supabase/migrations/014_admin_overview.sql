-- "Last seen" so Admin can see who is active.
alter table public.profiles add column if not exists last_seen_at timestamptz;
create or replace function public.touch_seen() returns void
language sql security definer set search_path = public as $$
  update public.profiles set last_seen_at = now() where id = auth.uid() and (last_seen_at is null or last_seen_at < now() - interval '2 minutes')
$$;
revoke all on function public.touch_seen() from public, anon;
grant execute on function public.touch_seen() to authenticated;

-- Admin dashboard: what needs doing + every staff member's status, in one call (Admin only).
create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Kuala_Lumpur')::date; res jsonb;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  select jsonb_build_object(
    'staff', (select coalesce(jsonb_agg(to_jsonb(s) order by s.name), '[]'::jsonb) from (
      select p.id, p.full_name as name, p.title, p.role, p.last_seen_at, p.must_change_password,
        (select t.type from public.time_off_requests t where t.user_id = p.id and t.status = 'approved' and today between t.start_date and t.end_date limit 1) as away_today,
        (select f.remaining from public.leave_figures(p.id, extract(year from today)::int) f) as leave_remaining,
        (select count(*) from public.todos d where d.user_id = p.id and d.due_date = today) as todos_today,
        (select count(*) from public.todos d where d.user_id = p.id and d.due_date = today and d.done) as todos_done,
        (select count(*) from public.todos d where d.user_id = p.id and d.due_date < today and not d.done) as todos_overdue,
        (select count(*) from public.todos d where d.user_id = p.id and d.due_date is null and not d.done) as todos_unscheduled,
        (select count(*) from public.meeting_tasks m where m.assignee_id = p.id and m.status = 'open' and m.deadline < today) as meeting_overdue,
        (select count(*) from public.purchase_accounts a where a.owner_id = p.id) as accounts,
        (select count(*) from public.purchase_accounts a where a.pending_on_id = p.id) as accounts_waiting_on,
        (select count(*) from public.account_notes n join public.purchase_accounts a on a.id = n.account_id where a.owner_id = p.id and n.kind = 'issue' and not n.resolved) as open_issues,
        (select count(*) from public.customers c where c.owner_id = p.id and (c.batch_date is null or c.batch_date < today)) as leads,
        (select count(*) from public.customers c where c.owner_id = p.id and c.lead_status = 'pending_management' and (c.batch_date is null or c.batch_date < today)) as leads_pending_mgmt,
        (select count(*) from public.customers c where c.owner_id = p.id and c.lead_status = 'pending_demo' and (c.batch_date is null or c.batch_date < today)) as leads_pending_demo,
        (select count(*) from public.customers c where c.owner_id = p.id and c.lead_status = 'invite_webinar' and (c.batch_date is null or c.batch_date < today)) as leads_invite_webinar
      from public.profiles p where p.active) s),
    'leave_pending', (select count(*) from public.time_off_requests where status = 'pending'),
    'password_not_set', (select count(*) from public.profiles where active and must_change_password),
    'unassigned_accounts', (select count(*) from public.purchase_accounts where owner_id is null),
    'unassigned_leads', (select count(*) from public.customers c where c.owner_id is null and (c.batch_date is null or c.batch_date < today)),
    'open_issues', (select count(*) from public.account_notes where kind = 'issue' and not resolved),
    'overdue_followups', (select count(*) from (select distinct on (account_id) account_id, deadline from public.account_notes where next_action is not null order by account_id, created_at desc) x where x.deadline < today),
    'meeting_overdue', (select count(*) from public.meeting_tasks where status = 'open' and deadline < today),
    'leads_pending_mgmt', (select count(*) from public.customers c where c.lead_status = 'pending_management' and (c.batch_date is null or c.batch_date < today)),
    'leads_pending_demo', (select count(*) from public.customers c where c.lead_status = 'pending_demo' and (c.batch_date is null or c.batch_date < today)),
    'leads_invite_webinar', (select count(*) from public.customers c where c.lead_status = 'invite_webinar' and (c.batch_date is null or c.batch_date < today)),
    'pending_mgmt_list', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) from (
      select c.id, c.name, c.owner_name, c.status_remark, c.status_updated_by, c.status_updated_at from public.customers c where c.lead_status = 'pending_management' order by c.status_updated_at desc nulls last limit 8) l),
    'accounts_pending_on', (select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) from (
      select pending_on_name as name, count(*) as n from public.purchase_accounts where pending_on_id is not null group by 1 order by 2 desc) g),
    'upcoming_onboarding', (select coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb) from (
      select a.account_name, s.round, s.start_at, s.host, s.status from public.onboarding_sessions s join public.purchase_accounts a on a.id = s.account_id
       where s.start_at between now() - interval '1 day' and now() + interval '7 days' and s.status is distinct from 'completed' order by s.start_at limit 8) u)
  ) into res;
  return res;
end $$;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
