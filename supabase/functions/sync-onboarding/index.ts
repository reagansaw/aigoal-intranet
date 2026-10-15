// Deploy: supabase functions deploy sync-onboarding
// Admin-only. Pulls DEMO bookings too (matched to leads) and Onboarding appointments from the AIGOAL calendar (app.aigoal.ai /api/calendar/appointments)
// and writes them, read-only, against the matching purchase account (matched by phone, then email).
// The AIGOAL token is passed in the request (it expires in about an hour) or set once as the secret AIGOAL_API_TOKEN.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const TENANT = (Deno.env.get('AIGOAL_TENANT') || Deno.env.get('AIGOAL_TENANT_ID')) ?? '3784de4c-8ea4-4bf8-acf2-31b06b84f938' // AIgoal.ai

const digits = (v: unknown) => { const d = String(v ?? '').replace(/\D/g, ''); return d.startsWith('0') ? '6' + d : d }
const mail = (v: unknown) => String(v ?? '').trim().toLowerCase()
// Onboarding 1 = "AIGOAL Onboarding", 2 = "AIGOAL 2nd Round Onboarding", 3 = a 3rd-round / final service when it exists
const roundOf = (name: string) => {
  if (!/onboard/i.test(name)) return 0
  if (/(3rd|third|round\s*3|onboarding\s*3|final)/i.test(name)) return 3
  if (/(2nd|second|round\s*2|onboarding\s*2)/i.test(name)) return 2
  return 1
}

async function handle(req: Request, cron: boolean): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  if (!cron) {
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
    const { data: { user } } = await caller.auth.getUser()
    if (!user) return json({ error: 'Not signed in' }, 401)
    const { data: me } = await admin.from('profiles').select('role, active').eq('id', user.id).single()
    if (!me?.active || me.role !== 'admin') return json({ error: 'Only Admin can sync the AIGOAL calendar' }, 403)
  }

  const body = await req.json().catch(() => ({}))
  if (body.check) return json({ has_key: !!(Deno.env.get('AIGOAL_TOKEN') || Deno.env.get('AIGOAL_API_TOKEN')) })   // lets the app hide the token box when a permanent key is stored
  const token = (body.token ?? (Deno.env.get('AIGOAL_TOKEN') || Deno.env.get('AIGOAL_API_TOKEN')) ?? '').trim()
  if (!token) return json({ error: cron ? 'No permanent AIGOAL key is stored yet (set the AIGOAL_API_TOKEN secret)' : 'Paste an AIGOAL API token first' }, 400)

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

  // ── DEMO bookings -> leads (matched by phone, then email) ──
  const leads: any[] = []
  for (let from0 = 0; ; from0 += 1000) {
    const { data } = await admin.from('customers').select('id, phone, email, lead_status').range(from0, from0 + 999)
    leads.push(...(data ?? [])); if (!data || data.length < 1000) break
  }
  const lByPhone = new Map<string, any[]>(); const lByMail = new Map<string, any[]>()
  for (const l of leads) {
    if (l.phone) { const k = digits(l.phone); (lByPhone.get(k) ?? lByPhone.set(k, []).get(k)!).push(l) }
    if (l.email) { const k = mail(l.email); (lByMail.get(k) ?? lByMail.set(k, []).get(k)!).push(l) }
  }
  const { data: profs } = await admin.from('profiles').select('id, full_name').eq('active', true)
  const staffId = (n: string) => { const a = (n ?? '').toLowerCase().trim(); if (!a) return null
    return (profs ?? []).find((p: any) => { const b = String(p.full_name).toLowerCase().trim(); return b && (a === b || a.startsWith(b + ' ') || b.startsWith(a + ' ')) })?.id ?? null }
  const demoRows: any[] = []; const demoUnmatched: string[] = []; let demosFound = 0; const toPending = new Map<string, string>()
  for (const x of appts) {
    const svc = x.service || x.title || ''
    if (roundOf(svc)) continue
    const kind = /consult/i.test(svc) ? 'consultation' : /demo/i.test(svc) ? 'demo' : null
    if (!kind) continue
    demosFound++
    const hit = lByPhone.get(digits(x.customer_phone)) ?? lByMail.get(mail(x.customer_email))
    if (!hit?.length) { demoUnmatched.push(`${x.customer ?? '?'} (${String(x.start).slice(0, 10)})`); continue }
    for (const l of hit) {
      demoRows.push({ kind, appointment_id: x.id, customer_id: l.id, staff_name: x.staff ?? null, staff_id: staffId(x.staff), start_at: x.start, end_at: x.end ?? null,
        status: x.status ?? null, zoom_url: x.zoom?.join_url ?? null, customer_name: x.customer ?? null, synced_at: new Date().toISOString() })
      if (!l.lead_status && new Date(x.start).getTime() >= Date.now() - 3600e3 && !['completed', 'cancelled'].includes(x.status)) toPending.set(l.id, kind === 'demo' ? 'pending_demo' : 'pending_consultation')
    }
  }
  if (demoRows.length) { const { error } = await admin.from('demo_bookings').upsert(demoRows, { onConflict: 'appointment_id,customer_id' }); if (error) return json({ error: error.message }, 500) }
  const keepD = new Set(demoRows.map((r) => r.appointment_id + '|' + r.customer_id))
  const { data: oldD } = await admin.from('demo_bookings').select('id, appointment_id, customer_id').gte('start_at', from).lte('start_at', to + 'T23:59:59Z')
  const staleD = (oldD ?? []).filter((e: any) => !keepD.has(e.appointment_id + '|' + e.customer_id)).map((e: any) => e.id)
  if (staleD.length) await admin.from('demo_bookings').delete().in('id', staleD)
  for (const st of ['pending_demo', 'pending_consultation']) {
    const ids = [...toPending].filter(([, v]) => v === st).map(([k]) => k)
    if (ids.length) await admin.from('customers').update({ lead_status: st }).in('id', ids)
  }

  return json({ ok: true, appointments_seen: appts.length, onboarding_found: onboarding, synced: rows.length, removed: stale.length, unmatched,
    demos_found: demosFound, demos_synced: demoRows.length, demos_unmatched: demoUnmatched, set_pending_demo: toPending.size })
}

// Runs from the admin screen (signed-in Admin) or on a schedule (shared secret); every run is logged for the dashboard.
Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')
  const cron = !!secret && req.headers.get('x-cron-secret') === secret
  const res = await handle(req, cron)
  if (req.method !== 'OPTIONS') {
    const out = await res.clone().json().catch(() => ({}))
    if (!out.has_key && (cron || out.ok || out.error)) {
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      await admin.from('sync_log').insert({ source: cron ? 'schedule' : 'manual', ok: !!out.ok, error: out.error ?? null,
        onboarding: out.synced ?? null, bookings: out.demos_synced ?? null })
    }
  }
  return res
})
