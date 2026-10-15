// Deploy: supabase functions deploy voice-update   (needs the secret ANTHROPIC_API_KEY)
// Turns a spoken/typed update ("Call Tan Ah Meng, interested, follow up Friday") into a structured proposal and finds the matching record.
// It never writes anything: the app shows a preview and the signed-in user confirms; saving then goes through the normal rules (RLS) as that user.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const TOOL = {
  name: 'propose_update',
  description: 'Turn the user\'s message into ONE update for the Follow-Up Customers list (leads) or the Purchase Accounts list (paying customers).',
  input_schema: {
    type: 'object',
    properties: {
      target: { type: 'string', enum: ['customer', 'account'], description: 'customer = a lead being followed up by sales; account = a paying customer being onboarded / built' },
      name: { type: 'string', description: 'The person or company the update is about, as spoken' },
      action: { type: 'string', enum: ['note', 'status', 'remind', 'unsupported'], description: 'note = add a follow-up / call / remark / issue; status = change a lead status; remind = ask a team member to do something on an account' },
      note_kind: { type: 'string', enum: ['followup', 'call', 'remark', 'issue'] },
      body: { type: 'string', description: 'What happened / what was said, cleaned up, in the language the user used' },
      next_action: { type: 'string', description: 'The next step, if any' },
      deadline: { type: 'string', description: 'YYYY-MM-DD for the next step, resolved from today\'s date, if any' },
      status: { type: 'string', enum: ['pending_management', 'potential', 'invite_webinar', 'none'], description: 'Only for action=status' },
      status_remark: { type: 'string', description: 'Reason, required for pending_management and potential' },
      invite_date: { type: 'string', description: 'YYYY-MM-DD webinar date for invite_webinar' },
      remind_person: { type: 'string', description: 'First name of the team member to remind (action=remind)' },
      why_unsupported: { type: 'string', description: 'If unsupported (e.g. closing a deal, booking a demo), say what to do instead' },
    },
    required: ['target', 'name', 'action'],
  },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: { user } } = await caller.auth.getUser()
  if (!user) return json({ error: 'Not signed in' }, 401)
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) return json({ error: 'Voice update is not switched on yet (the ANTHROPIC_API_KEY secret is missing).' }, 503)

  const { text, hint } = await req.json().catch(() => ({}))
  const said = String(text ?? '').trim().slice(0, 2000)
  if (!said) return json({ error: 'Say or type the update first.' }, 400)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' })

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-5-5', max_tokens: 600, tools: [TOOL], tool_choice: { type: 'tool', name: 'propose_update' },
      system: `You file short updates for a Malaysian sales / onboarding team. Today is ${today} (Malaysia). Messages may be English, Chinese or mixed. The text is a speech transcript, so names may be misspelled: keep the name as heard. Never invent facts; leave fields empty when not said. ${hint === 'customer' || hint === 'account' ? `The user is on the ${hint === 'customer' ? 'Follow-Up Customers' : 'Purchase Accounts'} page, so prefer that target.` : ''} Closing a deal, booking a demo/consultation, and editing contact details are NOT supported: use action=unsupported.`,
      messages: [{ role: 'user', content: said }],
    }),
  })
  if (!r.ok) return json({ error: `The assistant could not read that (${r.status}). Try again.` }, 502)
  const out = await r.json()
  const parsed = out.content?.find((c: any) => c.type === 'tool_use')?.input
  if (!parsed) return json({ error: 'Could not understand that. Try saying who it is about and what happened.' }, 422)

  // find the record as the signed-in user (row security applies, so people only match what they may see)
  const q = String(parsed.name ?? '').replace(/[%,()]/g, ' ').trim()
  let candidates: any[] = []
  if (q && parsed.action !== 'unsupported') {
    if (parsed.target === 'customer') {
      const { data } = await caller.from('customers').select('id, name, phone, batch, lead_status').ilike('name', `%${q}%`).limit(6)
      candidates = (data ?? []).map((c: any) => ({ id: c.id, label: c.name, sub: [c.phone, c.batch].filter(Boolean).join(' · ') }))
    } else {
      const { data } = await caller.from('purchase_accounts').select('id, account_name, contact_person, phone').or(`account_name.ilike.%${q}%,contact_person.ilike.%${q}%`).limit(6)
      candidates = (data ?? []).map((a: any) => ({ id: a.id, label: a.account_name, sub: [a.contact_person, a.phone].filter(Boolean).join(' · ') }))
    }
  }
  return json({ parsed, candidates, said })
})
