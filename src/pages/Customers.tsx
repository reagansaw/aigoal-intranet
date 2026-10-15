import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BadgeCheck, Flame, Lock, Hourglass, MessageCircle, Pencil, PhoneCall, PhoneOff, Plus, Save, Star, Timer, Trash2, Users } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useStaff } from '../lib/useStaff'
import { today } from '../lib/util'
import Modal from '../components/Modal'
import CsvImport from '../components/CsvImport'
import AuditTrail from '../components/AuditTrail'
import { Alert, DatePicker, Empty, Msg, PageHeader, Pagination, PriorityBadge, SearchBox, Select, Stat, opts, usePaged } from '../components/ui'
import { applyOwner, ownerOptions, ownerValue } from '../lib/owners'
import type { Customer } from '../lib/types'

const PRI = [
  { value: 'P1', label: 'P1 · Hot (热单)' }, { value: 'P2', label: 'P2 · Attended, left early' },
  { value: 'P3', label: 'P3 · Missed, replied YES' }, { value: 'P4', label: 'P4 · No response' },
]
const LEAD_STATUS: { value: string; label: string; tag: string }[] = [
  { value: 'pending_management', label: 'Pending Management', tag: 'warn' },
  { value: 'pending_demo', label: 'Pending Demo', tag: 'brand' },
  { value: 'invite_webinar', label: 'Invite Webinar', tag: 'good' },
]
const CHANNELS = ['Facebook', 'Instagram', 'WhatsApp', 'Telegram', '小红书', 'Website', 'Tiktok']
const blank: Partial<Customer> = { priority: 'P4', name: '', channels: [] }
const pk = (r: Record<string, string>, ...k: string[]) => k.map((x) => r[x]).find((v) => v) || null
const yes = (v: string | null) => !!v && /^(y|yes|true|f|✓|1)/i.test(v.trim())

export default function Customers() {
  const { isAdmin } = useAuth()
  const staff = useStaff()
  const [params] = useSearchParams()
  const [rows, setRows] = useState<Customer[]>([])
  const [q, setQ] = useState('')
  const [pri, setPri] = useState('all')
  const [batch, setBatch] = useState('all')
  const [owner, setOwner] = useState(params.get('owner') ?? 'all')
  const [statusF, setStatusF] = useState(params.get('status') ?? 'all')
  const [ask, setAsk] = useState<{ row: Customer; remark: string } | null>(null)
  const [toast, setToast] = useState('')
  const [buy, setBuy] = useState('all')
  const [edit, setEdit] = useState<Partial<Customer> | null>(null)
  const [err, setErr] = useState('')

  const load = async () => {
    const all: Customer[] = []
    for (let from = 0; ; from += 1000) { // page past the 1000-row API limit
      const { data } = await supabase.from('customers').select('*').order('priority').order('name').range(from, from + 999)
      all.push(...((data ?? []) as Customer[]))
      if (!data || data.length < 1000) break
    }
    // a webinar's leads appear the day after it has taken place (21 Oct shows from 22 Oct)
    setRows(all.filter((r) => !r.batch_date || r.batch_date < today()))
  }
  useEffect(() => { load() }, [])

  const ownerOf = (r: Pick<Customer, 'owner_id' | 'owner_name'>) => staff.find((s) => s.id === r.owner_id)?.full_name || r.owner_name || ''
  const batches = useMemo(() => {
    const m = new Map<string, { label: string; date: string; n: number }>()
    rows.forEach((r) => { if (r.batch) { const x = m.get(r.batch) ?? { label: r.batch, date: r.batch_date ?? '', n: 0 }; x.n++; m.set(r.batch, x) } })
    return [...m.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [rows])
  const owners = useMemo(() => [...new Set(rows.map(ownerOf).filter(Boolean))].sort(), [rows, staff])
  const shown = rows.filter((r) =>
    (pri === 'all' || r.priority === pri) && (statusF === 'all' || (statusF === 'none' ? !r.lead_status : r.lead_status === statusF)) && (buy === 'all' || (buy === 'yes') === r.purchased) && (batch === 'all' || r.batch === batch) &&
    (owner === 'all' || (owner === 'none' ? !ownerOf(r) : ownerOf(r) === owner)) &&
    (!q || [r.name, r.phone, r.email, r.industry].join(' ').toLowerCase().includes(q.toLowerCase())))
  const count = (p: string) => shown.filter((r) => r.priority === p).length
  const closed = shown.filter((r) => r.purchased || r.closed_date || /成交|bought|closed|won|purchased/i.test(r.result ?? '')).length

  const ownerOpts = ownerOptions(staff.filter((x) => x.is_sales || x.role === 'admin'), owners)
  const ownerVal = ownerValue(edit ?? {})
  const setOwnerFrom = (v: string) => setEdit(applyOwner(edit!, v, staff))
  const { rows: pageRows, pager } = usePaged(shown, JSON.stringify([q, pri, batch, owner, buy, statusF]))

  const changeStatus = async (row: Customer, v: string) => {
    if (v === 'pending_management') return setAsk({ row, remark: row.status_remark ?? '' })
    const { error } = await supabase.from('customers').update({ lead_status: v || null }).eq('id', row.id)
    setToast(error ? error.message : ''); load()
  }
  const saveAsk = async () => {
    if (!ask || !ask.remark.trim()) return
    const { error } = await supabase.from('customers').update({ lead_status: 'pending_management', status_remark: ask.remark.trim() }).eq('id', ask.row.id)
    if (error) return setToast(error.message)
    setAsk(null); setToast(''); load()
  }

  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!edit) return
    if (edit.lead_status === 'pending_management' && !edit.status_remark?.trim()) return setErr('Pending Management needs a remark.')
    const { id, ...rest } = edit as Customer
    const payload = { ...rest, closed_date: rest.closed_date || null }
    const { error } = id ? await supabase.from('customers').update(payload).eq('id', id) : await supabase.from('customers').insert(payload)
    if (error) return setErr(error.message)
    setEdit(null); setErr(''); load()
  }
  const del = async () => { if (edit?.id && confirm('Delete this customer?')) { await supabase.from('customers').delete().eq('id', edit.id); setEdit(null); load() } }
  const set = (k: keyof Customer, v: any) => setEdit({ ...edit, [k]: v })
  const txt = (k: keyof Customer, label: string, disabled = false) => (
    <div className="field"><label>{label}</label><input disabled={disabled} value={(edit?.[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} /></div>
  )

  const importRows = async (rs: Record<string, string>[]) => {
    const payload = rs.map((r) => {
      const salesName = pk(r, '负责 sales', 'Sales', 'Owner')
      const match = staff.find((s) => salesName && s.full_name.toLowerCase().includes(salesName.toLowerCase()))
      return {
        priority: (pk(r, '优先级', 'Priority') ?? '').match(/P[1-4]/)?.[0] ?? 'P4', name: pk(r, '姓名', 'Name') ?? '', phone: pk(r, '电话', 'Phone'), email: pk(r, 'Email'),
        industry: pk(r, '行业 (Industry)', '行业', 'Industry'), batch: pk(r, 'Batch', 'Webinar') ?? (batch !== 'all' ? batch : null),
        owner_id: match?.id ?? null, owner_name: match?.full_name ?? salesName,
        repeat_from: pk(r, '重复自哪一场'), called: yes(pk(r, 'Call')), not_available: /not available/i.test(pk(r, 'Not Available?') ?? ''),
        not_interested_reason: pk(r, 'Not Interested? Reason'), team_size: pk(r, '团队人数'), monthly_revenue: pk(r, '月业绩'),
        reply_method: pk(r, '用什么方法回复'), missed_leads: pk(r, '遗漏多少 Leads'), leads_per_day: pk(r, 'Leads per day (每天多少)'),
        channels: CHANNELS.filter((c) => yes(pk(r, c))), other_courses: pk(r, '上过其他课?'), result: pk(r, '跟进结果'),
        closed_date: /^\d{4}-\d{2}-\d{2}$/.test(pk(r, '成交日期') ?? '') ? pk(r, '成交日期') : null, prospect: yes(pk(r, '准顾客')),
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
      <PageHeader title={isAdmin ? 'Follow-Up Customers' : 'My Follow-Up Customers'} sub={isAdmin ? 'Main list. Staff only see the leads assigned to them.' : 'Leads assigned to you.'}>
        {isAdmin && <CsvImport onRows={importRows} />}
        {isAdmin && <button className="primary" onClick={() => { setEdit({ ...blank }); setErr('') }}><Plus size={16} />Add customer</button>}
      </PageHeader>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <Stat icon={Flame} tone="red" label="P1 · Hot" value={count('P1')} active={pri === 'P1'} onClick={() => setPri(pri === 'P1' ? 'all' : 'P1')} />
        <Stat icon={Timer} tone="orange" label="P2 · Left early" value={count('P2')} active={pri === 'P2'} onClick={() => setPri(pri === 'P2' ? 'all' : 'P2')} />
        <Stat icon={MessageCircle} tone="yellow" label="P3 · Replied YES" value={count('P3')} active={pri === 'P3'} onClick={() => setPri(pri === 'P3' ? 'all' : 'P3')} />
        <Stat icon={Hourglass} tone="gray" label="P4 · No response" value={count('P4')} active={pri === 'P4'} onClick={() => setPri(pri === 'P4' ? 'all' : 'P4')} />
        <Stat icon={BadgeCheck} tone="green" label="Purchased" value={closed} active={buy === 'yes'} onClick={() => setBuy(buy === 'yes' ? 'all' : 'yes')} />
      </div>
      <div className="row" style={{ marginBottom: '1rem' }}>
        <SearchBox value={q} onChange={setQ} placeholder="Search name, phone, email…" />
        <Select value={pri} onChange={setPri} options={[{ value: 'all', label: 'All priorities' }, ...PRI]} />
        <Select value={batch} onChange={setBatch} options={[{ value: 'all', label: 'All webinars', hint: String(rows.length) }, ...batches.map((b) => ({ value: b.label, label: b.label, hint: String(b.n) }))]} />
        <Select value={statusF} onChange={setStatusF} options={[{ value: 'all', label: 'Any status' }, ...LEAD_STATUS.map(({ value, label }) => ({ value, label })), { value: 'none', label: 'No status' }]} />
        <Select value={buy} onChange={setBuy} options={[{ value: 'all', label: 'All customers' }, { value: 'yes', label: 'Purchased' }, { value: 'no', label: 'Not purchased' }]} />
        {isAdmin && <Select value={owner} onChange={setOwner} options={[{ value: 'all', label: 'All sales' }, { value: 'none', label: 'Unassigned' }, ...opts(owners)]} />}
        <span className="muted sm-text">{shown.length} customers</span>
        <Msg text={toast} />
      </div>
      <div className="card flush table-wrap">
        <table>
          <thead><tr><th>Priority</th><th>Name</th><th>Phone</th><th>Industry</th>{isAdmin && <th>Sales</th>}<th>Webinar</th><th>Call</th><th>Result</th><th style={{ minWidth: 190 }}>Status</th><th></th></tr></thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id} className="click" onClick={() => { setEdit(r); setErr('') }}>
                <td><PriorityBadge p={r.priority} /></td>
                <td><span className="cell-title">{r.name}</span> {r.purchased && <span className="tag good"><BadgeCheck size={12} />Purchased</span>} {r.prospect && <Star size={14} className="i" style={{ color: '#eab308' }} />}</td>
                <td>{r.phone && <a href={`https://wa.me/${r.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{r.phone}</a>}</td>
                <td>{r.industry}</td>{isAdmin && <td>{ownerOf(r) || <span className="muted">—</span>}</td>}<td>{r.batch}</td>
                <td>{r.called ? <PhoneCall size={16} className="i" style={{ color: 'var(--ok)' }} /> : r.not_available ? <PhoneOff size={16} className="i" style={{ color: 'var(--muted)' }} /> : null}</td>
                <td style={{ maxWidth: 260 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.result}</div></td>
                <td onClick={(e) => e.stopPropagation()}>
                  <Select value={r.lead_status ?? ''} onChange={(v) => changeStatus(r, v)} placeholder="Set status" options={[{ value: '', label: 'No status' }, ...LEAD_STATUS.map(({ value, label }) => ({ value, label }))]} />
                  {r.lead_status === 'pending_management' && r.status_remark && <div className="muted sm-text clamp2" style={{ maxWidth: 220, marginTop: 3 }} title={r.status_remark}>{r.status_remark}</div>}
                </td>
                <td><Pencil size={15} className="i" style={{ color: 'var(--muted)' }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <Empty icon={Users} title="No customers found">{isAdmin ? 'Add one, import a CSV, or adjust the filters.' : 'Nothing assigned to you yet.'}</Empty>}
        <Pagination pager={pager} />
      </div>

      {edit && (
        <Modal title={edit.id ? edit.name || 'Customer' : 'Add customer'} onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            {!isAdmin && edit.id && <p className="muted sm-text" style={{ marginTop: 0 }}><Lock size={12} className="i" /> Locked fields (priority, assigned sales, webinar, name, phone, email) can only be changed by Admin.</p>}
            <div className="form-grid">
              <div className="field"><label>Priority {!isAdmin && <Lock size={11} className="i" />}</label><Select block disabled={!isAdmin} value={edit.priority ?? 'P4'} onChange={(v) => set('priority', v)} options={PRI} /></div>
              <div className="field"><label>Assigned sales {!isAdmin && <Lock size={11} className="i" />}</label><Select block disabled={!isAdmin} value={ownerVal} onChange={setOwnerFrom} options={ownerOpts} /></div>
              {txt('batch', 'Webinar / batch', !isAdmin)}
              {txt('name', 'Name', !isAdmin)}{txt('phone', 'Phone', !isAdmin)}{txt('email', 'Email', !isAdmin)}{txt('industry', 'Industry')}
              {txt('team_size', 'Team size')}{txt('monthly_revenue', 'Monthly revenue')}{txt('leads_per_day', 'Leads per day')}{txt('reply_method', 'How do they reply?')}
              {txt('missed_leads', 'Missed leads')}{txt('other_courses', 'Other courses attended')}{txt('not_interested_reason', 'Not interested: reason')}{txt('result', 'Follow-up result')}
              <div className="field"><label>Closed date</label><DatePicker value={edit.closed_date ?? ''} onChange={(v) => set('closed_date', v)} /></div>
            </div>
            {(edit.purchased || edit.aigoal_tags?.length) ? (
              <div className="field"><label>From app.aigoal.ai {edit.aigoal_status && `· status: ${edit.aigoal_status}`}</label>
                <div className="row" style={{ gap: '.35rem' }}>
                  {edit.purchased && <span className="tag good"><BadgeCheck size={12} />Purchased</span>}
                  {(edit.aigoal_tags ?? []).map((t) => <span key={t} className="tag">{t}</span>)}
                </div>
              </div>
            ) : null}
            <div className="field"><label>Lead channels</label>
              <div className="row" style={{ gap: '.9rem' }}>{CHANNELS.map((c) => (
                <label key={c} className="check"><input type="checkbox" checked={edit.channels?.includes(c) ?? false} onChange={(e) => set('channels', e.target.checked ? [...(edit.channels ?? []), c] : (edit.channels ?? []).filter((x) => x !== c))} />{c}</label>
              ))}</div>
            </div>
            <div className="row" style={{ gap: '1.2rem' }}>
              <label className="check"><input type="checkbox" checked={edit.called ?? false} onChange={(e) => set('called', e.target.checked)} />Called</label>
              <label className="check"><input type="checkbox" checked={edit.not_available ?? false} onChange={(e) => set('not_available', e.target.checked)} />Not available</label>
              <label className="check"><input type="checkbox" checked={edit.prospect ?? false} onChange={(e) => set('prospect', e.target.checked)} />Prospect (准顾客)</label>
            </div>
            <div className="form-grid" style={{ marginTop: '.4rem' }}>
              <div className="field"><label>Status</label><Select block value={edit.lead_status ?? ''} onChange={(v) => setEdit({ ...edit, lead_status: (v || null) as Customer['lead_status'], status_remark: v === 'pending_management' ? edit.status_remark : null })} options={[{ value: '', label: 'No status' }, ...LEAD_STATUS.map(({ value, label }) => ({ value, label }))]} /></div>
              {edit.lead_status === 'pending_management' && <div className="field"><label>Remark (required for Pending Management)</label><textarea value={edit.status_remark ?? ''} onChange={(e) => set('status_remark', e.target.value)} style={{ minHeight: 60 }} /></div>}
            </div>
            <div className="field" style={{ marginTop: '.9rem' }}><label>Notes</label><textarea value={edit.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></div>
            {err && <div className="alert">{err}</div>}
            <div className="modal-foot">
              <button className="primary"><Save size={16} />Save</button>
              {edit.id && isAdmin && <button type="button" className="danger" onClick={del}><Trash2 size={16} />Delete</button>}
            </div>
          </form>
          {edit.id && <AuditTrail table="customers" recordId={edit.id} />}
        </Modal>
      )}
      {ask && (
        <Modal title="Pending Management" onClose={() => setAsk(null)}>
          <p className="muted" style={{ marginTop: 0 }}>What is {ask.row.name} waiting on Management for? A remark is required.</p>
          <div className="field"><textarea autoFocus value={ask.remark} onChange={(e) => setAsk({ ...ask, remark: e.target.value })} placeholder="e.g. Needs special pricing approval from Management" /></div>
          <div className="modal-foot"><button className="primary" disabled={!ask.remark.trim()} onClick={saveAsk}><Save size={16} />Save status</button></div>
        </Modal>
      )}
    </>
  )
}
