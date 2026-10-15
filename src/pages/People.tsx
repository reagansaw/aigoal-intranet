import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound, Pencil, Plus, Save, UserPlus } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import { Alert, DatePicker, initials, Msg, opts, PageHeader, SearchBox, Select } from '../components/ui'
import type { Profile, Role } from '../lib/types'

const EMP = opts(['Full-time', 'Part-time', 'Contract', 'Freelance/Partner', 'Intern'])
const GENDER = [{ value: '', label: '—' }, ...opts(['Male', 'Female', 'Other'])]
const ROLES = [{ value: 'staff', label: 'Staff' }, { value: 'hr', label: 'HR' }, { value: 'admin', label: 'Admin' }]
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
  const [q, setQ] = useState('')

  const load = async () => {
    const { data } = await supabase.from('profiles').select('*').order('active', { ascending: false }).order('full_name')
    setList((data ?? []) as Profile[])
  }
  useEffect(() => { load() }, [])
  const shown = list.filter((p) => !q || [p.full_name, p.email, p.title].join(' ').toLowerCase().includes(q.toLowerCase()))

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
  const fld = (label: string, el: React.ReactNode) => <div className="field"><label>{label}</label>{el}</div>

  return (
    <>
      <PageHeader title="People" sub={`${list.filter((p) => p.active).length} active team members`}>
        <SearchBox value={q} onChange={setQ} placeholder="Search people…" />
        <button className="primary" onClick={() => { setAdding(true); setErr('') }}><UserPlus size={16} />Add staff</button>
      </PageHeader>
      <div className="card flush table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Phone</th><th>Title</th><th>Type</th><th>Period</th><th>Role</th><th></th></tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id} style={{ opacity: p.active ? 1 : .55 }}>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}><div className="avatar">{initials(p.full_name || p.email)}</div><div><div className="cell-title">{p.full_name || '—'}</div><div className="muted sm-text">{p.email}</div></div></div></td>
                <td>{p.phone}</td><td>{p.title}</td><td>{p.employment_type}</td>
                <td className="muted">{p.start_date ?? '—'} to {p.end_date ?? 'ongoing'}</td>
                <td><span className={'tag ' + p.role}>{p.role}</span>{!p.active && <span className="tag warn" style={{ marginLeft: '.3rem' }}>inactive</span>}</td>
                <td><button className="ghost icon sm" aria-label="Edit" onClick={() => { setEdit(p); setErr('') }}><Pencil size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && (
        <Modal title="Add staff" onClose={() => setAdding(false)}>
          <form onSubmit={create}>
            <div className="form-grid">
              {fld('Name', <input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />)}
              {fld('Email', <input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />)}
              {fld('Initial password (min 8)', <input required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />)}
              {fld('Phone', <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />)}
              {fld('Title', <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />)}
              {fld('Gender', <Select block value={f.gender} onChange={(v) => setF({ ...f, gender: v })} options={GENDER} />)}
              {fld('Employment type', <Select block value={f.employment_type} onChange={(v) => setF({ ...f, employment_type: v })} options={EMP} />)}
              {isAdmin && fld('Role', <Select block value={f.role} onChange={(v) => setF({ ...f, role: v as Role })} options={ROLES} />)}
              {fld('Start date', <DatePicker value={f.start_date} onChange={(v) => setF({ ...f, start_date: v })} />)}
              {fld('End date', <DatePicker value={f.end_date} onChange={(v) => setF({ ...f, end_date: v })} />)}
            </div>
            <Alert text={err} />
            <div className="modal-foot"><button className="primary"><Plus size={16} />Create account</button></div>
          </form>
        </Modal>
      )}

      {edit && (
        <Modal title={edit.full_name || edit.email || 'Edit'} onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            <div className="form-grid">
              {fld('Name', <input value={edit.full_name} onChange={(e) => set('full_name', e.target.value)} />)}
              {fld('Phone', <input value={edit.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />)}
              {fld('Title', <input value={edit.title ?? ''} onChange={(e) => set('title', e.target.value)} />)}
              {fld('Gender', <Select block value={edit.gender ?? ''} onChange={(v) => set('gender', v || null)} options={GENDER} />)}
              {fld('Employment type', <Select block value={edit.employment_type ?? ''} onChange={(v) => set('employment_type', v || null)} options={[{ value: '', label: '—' }, ...EMP]} />)}
              {isAdmin && fld('Role', <Select block value={edit.role} onChange={(v) => set('role', v)} options={ROLES} />)}
              {fld('Start date', <DatePicker value={edit.start_date ?? ''} onChange={(v) => set('start_date', v)} />)}
              {fld('End date', <DatePicker value={edit.end_date ?? ''} onChange={(v) => set('end_date', v)} />)}
            </div>
            <label className="check"><input type="checkbox" checked={edit.active} onChange={(e) => set('active', e.target.checked)} />Active (untick to revoke access)</label>
            {err && !err.includes('✓') && <div style={{ marginTop: '.75rem' }}><Alert text={err} /></div>}
            <div className="modal-foot"><button className="primary"><Save size={16} />Save</button></div>
          </form>
          <hr />
          <label>Reset password</label>
          <div className="row">
            <input style={{ maxWidth: 260 }} placeholder="New password (min 8)" value={pw} onChange={(e) => setPw(e.target.value)} />
            <button type="button" onClick={reset} disabled={pw.length < 8}><KeyRound size={16} />Reset</button>
            {err.includes('✓') && <Msg text={err} />}
          </div>
        </Modal>
      )}
    </>
  )
}
