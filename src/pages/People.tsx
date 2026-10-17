import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound, Pencil, Plus, Save, UserPlus } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import { Alert, DatePicker, initials, Msg, opts, PageHeader, Pagination, SearchBox, Select, usePaged } from '../components/ui'
import type { Profile, Role } from '../lib/types'

const EMP = opts(['Full-time', 'Part-time', 'Contract', 'Freelance/Partner', 'Intern'])
const GENDER = [{ value: '', label: '—' }, ...opts(['Male', 'Female', 'Other'])]
const ROLES = [{ value: 'staff', label: 'Staff' }, { value: 'manager', label: 'Manager (edits all accounts and leads)' }, { value: 'external', label: 'External (own accounts and leads only)' }, { value: 'hr', label: 'HR' }, { value: 'admin', label: 'Admin' }]
const blank = { is_sales: false, is_ai_builder: false, email: '', password: '', full_name: '', phone: '', title: '', gender: '', employment_type: 'Full-time', start_date: '', end_date: '', role: 'staff' as Role }

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
  const [email, setEmail] = useState('')

  const load = async () => {
    const { data } = await supabase.from('profiles').select('*').order('active', { ascending: false }).order('full_name')
    setList((data ?? []) as Profile[])
  }
  useEffect(() => { load() }, [])
  const shown = list.filter((p) => !q || [p.full_name, p.email, p.title].join(' ').toLowerCase().includes(q.toLowerCase()))

  const { rows: pageRows, pager } = usePaged(shown, q)

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
  const changeEmail = async () => {
    if (!edit) return
    try { await call({ action: 'update_email', id: edit.id, email }); setEdit({ ...edit, email }); setErr('Login email updated ✓'); load() } catch (x: any) { setErr(x.message) }
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
            {pageRows.map((p) => (
              <tr key={p.id} style={{ opacity: p.active ? 1 : .55 }}>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}><div className="avatar">{initials(p.full_name || p.email)}</div><div><div className="cell-title">{p.full_name || '—'}</div><div className="muted sm-text">{p.email}</div></div></div></td>
                <td>{p.phone}</td><td>{p.title}</td><td>{p.employment_type}</td>
                <td className="muted">{p.start_date ?? '—'} to {p.end_date ?? 'ongoing'}</td>
                <td><span className={'tag ' + p.role}>{p.role}</span>{p.is_sales && <span className="tag brand" style={{ marginLeft: '.3rem' }}>Sales</span>}{p.is_ai_builder && <span className="tag good" style={{ marginLeft: '.3rem' }}>AI Builder</span>}{!p.active && <span className="tag warn" style={{ marginLeft: '.3rem' }}>inactive</span>}</td>
                <td><button className="ghost icon sm" aria-label="Edit" onClick={() => { setEdit(p); setEmail(p.email ?? ''); setErr('') }}><Pencil size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination pager={pager} />
      </div>

      {adding && (
        <Modal title="Add staff" onClose={() => setAdding(false)}>
          <form onSubmit={create}>
            <div className="form-grid">
              {fld('Name', <input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />)}
              {fld('Email', <input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />)}
              {fld('Temporary password (min 8)', <input required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />)}
              {fld('Phone', <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />)}
              {fld('Title', <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />)}
              {fld('Gender', <Select block value={f.gender} onChange={(v) => setF({ ...f, gender: v })} options={GENDER} />)}
              {fld('Employment type', <Select block value={f.employment_type} onChange={(v) => setF({ ...f, employment_type: v })} options={EMP} />)}
              {isAdmin && fld('Role', <Select block value={f.role} onChange={(v) => setF({ ...f, role: v as Role })} options={ROLES} />)}
              {isAdmin && <div className="field"><label>Job roles</label><div className="chips">
                <button type="button" className={'chip' + (f.is_sales ? ' on' : '')} onClick={() => setF({ ...f, is_sales: !f.is_sales })}>Sales</button>
                <button type="button" className={'chip' + (f.is_ai_builder ? ' on' : '')} onClick={() => setF({ ...f, is_ai_builder: !f.is_ai_builder })}>AI Builder</button></div></div>}
              {fld('Start date', <DatePicker value={f.start_date} onChange={(v) => setF({ ...f, start_date: v })} />)}
              {fld('End date', <DatePicker value={f.end_date} onChange={(v) => setF({ ...f, end_date: v })} />)}
            </div>
            <Alert text={err} />
            <p className="muted sm-text">They will be asked to set their own password the first time they sign in.</p>
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
              {isAdmin && <div className="field"><label>Job roles</label><div className="chips">
                <button type="button" className={'chip' + (edit.is_sales ? ' on' : '')} onClick={() => set('is_sales', !edit.is_sales)}>Sales</button>
                <button type="button" className={'chip' + (edit.is_ai_builder ? ' on' : '')} onClick={() => set('is_ai_builder', !edit.is_ai_builder)}>AI Builder</button></div></div>}
              {isAdmin && <div className="field"><label>Follow-Up Customers</label><div className="chips"><button type="button" className={'chip' + (edit.can_view_all_leads ? ' on' : '')} onClick={() => set('can_view_all_leads', !edit.can_view_all_leads)}>Can view all leads (read only)</button></div></div>}
              {fld('Start date', <DatePicker value={edit.start_date ?? ''} onChange={(v) => set('start_date', v)} />)}
              {fld('End date', <DatePicker value={edit.end_date ?? ''} onChange={(v) => set('end_date', v)} />)}
            </div>
            <label className="check"><input type="checkbox" checked={edit.active} onChange={(e) => set('active', e.target.checked)} />Active (untick to revoke access)</label>
            {err && !err.includes('✓') && <div style={{ marginTop: '.75rem' }}><Alert text={err} /></div>}
            <div className="modal-foot"><button className="primary"><Save size={16} />Save</button></div>
          </form>
          {isAdmin && (
            <>
              <hr />
              <label>Login email</label>
              <div className="row">
                <input style={{ maxWidth: 320 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <button type="button" onClick={changeEmail} disabled={!email || email === edit.email}>Update email</button>
              </div>
            </>
          )}
          <hr />
          <label>Reset password</label>
          <p className="muted sm-text" style={{ margin: '0 0 .6rem' }}>Give them this temporary password. At their next login they must choose a new one.</p>
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
