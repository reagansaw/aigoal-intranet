// Deploy: supabase functions deploy sync-onboarding
// Admin-only. Pulls Onboarding appointments from the AIGOAL calendar (app.aigoal.ai /api/calendar/appointments)
// and writes them, read-only, against the matching purchase account (matched by phone, then email).
// The AIGOAL token is passed in the request (it expires in about an hour) or set once as the secret AIGOAL_API_TOKEN.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const TENANT = Deno.env.get('AIGOAL_TENANT_ID') ?? '3784de4c-8ea4-4bf8-acf2-31b06b84f938' // AIgoal.ai

const digits = (v: unknown) => { const d = String(v ?? '').replace(/\D/g, ''); return d.startsWith('0') ? '6' + d : d }
const mail = (v: unknown) => String(v ?? '').trim().toLowerCase()
// Onboarding 1 = "AIGOAL Onboarding", 2 = "AIGOAL 2nd Round Onboarding", 3 = a 3rd-round / final service when it exists
const roundOf = (name: string) => {
  if (!/onboard/i.test(name)) return 0
  if (/(3rd|third|round\s*3|onboarding\s*3|final)/i.test(name)) return 3
  if (/(2nd|second|round\s*2|onboarding\s*2)/i.test(name)) return 2
  return 1
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: { user } } = await caller.auth.getUser()
  if (!user) return json({ error: 'Not signed in' }, 401)
  const { data: me } = await admin.from('profiles').select('role, active').eq('id', user.id).single()
  if (!me?.active || me.role !== 'admin') return json({ error: 'Only Admin can sync the AIGOAL calendar' }, 403)

  const body = await req.json().catch(() => ({}))
  const token = (body.token ?? Deno.env.get('AIGOAL_API_TOKEN') ?? '').trim()
  if (!token) return json({ error: 'Paste an AIGOAL API token first' }, 400)

  const from = body.from ?? '2026-01-01'
  const to = body.to ?? new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10)
  const res = await fetch(`https://app.aigoal.ai/api/calendar/appointments?from=${from}&to=${to}`, {
    headers: { Authorization: `Bearer ${token}`, 'x-impersonate-tenant': TENANT },
  })
  if (res.status === 401) return json({ error: 'AIGOAL rejected the token (expired?). Get a fresh one and try again.' }, 400)
  if (!res.ok) return json({ error: `AIGOAL returned ${res.status}` }, 502)
  const appts: any[] = (await res.json()).appointments ?? []

  const { data: accounts } = await admin.from('purchase_accounts').select('id, account_name, phone, email')
  const byPhone = new Map<string, any>(); const byMail = new Map<string, any>()
  for (const a of accounts ?? []) { if (a.phone) byPhone.set(digits(a.phone), a); if (a.email && a.email !== '?') byMail.set(mail(a.email), a) }

  const rows: any[] = []; const unmatched: string[] = []; let onboarding = 0
  for (const x of appts) {
    const svc = x.service || x.title || ''; const round = roundOf(svc)
    if (!round) continue
    onboarding++
    const acc = byPhone.get(digits(x.customer_phone)) ?? byMail.get(mail(x.customer_email))
    if (!acc) { unmatched.push(`${x.customer ?? '?'} (${svc})`); continue }
    rows.push({ appointment_id: x.id, account_id: acc.id, round, service: svc, start_at: x.start, end_at: x.end ?? null, status: x.status ?? null,
      host: x.staff ?? null, zoom_url: x.zoom?.join_url ?? null, customer_name: x.customer ?? null, synced_at: new Date().toISOString() })
  }
  if (rows.length) { const { error } = await admin.from('onboarding_sessions').upsert(rows, { onConflict: 'appointment_id' }); if (error) return json({ error: error.message }, 500) }
  // drop sessions in this window that no longer exist in the calendar (rescheduled / deleted)
  const keep = new Set(rows.map((r) => r.appointment_id))
  const { data: existing } = await admin.from('onboarding_sessions').select('id, appointment_id').gte('start_at', from).lte('start_at', to + 'T23:59:59Z')
  const stale = (existing ?? []).filter((e) => !keep.has(e.appointment_id)).map((e) => e.id)
  if (stale.length) await admin.from('onboarding_sessions').delete().in('id', stale)

  return json({ ok: true, appointments_seen: appts.length, onboarding_found: onboarding, synced: rows.length, removed: stale.length, unmatched })
})
