import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import type { Profile, Role } from '../lib/types'

const EMP = ['Full-time', 'Part-time', 'Contract', 'Freelance/Partner', 'Intern']
const blank = { email: '', password: '', full_name: '', phone: '', title: '', gender: '', employment_type: 'Full-time', start_date: '', end_date: '', role: 'staff' as Role }

async function call(body: object) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    let msg = error.message
    try { msg = (await (error as any).context.json()).error ?? msg } catch { /* keep message */ }
    throw new Error(msg)
  }
  return data
}

export default function People() {
  const { isAdmin } = useAuth()
  const [list, setList] = useState<Profile[]>([])
  const [edit, setEdit] = useState<Profile | null>(null)
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState(blank)
  const [err, setErr] = useState('')
  const [pw, setPw] = useState('')

  const load = async () => {
    const { data } = await supabase.from('profiles').select('*').order('active', { ascending: false }).order('full_name')
    setList((data ?? []) as Profile[])
  }
  useEffect(() => { load() }, [])

  const create = async (e: FormEvent) => {
    e.preventDefault(); setErr('')
    try { await call({ action: 'create', ...f }); setAdding(false); setF(blank); load() } catch (x: any) { setErr(x.message) }
  }
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!edit) return
    const { id, email, ...rest } = edit
    const { error } = await supabase.from('profiles').update({ ...rest, start_date: rest.start_date || null, end_date: rest.end_date || null }).eq('id', id)
    if (error) return setErr(error.message)
    setEdit(null); setErr(''); load()
  }
  const reset = async () => {
    if (!edit) return
    try { await call({ action: 'reset_password', id: edit.id, password: pw }); setPw(''); setErr('Password reset ✓') } catch (x: any) { setErr(x.message) }
  }
  const set = (k: keyof Profile, v: any) => setEdit(edit && { ...edit, [k]: v })

  return (
    <>
      <div className="row between"><h1>People</h1><button className="primary" onClick={() => { setAdding(true); setErr('') }}>+ Add staff</button></div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Title</th><th>Type</th><th>Period</th><th>Role</th><th></th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} style={{ opacity: p.active ? 1 : .5 }}>
                <td>{p.full_name || '—'}</td><td>{p.email}</td><td>{p.phone}</td><td>{p.title}</td><td>{p.employment_type}</td>
                <td>{p.start_date ?? '—'} → {p.end_date ?? 'ongoing'}</td>
                <td><span className={'tag ' + p.role}>{p.role}</span></td>
                <td><button className="sm" onClick={() => { setEdit(p); setErr('') }}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && (
        <Modal title="Add staff" onClose={() => setAdding(false)}>
          <form onSubmit={create}>
            <div className="form-grid">
              <div className="field"><label>Name</label><input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
              <div className="field"><label>Email</label><input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
              <div className="field"><label>Initial password (min 8)</label><input required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
              <div className="field"><label>Phone</label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
              <div className="field"><label>Title</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
              <div className="field"><label>Gender</label><select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}><option value="">—</option><option>Male</option><option>Female</option><option>Other</option></select></div>
              <div className="field"><label>Employment type</label><select value={f.employment_type} onChange={(e) => setF({ ...f, employment_type: e.target.value })}>{EMP.map((x) => <option key={x}>{x}</option>)}</select></div>
              {isAdmin && <div className="field"><label>Role</label><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}><option value="staff">Staff</option><option value="hr">HR</option><option value="admin">Admin</option></select></div>}
              <div className="field"><label>Start date</label><input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></div>
              <div className="field"><label>End date</label><input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></div>
            </div>
            {err && <div className="err">{err}</div>}
            <button className="primary">Create account</button>
          </form>
        </Modal>
      )}

      {edit && (
        <Modal title={`Edit ${edit.full_name || edit.email}`} onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            <div className="form-grid">
              <div className="field"><label>Name</label><input value={edit.full_name} onChange={(e) => set('full_name', e.target.value)} /></div>
              <div className="field"><label>Phone</label><input value={edit.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></div>
              <div className="field"><label>Title</label><input value={edit.title ?? ''} onChange={(e) => set('title', e.target.value)} /></div>
              <div className="field"><label>Gender</label><select value={edit.gender ?? ''} onChange={(e) => set('gender', e.target.value || null)}><option value="">—</option><option>Male</option><option>Female</option><option>Other</option></select></div>
              <div className="field"><label>Employment type</label><select value={edit.employment_type ?? ''} onChange={(e) => set('employment_type', e.target.value || null)}><option value="">—</option>{EMP.map((x) => <option key={x}>{x}</option>)}</select></div>
              {isAdmin && <div className="field"><label>Role</label><select value={edit.role} onChange={(e) => set('role', e.target.value)}><option value="staff">Staff</option><option value="hr">HR</option><option value="admin">Admin</option></select></div>}
              <div className="field"><label>Start date</label><input type="date" value={edit.start_date ?? ''} onChange={(e) => set('start_date', e.target.value)} /></div>
              <div className="field"><label>End date</label><input type="date" value={edit.end_date ?? ''} onChange={(e) => set('end_date', e.target.value)} /></div>
            </div>
            <label className="row"><input type="checkbox" checked={edit.active} onChange={(e) => set('active', e.target.checked)} /> Active (untick to revoke access)</label>
            {err && <div className={err.includes('✓') ? 'ok' : 'err'}>{err}</div>}
            <div className="row" style={{ marginTop: '.5rem' }}><button className="primary">Save</button></div>
          </form>
          <hr style={{ borderColor: 'var(--line)', margin: '1rem 0' }} />
          <div className="row">
            <input style={{ maxWidth: 240 }} placeholder="New password (min 8)" value={pw} onChange={(e) => setPw(e.target.value)} />
            <button type="button" onClick={reset} disabled={pw.length < 8}>Reset password</button>
          </div>
        </Modal>
      )}
    </>
  )
}
