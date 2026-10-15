import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

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
    setPwMsg(error ? error.message : 'Password updated ✓')
    if (!error) setPw('')
  }
  const ro = (v: string | null) => v || '—'

  return (
    <>
      <h1>My Profile</h1>
      <form className="card" onSubmit={save}>
        <div className="form-grid">
          <div className="field"><label>Name</label><input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required /></div>
          <div className="field"><label>Phone number</label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div className="field"><label>Email (login)</label><input value={profile.email ?? ''} disabled /></div>
          <div className="field"><label>Gender</label>
            <select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
              <option value="">—</option><option>Male</option><option>Female</option><option>Other</option>
            </select>
          </div>
        </div>
        <div className="row"><button className="primary">Save</button><span className="ok">{msg}</span></div>
      </form>
      <div className="card">
        <h2>Employment {!isManager && <span className="muted">(set by HR)</span>}</h2>
        <div className="form-grid">
          <div><label>Title</label>{ro(profile.title)}</div>
          <div><label>Employment type</label>{ro(profile.employment_type)}</div>
          <div><label>Period</label>{ro(profile.start_date)} → {profile.end_date ?? 'ongoing'}</div>
          <div><label>Role</label><span className={'tag ' + profile.role}>{profile.role}</span></div>
        </div>
        {isManager && <p className="muted">Manage employment details under People.</p>}
      </div>
      <form className="card" onSubmit={changePw}>
        <h2>Change password</h2>
        <div className="row">
          <input type="password" style={{ maxWidth: 280 }} placeholder="New password (min 8)" value={pw} onChange={(e) => setPw(e.target.value)} />
          <button>Update</button><span className={pwMsg.includes('✓') ? 'ok' : 'err'}>{pwMsg}</span>
        </div>
      </form>
    </>
  )
}
