export type Role = 'admin' | 'hr' | 'staff'

export interface Profile {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  title: string | null
  gender: string | null
  employment_type: string | null
  start_date: string | null
  end_date: string | null
  role: Role
  active: boolean
  must_change_password: boolean
  leave_entitlement: number
  is_sales: boolean
  is_ai_builder: boolean
  can_view_all_leads: boolean
}

export interface Todo {
  id: string
  user_id: string
  title: string
  notes: string | null
  due_date: string | null
  duration_min: number | null
  priority: 'low' | 'normal' | 'high'
  done: boolean
  deadline: string | null
  source: string | null
  meeting_task_id: string | null
}

export interface Meeting {
  id: string
  title: string
  meeting_date: string
  minute_taker_id: string | null
  attendee_ids: string[]
  discussion: string | null
  created_by: string | null
}

export interface MeetingTask {
  id: string
  meeting_id: string
  sort: number
  title: string
  assignee_id: string | null
  deadline: string | null
  status: 'open' | 'done'
  todo_id: string | null
  remarks: string | null
  member_ids: string[]
}

export interface Band { threshold: number; points: number }

export interface KpiTemplate {
  id: string
  name: string
  description: string | null
  base_fee: number
  currency: string
  rate_per_point: number
  max_base_bonus: number | null
  qualify_score: number
  commission_rate: number
  commission_free_deals: number
  active: boolean
  checklist: { item: string; requirement: string; evidence: string }[]
  indicators: string[]
  daily_tasks: string[]
  max_over_bonus: number | null
}

export interface KpiItem {
  id: string
  template_id: string
  sort: number
  name: string
  standard: string | null
  max_points: number
  target: number | null
  unit: string | null
  direction: 'higher' | 'lower' | 'manual'
  pct_of_target: boolean
  bands: Band[]
  bonus_threshold_pct: number | null
  bonus_amount: number | null
  note: string | null
  source: 'manual' | 'attendance' | 'leadmagnet' | 'cpl' | 'checklist'
  bonus_needs_budget: boolean
}

export interface KpiReview {
  id: string
  user_id: string
  template_id: string
  month: string
  deals_count: number
  net_collected: number
  summary: string | null
  locked: boolean
  extra_note: string | null
  indicators: { indicator: string; reason: string; improvement: string }[]
  daily: { label: string; days: boolean[] }[]
}

export interface KpiScore {
  review_id: string
  item_id: string
  actual: number | null
  score: number | null
  reason: string | null
  improvement: string | null
}

export interface Customer {
  id: string
  owner_id: string | null
  owner_name: string | null
  batch: string | null
  priority: 'P1' | 'P2' | 'P3' | 'P4'
  name: string
  phone: string | null
  email: string | null
  industry: string | null
  repeat_from: string | null
  called: boolean
  not_available: boolean
  not_interested_reason: string | null
  team_size: string | null
  monthly_revenue: string | null
  daily_leads: boolean | null
  leads_per_day: string | null
  reply_method: string | null
  missed_leads: string | null
  channels: string[]
  other_courses: string | null
  result: string | null
  closed_date: string | null
  prospect: boolean
  notes: string | null
  aigoal_contact_id: string | null
  aigoal_tags: string[]
  aigoal_status: string | null
  purchased: boolean
  batch_date: string | null
  lead_status: 'pending_management' | 'pending_demo' | 'pending_consultation' | 'invite_webinar' | 'potential' | 'close_deal' | null
  status_remark: string | null
  closed_by_name: string | null
  deal_product: string | null
  deal_amount: number | null
  aigoal_won_at: string | null
  aigoal_won_error: string | null
  closed_at: string | null
  demo_by_id: string | null
  demo_by_name: string | null
  demo_date: string | null
  demo_time: string | null
  webinar_invite_date: string | null
}

export interface PurchaseAccount {
  id: string
  frozen: boolean
  frozen_reason: string | null
  frozen_at: string | null
  frozen_by_name: string | null
  builder_ids: string[]
  pending_on_id: string | null
  pending_on_name: string | null
  pending_since: string | null
  pending_by_name: string | null
  develop_started_at: string | null
  develop_done_at: string | null
  owner_id: string | null
  owner_name: string | null
  product: string
  account_name: string
  testimonial: boolean
  testimonial_url: string | null
  purchase_date: string | null
  contact_person: string | null
  phone: string | null
  email: string | null
  industry: string | null
  category: string | null
  remarks: string | null
  issues: string | null
  action_plan: string | null
  deadline: string | null
  closed_by: string | null
  sales: string | null
  onboarding_stage: string | null
  in_use: string | null
  ai_builder: string | null
  ai_builder_2: string | null
  whatsapp_group: string | null
  opened_by: string | null
  coaching_1: string | null
  docs_provided: string | null
  chatbot_done: string | null
  landing_page_done: string | null
  coaching_2: string | null
  optimised: string | null
  final_coaching: string | null
  maintenance: string | null
}

export interface KbArticle {
  id: string
  category: string
  title: string
  body: string | null
  url: string | null
  pinned: boolean
}

export interface Holiday { id: string; holiday_date: string; name: string; region: string; active: boolean }
export interface TimeOff {
  id: string
  user_id: string
  type: 'leave' | 'travel'
  start_date: string
  end_date: string
  half_day: boolean
  days: number
  reason: string | null
  destination: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  decision_note: string | null
  created_at: string
}
export interface CalendarOff { id: string; user_id: string; full_name: string; type: 'leave' | 'travel'; start_date: string; end_date: string; half_day: boolean; days: number; destination: string | null }
export interface LeaveFigures { entitlement: number; used: number; pending: number; remaining: number }

export interface OnboardingSession {
  id: string
  appointment_id: string
  account_id: string
  round: 1 | 2 | 3
  service: string | null
  start_at: string
  end_at: string | null
  status: string | null
  host: string | null
  zoom_url: string | null
  customer_name: string | null
}

export interface AccountNote {
  id: string
  account_id: string
  kind: 'followup' | 'issue' | 'remark' | 'reminder' | 'call'
  body: string
  next_action: string | null
  deadline: string | null
  resolved: boolean
  resolved_by_name: string | null
  resolved_at: string | null
  author_name: string
  created_at: string
}

export interface KpiWeekly {
  id: string; review_id: string; sort: number; week_date: string | null
  ad_budget: number | null; attendance_target: number | null; leadmagnet_target: number | null
  attendance_actual: number | null; leadmagnet_actual: number | null; ad_spend: number | null; leads_total: number | null
}
export interface KpiChecklistRow { id: string; review_id: string; sort: number; item: string; requirement: string | null; status: '完成' | '未完成' | '不适用' | null; evidence: string | null }
export interface KpiOrder { id: string; review_id: string; sort: number; customer_ref: string | null; source_webinar: string | null; first_payment_date: string | null; net_received: number; is_commission_order: boolean }

export interface DemoBooking { id: string; appointment_id: string; customer_id: string; staff_name: string | null; staff_id: string | null; start_at: string; end_at: string | null; status: string | null; zoom_url: string | null; kind: 'demo' | 'consultation' }
