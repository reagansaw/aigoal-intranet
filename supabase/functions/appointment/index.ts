// Deploy: supabase functions deploy appointment
// Availability + booking for DEMO / Consultation through the public AIGOAL booking page (no API token needed).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const BASE = 'https://appointment-onboarding.aigoal.ai/api/booking'
const SLUG = 'appointment-onboarding'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const q = (o: Record<string, string>) => new URLSearchParams(o).toString()

// Only these services can be booked from the intranet
const kindOf = (name: string) => (/consult/i.test(name) ? 'consultation' : /^demo$/i.test(name.trim()) ? 'demo' : null)

async function options() {
  const r = await (await fetch(`${BASE}/options?${q({ slug: SLUG })}`)).json()
  const o = r.options ?? {}
  const outlet = o.outlets?.[0]?.id ?? ''
  const staffName: Record<string, string> = {}
  ;(o.staff ?? []).forEach((s: any) => (staffName[s.id] = s.name))
  const services = (o.services ?? []).filter((s: any) => kindOf(s.name) && s.bookable)
    .map((s: any) => ({ id: s.id, name: s.name, kind: kindOf(s.name), duration_min: s.duration_min, staff: (s.staff_ids ?? []).map((id: string) => ({ id, name: staffName[id] ?? id })) }))
  return { outlet, services }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: { user } } = await caller.auth.getUser()
  if (!user) return json({ error: 'Not signed in' }, 401)
  const { data: me } = await admin.from('profiles').select('role, active, is_sales').eq('id', user.id).single()
  if (!me?.active || !(me.role === 'admin' || me.is_sales)) return json({ error: 'Only Admin and Sales can book appointments' }, 403)

  const body = await req.json().catch(() => ({}))
  try {
    const opt = await options()
    if (body.action === 'options') return json(opt)

    const svc = opt.services.find((s: any) => s.id === body.service)
    if (!svc) return json({ error: 'That service cannot be booked from here' }, 400)

    if (body.action === 'slots') {
      const r = await (await fetch(`${BASE}/slots?${q({ slug: SLUG, outlet: opt.outlet, service: svc.id, staff: body.staff ?? '', all: '1' })}`)).json()
      return json({ slots: r.slots ?? [] })
    }

    if (body.action === 'book') {
      const { data: c } = await admin.from('customers').select('id, name, phone, owner_id, lead_status').eq('id', body.customer_id).single()
      if (!c) return json({ error: 'Customer not found' }, 404)
      if (me.role !== 'admin' && c.owner_id !== user.id) return json({ error: 'This lead is not assigned to you' }, 403)
      const phone = String(c.phone ?? '').replace(/\D/g, '')
      if (phone.length < 8) return json({ error: 'This customer has no valid phone number' }, 400)
      if (!body.start || !body.staff) return json({ error: 'Pick a person and a time' }, 400)
      const res = await (await fetch(`${BASE}/book`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: SLUG, outlet: opt.outlet, service: svc.id, staff: body.staff, start: body.start, name: c.name, phone, form: {} }),
      })).json().catch(() => ({ ok: false }))
      if (!res?.ok) return json({ error: res?.message || (res?.error === 'slot_taken' ? 'That time was just taken, pick another.' : `Booking failed (${res?.error ?? 'unknown'})`) }, 409)
      if (c.lead_status !== 'close_deal') await admin.from('customers').update({ lead_status: svc.kind === 'consultation' ? 'pending_consultation' : 'pending_demo' }).eq('id', c.id)
      return json({ ok: true, kind: svc.kind, needs_approval: !!res.review })
    }
    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: 'Could not reach the AIGOAL booking page: ' + (e as Error).message }, 502)
  }
})
