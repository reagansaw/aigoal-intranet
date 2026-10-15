import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import Modal from '../components/Modal'
import CsvImport from '../components/CsvImport'
import type { PurchaseAccount } from '../lib/types'

const blank: Partial<PurchaseAccount> = { product: 'AIGOAL', account_name: '' }
const pick = (r: Record<string, string>, ...keys: string[]) => keys.map((k) => r[k]).find((v) => v) || null

export default function Accounts() {
  const { isManager } = useAuth()
  const [rows, setRows] = useState<PurchaseAccount[]>([])
  const [q, setQ] = useState('')
  const [product, setProduct] = useState('')
  const [status, setStatus] = useState('')
  const [edit, setEdit] = useState<Partial<PurchaseAccount> | null>(null)
  const [err, setErr] = useState('')

  const load = async () => {
    const { data } = await supabase.from('purchase_accounts').select('*').order('account_name').limit(5000)
    setRows((data ?? []) as PurchaseAccount[])
  }
  useEffect(() => { load() }, [])

  const products = useMemo(() => [...new Set(rows.map((r) => r.product))], [rows])
  const statuses = useMemo(() => [...new Set(rows.map((r) => r.status).filter(Boolean))] as string[], [rows])
  const shown = rows.filter((r) =>
    (!product || r.product === product) && (!status || r.status === status) &&
    (!q || [r.account_name, r.owner_user, r.industry, r.followup_notes].join(' ').toLowerCase().includes(q.toLowerCase())))

  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!edit) return
    const { id, ...rest } = edit as PurchaseAccount
    const payload = { ...rest, purchase_date: rest.purchase_date || null, expiry_date: rest.expiry_date || null, updated_at: new Date().toISOString() }
    const { error } = id ? await supabase.from('purchase_accounts').update(payload).eq('id', id) : await supabase.from('purchase_accounts').insert(payload)
    if (error) return setErr(error.message)
    setEdit(null); setErr(''); load()
  }
  const del = async () => {
    if (edit?.id && confirm('Delete this account?')) { await supabase.from('purchase_accounts').delete().eq('id', edit.id); setEdit(null); load() }
  }
  const importRows = async (rs: Record<string, string>[]) => {
    const payload = rs.map((r) => ({
      product: pick(r, 'Product') ?? product ?? 'AIGOAL',
      account_name: pick(r, 'GHL Account (AI Goal)', 'GHL Account', 'Account') ?? '',
      owner_user: pick(r, 'User'), industry: pick(r, '行业', 'Industry'),
      status: pick(r, 'Status'), new_status: pick(r, 'New Status'),
      followup_notes: pick(r, 'Follow up 进展', 'Notes'),
    })).filter((p) => p.account_name)
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await supabase.from('purchase_accounts').insert(payload.slice(i, i + 500))
      if (error) return error.message
    }
    load()
  }
  const set = (k: keyof PurchaseAccount, v: string) => setEdit({ ...edit, [k]: v })

  return (
    <>
      <div className="row between">
        <h1>AIGOAL Purchase Accounts</h1>
        <div className="row">
          {isManager && <CsvImport onRows={importRows} />}
          <button className="primary" onClick={() => { setEdit({ ...blank }); setErr('') }}>+ Add</button>
        </div>
      </div>
      <div className="row" style={{ marginBottom: '1rem' }}>
        <input style={{ maxWidth: 280 }} placeholder="Search account, user, industry, notes…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select style={{ width: 'auto' }} value={product} onChange={(e) => setProduct(e.target.value)}><option value="">All products</option>{products.map((p) => <option key={p}>{p}</option>)}</select>
        <select style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{statuses.map((p) => <option key={p}>{p}</option>)}</select>
        <span className="muted">{shown.length} accounts</span>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Product</th><th>Account</th><th>User</th><th>Industry</th><th>Status</th><th>New status</th><th>Expiry</th><th>Follow-up</th><th></th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>{r.product}</td><td><b>{r.account_name}</b></td><td>{r.owner_user}</td><td>{r.industry}</td>
                <td>{r.status}</td><td>{r.new_status}</td><td>{r.expiry_date}</td><td className="pre">{r.followup_notes}</td>
                <td><button className="sm" onClick={() => { setEdit(r); setErr('') }}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="muted">No accounts yet. Add one or import a CSV exported from the Google Sheet (columns: GHL Account (AI Goal), User, Status, New Status, 行业, Follow up 进展).</p>}
      </div>
      {edit && (
        <Modal title={edit.id ? 'Edit account' : 'Add account'} onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            <div className="form-grid">
              <div className="field"><label>Product</label><input value={edit.product ?? ''} onChange={(e) => set('product', e.target.value)} list="prods" /><datalist id="prods">{['AIGOAL', 'QAI', 'AI Studio'].map((p) => <option key={p} value={p} />)}</datalist></div>
              <div className="field"><label>Account name</label><input required value={edit.account_name ?? ''} onChange={(e) => set('account_name', e.target.value)} /></div>
              <div className="field"><label>User</label><input value={edit.owner_user ?? ''} onChange={(e) => set('owner_user', e.target.value)} /></div>
              <div className="field"><label>Industry</label><input value={edit.industry ?? ''} onChange={(e) => set('industry', e.target.value)} /></div>
              <div className="field"><label>Status</label><input value={edit.status ?? ''} onChange={(e) => set('status', e.target.value)} /></div>
              <div className="field"><label>New status</label><input value={edit.new_status ?? ''} onChange={(e) => set('new_status', e.target.value)} /></div>
              <div className="field"><label>Purchase date</label><input type="date" value={edit.purchase_date ?? ''} onChange={(e) => set('purchase_date', e.target.value)} /></div>
              <div className="field"><label>Expiry date</label><input type="date" value={edit.expiry_date ?? ''} onChange={(e) => set('expiry_date', e.target.value)} /></div>
            </div>
            <div className="field"><label>Follow-up notes</label><textarea value={edit.followup_notes ?? ''} onChange={(e) => set('followup_notes', e.target.value)} /></div>
            {err && <div className="err">{err}</div>}
            <div className="row"><button className="primary">Save</button>{edit.id && isManager && <button type="button" className="danger" onClick={del}>Delete</button>}</div>
          </form>
        </Modal>
      )}
    </>
  )
}
