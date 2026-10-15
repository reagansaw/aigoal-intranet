import { useState, type FormEvent } from 'react'
import { KeyRound, Save } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { initials, Msg, opts, PageHeader, Select, PasswordInput } from '../components/ui'

export default function Profile() {
  const { profile, isManager, refresh } = useAuth()
  const [f, setF] = useState({ full_name: profile?.full_name ?? '', phone: profile?.phone ?? '', gender: profile?.gender ?? '' })
  const [msg, setMsg] = useState('')
  const [pw, setPw] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  if (!profile) return null

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('profiles').update({ full_name: f.full_name, phone: f.phone || null, gender: f.gender || null }).eq('id', profile.id)
    setMsg(error ? error.message : 'Saved ✓')
    refresh()
  }
  const changePw = async (e: FormEvent) => {
    e.preventDefault()
    if (pw.length < 8) return setPwMsg('Use at least 8 characters.')
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (!error) await supabase.rpc('password_changed')
    setPwMsg(error ? error.message : 'Password updated ✓')
    if (!error) setPw('')
  }
  const kv = (label: string, v: React.ReactNode) => <div className="kv"><label>{label}</label><div className="v">{v || '—'}</div></div>

  return (
    <>
      <PageHeader title="My Profile" sub="Your details and sign-in settings." />
      <div className="card row" style={{ gap: '1rem', flexWrap: 'nowrap' }}>
        <div className="avatar" style={{ width: 56, height: 56, fontSize: '1.2rem' }}>{initials(profile.full_name || profile.email)}</div>
        <div>
          <div style={{ fontSize: '1.15rem', fontWeight: 650 }}>{profile.full_name || 'Unnamed'}</div>
          <div className="muted">{profile.title || 'No title yet'} · {profile.email}</div>
        </div>
        <span className={'tag ' + profile.role} style={{ marginLeft: 'auto' }}>{profile.role}</span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', alignItems: 'start' }}>
        <form className="card" onSubmit={save}>
          <div className="card-head"><h2>Personal details</h2></div>
          <div className="field"><label>Name</label><input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required /></div>
          <div className="field"><label>Phone number</label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="60123456789" /></div>
          <div className="field"><label>Email (used to sign in)</label><input value={profile.email ?? ''} disabled /></div>
          <div className="field"><label>Gender</label><Select block value={f.gender} onChange={(v) => setF({ ...f, gender: v })} options={[{ value: '', label: 'Prefer not to say' }, ...opts(['Male', 'Female', 'Other'])]} /></div>
          <div className="row"><button className="primary"><Save size={16} />Save changes</button><Msg text={msg} /></div>
        </form>

        <div>
          <div className="card">
            <div className="card-head"><h2>Employment</h2>{!isManager && <span className="muted sm-text">Managed by HR</span>}</div>
            <div className="form-grid" style={{ rowGap: '1rem' }}>
              {kv('Title', profile.title)}
              {kv('Employment type', profile.employment_type)}
              {kv('Start date', profile.start_date)}
              {kv('End date', profile.end_date ?? 'Ongoing')}
            </div>
          </div>
          <form className="card" onSubmit={changePw}>
            <div className="card-head"><h2>Change password</h2></div>
            <div className="field"><label>New password</label><PasswordInput placeholder="At least 8 characters" value={pw} onChange={setPw} autoComplete="new-password" /></div>
            <div className="row"><button><KeyRound size={16} />Update password</button><Msg text={pwMsg} /></div>
          </form>
        </div>
      </div>
    </>
  )
}
