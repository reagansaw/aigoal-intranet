export interface AuditEntry {
  id: number
  table_name: string
  record_id: string
  record_label: string | null
  action: 'insert' | 'update' | 'delete'
  field: string | null
  old_value: string | null
  new_value: string | null
  changed_by: string | null
  changed_by_name: string
  changed_at: string
}

export const FIELD_LABELS: Record<string, string> = {
  account_name: 'System / company', contact_person: 'Name', phone: 'Phone', email: 'Email', industry: 'Industry', category: 'Category',
  purchase_date: 'Purchase date', closed_by: 'Closed via', sales: 'Sales', onboarding_stage: 'Onboarding stage', in_use: 'In use',
  ai_builder: 'AI builder', ai_builder_2: 'AI builder 2', whatsapp_group: 'WhatsApp group', testimonial: 'Testimonial',
  remarks: 'Remarks', issues: 'Issues', action_plan: 'Next action', deadline: 'Deadline', opened_by: 'Account opened by',
  coaching_1: 'Coaching 1', docs_provided: 'Docs provided', chatbot_done: 'Chat bot done', landing_page_done: 'Landing page done',
  coaching_2: 'Coaching 2', optimised: 'Optimised', final_coaching: 'Final coaching', maintenance: 'Maintenance', product: 'Product',
  owner_name: 'Assigned to', batch: 'Webinar', priority: 'Priority', name: 'Name', repeat_from: 'Repeated from', called: 'Called', not_available: 'Not available',
  not_interested_reason: 'Not interested: reason', team_size: 'Team size', monthly_revenue: 'Monthly revenue', daily_leads: 'Daily leads', leads_per_day: 'Leads per day',
  reply_method: 'How they reply', missed_leads: 'Missed leads', channels: 'Lead channels', other_courses: 'Other courses', result: 'Follow-up result',
  closed_date: 'Closed date', prospect: 'Prospect', notes: 'Notes', purchased: 'Purchased', aigoal_status: 'App status', aigoal_tags: 'App tags', aigoal_contact_id: 'App contact',
  develop_started_at: 'Develop started', develop_done_at: 'Develop done',
  lead_status: 'Status', status_remark: 'Status remark',
  status: 'Status', new_status: 'New status', owner_user: 'User', expiry_date: 'Expiry date', followup_notes: 'Follow-up notes',
}
export const fieldLabel = (f: string | null) => (f ? FIELD_LABELS[f] ?? f : '')

export const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export const STATUS_LABELS: Record<string, string> = { pending_management: 'Pending Management', pending_demo: 'Pending Demo', invite_webinar: 'Invite Webinar' }
export const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 2) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 1440) return `${Math.round(m / 60)} h ago`
  if (m < 1440 * 14) return `${Math.round(m / 1440)} d ago`
  return when(iso)
}
