import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useStaff } from '../lib/useStaff'
import Modal from '../components/Modal'
import CsvImport from '../components/CsvImport'
import type { Customer } from '../lib/types'

const PRI = { P1: '🔥 P1 热单', P2: '🟠 P2 出席但看不久', P3: '🟡 P3 没来但回过 YES', P4: '⚪ P4 报名没回应' } as const
const CHANNELS = ['Facebook', 'Instagram', 'WhatsApp', 'Telegram', '小红书', 'Website', 'Tiktok']
const blank: Partial<Customer> = { priority: 'P4', name: '', channels: [] }
const pk = (r: Record<string, string>, ...k: string[]) => k.map((x) => r[x]).find((v) => v) || null
const yes = (v: string | null) => !!v && /^(y|yes|true|f|✓|✅|1)/i.test(v.trim())

export default function Customers() {
  const { profile, isAdmin } = useAuth()
  const staff = useStaff()
  const [rows, setRows] = useState<Customer[]>([])
  const [q, setQ] = useState('')
  const [pri, setPri] = useState('')
  const [batch, setBatch] = useState('')
  const [owner, setOwner] = useState('')
  const [edit, setEdit] = useState<Partial<Customer> | null>(null)
  const [err, setErr] = useState('')

  const load = async () => {
    const { data } = await supabase.from('customers').select('*').order('priority').order('name').limit(5000)
    setRows((data ?? []) as Customer[])
  }
  useEffect(() => { load() }, [])

  const batches = useMemo(() => [...new Set(rows.map((r) => r.batch).filter(Boolean))] as string[], [rows])
  const nameOf = (id: string | null) => staff.find((s) => s.id === id)?.full_name || '—'
  const shown = rows.filter((r) =>
    (!pri || r.priority === pri) && (!batch || r.batch === batch) && (!owner || (owner === 'none' ? !r.owner_id : r.owner_id === owner)) &&
    (!q || [r.name, r.phone, r.email, r.industry].join(' ').toLowerCase().includes(q.toLowerCase())))

  const count = (p: string) => shown.filter((r) => r.priority === p).length
  const closed = shown.filter((r) => r.closed_date || /成交|closed|won/i.test(r.result ?? '')).length

  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!edit) return
    const { id, ...rest } = edit as Customer
    const payload = { ...rest, closed_date: rest.closed_date || null }
    const { error } = id ? await supabase.from('customers').update(payload).eq('id', id) : await supabase.from('customers').insert(payload)
    if (error) return setErr(error.message)
    setEdit(null); setErr(''); load()
  }
  const del = async () => { if (edit?.id && confirm('Delete this customer?')) { await supabase.from('customers').delete().eq('id', edit.id); setEdit(null); load() } }
  const set = (k: keyof Customer, v: any) => setEdit({ ...edit, [k]: v })

  const importRows = async (rs: Record<string, string>[]) => {
    const payload = rs.map((r) => {
      const p = (pk(r, '优先级', 'Priority') ?? '').match(/P[1-4]/)?.[0] ?? 'P4'
      const salesName = pk(r, '负责 sales', 'Sales', 'Owner')
      return {
        priority: p, name: pk(r, '姓名', 'Name') ?? '', phone: pk(r, '电话', 'Phone'), email: pk(r, 'Email'),
        industry: pk(r, '行业 (Industry)', '行业', 'Industry'), batch: pk(r, 'Batch', 'Webinar') ?? batch ?? null,
        owner_id: staff.find((s) => salesName && s.full_name.toLowerCase().includes(salesName.toLowerCase()))?.id ?? null,
        repeat_from: pk(r, '重复自哪一场'), called: yes(pk(r, 'Call')), not_available: yes(pk(r, 'Not Available?')),
        not_interested_reason: pk(r, 'Not Interested? Reason'), team_size: pk(r, '团队人数'), monthly_revenue: pk(r, '月业绩'),
        reply_method: pk(r, '用什么方法回复'), missed_leads: pk(r, '遗漏多少 Leads'), leads_per_day: pk(r, 'Leads per day (每天多少)'),
        channels: CHANNELS.filter((c) => yes(pk(r, c))), other_courses: pk(r, '上过其他课?'), result: pk(r, '跟进结果'),
        closed_date: /^\d{4}-\d{2}-\d{2}$/.test(pk(r, '成交日期') ?? '') ? pk(r, '成交日期') : null,
        prospect: yes(pk(r, '准顾客')),
      }
    }).filter((p) => p.name)
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await supabase.from('customers').insert(payload.slice(i, i + 500))
      if (error) return error.message
    }
    load()
  }

  return (
    <>
      <div className="row between">
        <h1>{isAdmin ? 'Follow-Up Customers — Main List' : 'My Follow-Up Customers'}</h1>
        <div className="row">
          {isAdmin && <CsvImport onRows={importRows} />}
          {isAdmin && <button className="primary" onClick={() => { setEdit({ ...blank }); setErr('') }}>+ Add</button>}
        </div>
      </div>
      <div className="grid" style={{ marginBottom: '1rem' }}>
        {(['P1', 'P2', 'P3', 'P4'] as const).map((p) => <div key={p} className="card" style={{ margin: 0, cursor: 'pointer' }} onClick={() => setPri(pri === p ? '' : p)}><div className="muted">{PRI[p]}</div><div className="stat">{count(p)}</div></div>)}
        <div className="card" style={{ margin: 0 }}><div className="muted">✅ 已成交</div><div className="stat">{closed}</div></div>
      </div>
      <div className="row" style={{ marginBottom: '1rem' }}>
        <input style={{ maxWidth: 260 }} placeholder="Search name, phone, email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select style={{ width: 'auto' }} value={pri} onChange={(e) => setPri(e.target.value)}><option value="">All priorities</option>{Object.entries(PRI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select style={{ width: 'auto' }} value={batch} onChange={(e) => setBatch(e.target.value)}><option value="">All webinars</option>{batches.map((b) => <option key={b}>{b}</option>)}</select>
        {isAdmin && <select style={{ width: 'auto' }} value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">All sales</option><option value="none">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select>}
        <span className="muted">{shown.length} customers</span>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Pri</th><th>Name</th><th>Phone</th><th>Industry</th>{isAdmin && <th>Sales</th>}<th>Webinar</th><th>Called</th><th>Result</th><th></th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td><span className={'tag ' + r.priority}>{r.priority}</span></td>
                <td><b>{r.name}</b>{r.prospect && ' ⭐'}</td>
                <td>{r.phone && <a href={`https://wa.me/${r.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">{r.phone}</a>}</td>
                <td>{r.industry}</td>{isAdmin && <td>{nameOf(r.owner_id)}</td>}<td>{r.batch}</td>
                <td>{r.called ? '📞' : r.not_available ? '✖︎' : ''}</td><td>{r.result}</td>
                <td><button className="sm" onClick={() => { setEdit(r); setErr('') }}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="muted">{isAdmin ? 'No customers yet. Add manually or import a CSV exported from the leads sheet.' : 'Nothing assigned to you yet.'}</p>}
      </div>
      {edit && (
        <Modal title={edit.id ? edit.name ?? 'Customer' : 'Add customer'} onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            <div className="form-grid">
              {isAdmin && <div className="field"><label>Priority</label><select value={edit.priority} onChange={(e) => set('priority', e.target.value)}>{Object.entries(PRI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>}
              {isAdmin && <div className="field"><label>Assigned sales</label><select value={edit.owner_id ?? ''} onChange={(e) => set('owner_id', e.target.value || null)}><option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></div>}
              {isAdmin && <div className="field"><label>Webinar / batch</label><input value={edit.batch ?? ''} onChange={(e) => set('batch', e.target.value)} placeholder="14 Oct" /></div>}
              <div className="field"><label>Name</label><input required disabled={!isAdmin} value={edit.name ?? ''} onChange={(e) => set('name', e.target.value)} /></div>
              <div className="field"><label>Phone</label><input value={edit.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></div>
              <div className="field"><label>Email</label><input value={edit.email ?? ''} onChange={(e) => set('email', e.target.value)} /></div>
              <div className="field"><label>Industry</label><input value={edit.industry ?? ''} onChange={(e) => set('industry', e.target.value)} /></div>
              <div className="field"><label>Team size</label><input value={edit.team_size ?? ''} onChange={(e) => set('team_size', e.target.value)} /></div>
              <div className="field"><label>Monthly revenue</label><input value={edit.monthly_revenue ?? ''} onChange={(e) => set('monthly_revenue', e.target.value)} /></div>
              <div className="field"><label>Leads per day</label><input value={edit.leads_per_day ?? ''} onChange={(e) => set('leads_per_day', e.target.value)} /></div>
              <div className="field"><label>How do they reply?</label><input value={edit.reply_method ?? ''} onChange={(e) => set('reply_method', e.target.value)} /></div>
              <div className="field"><label>Missed leads</label><input value={edit.missed_leads ?? ''} onChange={(e) => set('missed_leads', e.target.value)} /></div>
              <div className="field"><label>Other courses attended</label><input value={edit.other_courses ?? ''} onChange={(e) => set('other_courses', e.target.value)} /></div>
              <div className="field"><label>Not interested — reason</label><input value={edit.not_interested_reason ?? ''} onChange={(e) => set('not_interested_reason', e.target.value)} /></div>
              <div className="field"><label>Follow-up result</label><input value={edit.result ?? ''} onChange={(e) => set('result', e.target.value)} /></div>
              <div className="field"><label>Closed date</label><input type="date" value={edit.closed_date ?? ''} onChange={(e) => set('closed_date', e.target.value)} /></div>
            </div>
            <div className="field"><label>Lead channels</label><div className="row">{CHANNELS.map((c) => <label key={c} className="row" style={{ margin: 0 }}><input type="checkbox" checked={edit.channels?.includes(c) ?? false} onChange={(e) => set('channels', e.target.checked ? [...(edit.channels ?? []), c] : (edit.channels ?? []).filter((x) => x !== c))} />{c}</label>)}</div></div>
            <div className="row">
              <label className="row" style={{ margin: 0 }}><input type="checkbox" checked={edit.called ?? false} onChange={(e) => set('called', e.target.checked)} />Called</label>
              <label className="row" style={{ margin: 0 }}><input type="checkbox" checked={edit.not_available ?? false} onChange={(e) => set('not_available', e.target.checked)} />Not available</label>
              <label className="row" style={{ margin: 0 }}><input type="checkbox" checked={edit.prospect ?? false} onChange={(e) => set('prospect', e.target.checked)} />⭐ 准顾客</label>
            </div>
            <div className="field" style={{ marginTop: '.75rem' }}><label>Notes</label><textarea value={edit.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></div>
            {err && <div className="err">{err}</div>}
            <div className="row"><button className="primary">Save</button>{edit.id && isAdmin && <button type="button" className="danger" onClick={del}>Delete</button>}</div>
          </form>
        </Modal>
      )}
      <span hidden>{profile?.id}</span>
    </>
  )
}
