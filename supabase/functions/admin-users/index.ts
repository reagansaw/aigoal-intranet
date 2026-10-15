// Deploy: supabase functions deploy admin-users
// Lets Admin/HR create staff logins and reset passwords (needs the service role key,
// which is injected automatically by Supabase and never reaches the browser).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })

  const { data: { user } } = await caller.auth.getUser()
  if (!user) return json({ error: 'Not signed in' }, 401)
  const { data: me } = await admin.from('profiles').select('role, active').eq('id', user.id).single()
  if (!me?.active || !['admin', 'hr'].includes(me.role)) return json({ error: 'Forbidden' }, 403)

  const body = await req.json()

  if (body.action === 'create') {
    const role = me.role === 'admin' ? body.role ?? 'staff' : 'staff' // HR can only add staff
    if (!body.email || !body.password || body.password.length < 8) {
      return json({ error: 'Email and a password of at least 8 characters are required' }, 400)
    }
    const { data, error } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name ?? '' },
    })
    if (error) return json({ error: error.message }, 400)
    await admin.from('profiles').update({
      full_name: body.full_name ?? '', role, title: body.title ?? null,
      phone: body.phone ?? null, gender: body.gender ?? null,
      employment_type: body.employment_type ?? null,
      start_date: body.start_date || null, end_date: body.end_date || null,
    }).eq('id', data.user.id)
    return json({ id: data.user.id })
  }

  if (body.action === 'reset_password') {
    if (!body.password || body.password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)
    const { data: target } = await admin.from('profiles').select('role').eq('id', body.id).single()
    if (me.role === 'hr' && target?.role !== 'staff') return json({ error: 'HR can only reset staff passwords' }, 403)
    const { error } = await admin.auth.admin.updateUserById(body.id, { password: body.password })
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  return json({ error: 'Unknown action' }, 400)
})
