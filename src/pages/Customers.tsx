import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Mic, UserCheck, Package, BadgeCheck, CalendarSync, ClipboardList, Video, Flame, History, Hourglass, Lock, MessageCircle, MessageSquare, Pencil, PhoneCall, PhoneOff, Plus, Save, Star, Timer, Trash2, UserRound, Users } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useStaff } from '../lib/useStaff'
import { today } from '../lib/util'
import { useProducts } from '../lib/products'
import ProductsManager from '../components/ProductsManager'
import VoiceUpdate from '../components/VoiceUpdate'
import AssignLeads from '../components/AssignLeads'
import BookingPicker from '../components/BookingPicker'
import { ago } from '../lib/audit'
import Modal from '../components/Modal'
import CsvImport from '../components/CsvImport'
import AuditTrail from '../components/AuditTrail'
import AccountNotes from '../components/AccountNotes'
import { Alert, DatePicker, Empty, Msg, PageHeader, Pagination, PriorityBadge, SearchBox, Select, Stat, usePaged } from '../components/ui'
import { applyOwner, ownerOptions, ownerValue } from '../lib/owners'
import type { Customer, DemoBooking } from '../lib/types'

const PRI = [
  { value: 'P1', label: 'P1 · Hot (热单)' }, { value: 'P2', label: 'P2 · Attended, left early' },
  { value: 'P3', label: 'P3 · Missed, replied YES' }, { value: 'P4', label: 'P4 · No response' },
]
const LEAD_STATUS: { value: Exclude<Customer['lead_status'], null>; label: string; tag: string }[] = [
  { value: 'pending_management', label: 'Pending Management', tag: 'warn' },
  { value: 'pending_demo', label: 'Pending Demo', tag: 'brand' },
  { value: 'pending_consultation', label: 'Pending Consultation', tag: 'brand' },
  { value: 'invite_webinar', label: 'Invite Webinar', tag: '' },
  { value: 'potential', label: 'Potential', tag: 'brand' },
  { value: 'close_deal', label: 'Close Deal', tag: 'good' },
]
// "Purchased" means exactly one thing: the status is Close Deal (tile, filter and tag all use this)
const isBought = (r: Pick<Customer, 'lead_status'>) => r.lead_status === 'close_deal'
const TIMES = Array.from({ length: 26 }, (_, i) => { const m = 8 * 60 + i * 30; const h = Math.floor(m / 60), mm = m % 60; return { value: `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, label: `${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}` } })
const timeLabel = (v?: string | null) => TIMES.find((t) => t.value === v)?.label ?? v ?? ''
const niceDay = (d?: string | null) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '')
const nextWednesdays = (n = 5) => { const out: string[] = []; const d = new Date(); d.setHours(12); while (out.length < n) { d.setDate(d.getDate() + 1); if (d.getDay() === 3) out.push(d.toISOString().slice(0, 10)) } return out }
const todayKL = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' })
const NEEDS_REASON = ['pending_management', 'potential']
const statusOf = (v: string | null) => LEAD_STATUS.find((s) => s.value === v)
const STATUS_OPTS = [{ value: '', label: 'No status' }, ...LEAD_STATUS.map(({ value, label }) => ({ value, label }))]
const CHANNELS = ['Facebook', 'Instagram', 'WhatsApp', 'Telegram', '小红书', 'Website', 'Tiktok']
const blank: Partial<Customer> = { priority: 'P4', name: '', channels: [] }
const pk = (r: Record<string, string>, ...k: string[]) => k.map((x) => r[x]).find((v) => v) || null
const yes = (v: string | null) => !!v && /^(y|yes|true|f|✓|1)/i.test(v.trim())
const EDITABLE: (keyof Customer)[] = ['webinar_invite_date', 'name', 'phone', 'email', 'industry', 'batch', 'priority', 'owner_id', 'owner_name', 'repeat_from', 'called', 'not_available', 'not_interested_reason',
  'team_size', 'monthly_revenue', 'leads_per_day', 'reply_method', 'missed_leads', 'channels', 'other_courses', 'result', 'prospect', 'lead_status', 'status_remark']

export default function Customers() {
  const { isAdmin, profile } = useAuth()
  const viewAll = isAdmin || !!profile?.can_view_all_leads   // may see every lead (editing stays with the assigned sales person)
  const canEditRow = (r: Partial<Customer>) => isAdmin || !r.id || r.owner_id === profile?.id
  const staff = useStaff()
  const { products, reload: reloadProducts } = useProducts()
  const [prodOpen, setProdOpen] = useState(false)
  const [sel, setSel] = useState<string[]>([])
  const [voice, setVoice] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [book, setBook] = useState<{ id: string; name: string; kind: 'demo' | 'consultation' } | null>(null)
  const productPrice = (n: string | null | undefined) => products.find((p) => p.name === n)?.price ?? null
  const PRODUCT_OPTS = products.filter((p) => p.active).map((p) => ({ value: p.name, label: p.name, hint: `RM ${p.price}` }))
  const [params] = useSearchParams()
  const [rows, setRows] = useState<Customer[]>([])
  const [q, setQ] = useState('')
  const [pri, setPri] = useState('all')
  const [batch, setBatch] = useState('all')
  const [owner, setOwner] = useState(params.get('owner') ?? 'all')
  const [statusF, setStatusF] = useState(params.get('status') ?? 'all')
  const [buy, setBuy] = useState(params.get('buy') ?? 'all')
  const [ask, setAsk] = useState<{ row: Customer; status: string; remark: string; demoBy: string; demoDate: string; demoTime: string; inviteDate: string; product: string; closeDate: string } | null>(null)
  const [toast, setToast] = useState('')
  const [demos, setDemos] = useState<DemoBooking[]>([])
  const [edit, setEdit] = useState<Partial<Customer> | null>(null)
  const [tab, setTab] = useState<'details' | 'followup' | 'history'>('details')
  const [err, setErr] = useState('')

  const load = async () => {
    const all: Customer[] = []
    for (let from = 0; ; from += 1000) { // page past the 1000-row API limit
      const { data } = await supabase.from('customers').select('*').order('priority').order('name').range(from, from + 999)
      all.push(...((data ?? []) as Customer[]))
      if (!data || data.length < 1000) break
    }
    // Staff see a webinar's leads from the day after it has taken place (21 Oct shows from 22 Oct); Admin sees every webinar, upcoming ones marked
    setRows(isAdmin ? all : all.filter((r) => !r.batch_date || r.batch_date < today()))
    const { data: d } = await supabase.from('demo_bookings').select('*').order('start_at', { ascending: false })
    setDemos((d ?? []) as DemoBooking[])
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
    (pri === 'all' || r.priority === pri) && (statusF === 'all' || (statusF === 'none' ? !r.lead_status : r.lead_status === statusF)) && (buy === 'all' || (buy === 'yes') === isBought(r)) && (batch === 'all' || r.batch === batch) &&
    (owner === 'all' || (owner === 'none' ? !ownerOf(r) : ownerOf(r) === owner)) &&
    (!q || [r.name, r.phone, r.email, r.industry].join(' ').toLowerCase().includes(q.toLowerCase())))
  const count = (p: string) => shown.filter((r) => r.priority === p).length
  const closed = shown.filter(isBought).length
  const statusCount = (v: string) => rows.filter((r) => r.lead_status === v).length

  // demo = the booking made in the AIGOAL calendar (upcoming one first, else the latest)
  const demoOf = (id: string) => { const l = demos.filter((d) => d.customer_id === id && d.status !== 'cancelled'); return l.find((d) => new Date(d.start_at) >= new Date(Date.now() - 3600e3) && d.status !== 'completed') ?? l[0] }
  const demoWhen = (d: DemoBooking) => new Date(d.start_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kuala_Lumpur' })
  const ownerOpts = ownerOptions(staff.filter((x) => x.is_sales || x.role === 'admin'), owners)
  const ownerVal = ownerValue(edit ?? {})
  const { rows: pageRows, pager } = usePaged(shown, JSON.stringify([q, pri, batch, owner, buy, statusF]))

  // ───── status changes (inline in the table) ─────
  const changeStatus = async (row: Customer, v: string) => {
    if (['pending_management', 'potential', 'invite_webinar'].includes(v))
      return setAsk({ row, status: v, remark: row.lead_status === v ? row.status_remark ?? '' : '', demoBy: '', demoDate: '', demoTime: '', inviteDate: row.webinar_invite_date ?? '', product: '', closeDate: '' })
    if (v === 'pending_demo' || v === 'pending_consultation') return setBook({ id: row.id, name: row.name, kind: v === 'pending_demo' ? 'demo' : 'consultation' })
    if (v === 'close_deal') return setAsk({ row, status: v, remark: '', demoBy: '', demoDate: '', demoTime: '', inviteDate: '', product: '', closeDate: todayKL() })
    const { error } = await supabase.from('customers').update({ lead_status: v || null }).eq('id', row.id)
    setToast(error ? error.message : ''); load()
  }
  const askReady = !!ask && (ask.status === 'close_deal' ? !!ask.product && !!ask.closeDate : NEEDS_REASON.includes(ask.status) ? !!ask.remark.trim() : !!ask.inviteDate)
  const saveAsk = async () => {
    if (!ask || !askReady) return
    const patch: Record<string, unknown> = { lead_status: ask.status }
    if (NEEDS_REASON.includes(ask.status)) patch.status_remark = ask.remark.trim()
    if (ask.status === 'invite_webinar') patch.webinar_invite_date = ask.inviteDate
    if (ask.status === 'close_deal') { patch.deal_product = ask.product; patch.deal_amount = productPrice(ask.product); patch.closed_date = ask.closeDate }
    const { error } = await supabase.from('customers').update(patch).eq('id', ask.row.id)
    if (error) return setToast(error.message)
    setAsk(null); setToast(''); load()
  }

  // ───── modal ─────
  const open = (r: Partial<Customer>, t: typeof tab = 'details') => { setEdit(r); setTab(t); setErr('') }
  const set = (k: keyof Customer, v: any) => setEdit({ ...edit, [k]: v })
  const save = async (e?: FormEvent) => {
    e?.preventDefault(); if (!edit) return
    if (edit.lead_status && NEEDS_REASON.includes(edit.lead_status) && !edit.status_remark?.trim()) { setTab('followup'); return setErr(`${statusOf(edit.lead_status)?.label} needs a reason.`) }
    if (edit.lead_status === 'invite_webinar' && !edit.webinar_invite_date) { setTab('followup'); return setErr('Invite Webinar needs the webinar date.') }
    const payload: Record<string, unknown> = {}
    EDITABLE.forEach((k) => { payload[k] = (edit as any)[k] ?? null })
    if (edit.lead_status === 'close_deal') { if (!edit.deal_product) { setTab('followup'); return setErr('Choose the product that was closed.') } payload.deal_product = edit.deal_product; payload.deal_amount = productPrice(edit.deal_product); payload.closed_date = edit.closed_date || todayKL() }
    payload.channels = edit.channels ?? []; payload.called = !!edit.called; payload.not_available = !!edit.not_available; payload.prospect = !!edit.prospect
    const { error } = edit.id ? await supabase.from('customers').update(payload).eq('id', edit.id) : await supabase.from('customers').insert(payload)
    if (error) return setErr(error.message)
    setEdit(null); setErr(''); load()
  }
  const del = async () => { if (edit?.id && confirm('Delete this customer?')) { await supabase.from('customers').delete().eq('id', edit.id); setEdit(null); load() } }
  const txt = (k: keyof Customer, label: string, locked = false) => (
    <div className="field"><label>{label} {locked && !isAdmin && <Lock size={11} className="i" />}</label><input disabled={locked && !isAdmin} value={(edit?.[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} /></div>
  )
  const viewOnly = !!edit?.id && !canEditRow(edit)
  const live = edit?.id ? rows.find((r) => r.id === edit.id) : undefined
  const chip = (on: boolean, label: string, onClick: () => void) => <button type="button" className={'chip' + (on ? ' on' : '')} onClick={onClick}>{label}</button>
  const waLink = (p?: string | null) => (p ? `https://wa.me/${p.replace(/\D/g, '')}` : null)

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
      <PageHeader title={viewAll ? 'Follow-Up Customers' : 'My Follow-Up Customers'} sub={viewAll ? (isAdmin ? 'Main list. Each sales person only sees the leads assigned to them.' : 'All leads. You can edit the ones assigned to you; the rest are view only.') : 'Leads assigned to you.'}>
        <button onClick={() => setVoice(true)}><Mic size={16} />Voice update</button>
        {isAdmin && <CsvImport onRows={importRows} />}
        {isAdmin && <button onClick={() => setAssignOpen(true)}><UserCheck size={16} />Assign leads</button>}
        {isAdmin && <button onClick={() => setProdOpen(true)}><Package size={16} />Products</button>}
        {isAdmin && <button className="primary" onClick={() => open({ ...blank })}><Plus size={16} />Add customer</button>}
      </PageHeader>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <Stat icon={Flame} tone="red" label="P1 · Hot" value={count('P1')} active={pri === 'P1'} onClick={() => setPri(pri === 'P1' ? 'all' : 'P1')} />
        <Stat icon={Timer} tone="orange" label="P2 · Left early" value={count('P2')} active={pri === 'P2'} onClick={() => setPri(pri === 'P2' ? 'all' : 'P2')} />
        <Stat icon={MessageCircle} tone="yellow" label="P3 · Replied YES" value={count('P3')} active={pri === 'P3'} onClick={() => setPri(pri === 'P3' ? 'all' : 'P3')} />
        <Stat icon={Hourglass} tone="gray" label="P4 · No response" value={count('P4')} active={pri === 'P4'} onClick={() => setPri(pri === 'P4' ? 'all' : 'P4')} />
        <Stat icon={BadgeCheck} tone="green" label="Purchased / closed" value={closed} active={buy === 'yes'} onClick={() => setBuy(buy === 'yes' ? 'all' : 'yes')} />
      </div>
      <div className="row" style={{ marginBottom: '1rem' }}>
        <SearchBox value={q} onChange={setQ} placeholder="Search name, phone, email…" />
        <Select value={pri} onChange={setPri} options={[{ value: 'all', label: 'All priorities' }, ...PRI]} />
        <Select value={batch} onChange={setBatch} options={[{ value: 'all', label: 'All webinars', hint: String(rows.length) }, ...batches.map((b) => ({ value: b.label, label: b.label, hint: String(b.n) }))]} />
        <Select value={statusF} onChange={setStatusF} options={[{ value: 'all', label: 'Any status' }, ...LEAD_STATUS.map(({ value, label }) => ({ value, label, hint: String(statusCount(value)) })), { value: 'none', label: 'No status' }]} />
        {viewAll && <Select value={owner} onChange={setOwner} options={[{ value: 'all', label: 'All sales' }, { value: 'none', label: 'Unassigned' }, ...owners.map((n) => ({ value: n, label: n, hint: String(rows.filter((r) => ownerOf(r) === n).length) }))]} />}
        <span className="muted sm-text">{shown.length} customers</span>
        <Msg text={toast} />
      </div>

      {isAdmin && sel.length > 0 && (
        <div className="alert ok" style={{ alignItems: 'center', gap: '.7rem', flexWrap: 'wrap' }}>
          <b>{sel.length} selected</b>
          {sel.length < shown.length && <button className="sm" onClick={() => setSel(shown.map((r) => r.id))}>Select all {shown.length} shown</button>}
          <span style={{ flex: 1 }} />
          <button className="primary sm" onClick={() => setAssignOpen(true)}><UserCheck size={15} />Assign leads</button>
          <button className="sm" onClick={() => setSel([])}>Clear</button>
        </div>
      )}
      <div className="card flush table-wrap">
        <table>
          <thead><tr>{isAdmin && <th style={{ width: 40 }}><input type="checkbox" aria-label="Select this page" checked={pageRows.length > 0 && pageRows.every((r) => sel.includes(r.id))} onChange={(e) => setSel(e.target.checked ? [...new Set([...sel, ...pageRows.map((r) => r.id)])] : sel.filter((id) => !pageRows.some((r) => r.id === id)))} style={{ width: 'auto' }} /></th>}<th>Priority</th><th>Name</th><th>Phone</th><th>Industry</th>{viewAll && <th>Sales</th>}<th>Webinar</th><th>Call</th><th style={{ minWidth: 200 }}>Status</th><th className="sticky-end" style={{ width: 52 }}></th></tr></thead>
          <tbody>
            {pageRows.map((r) => {
              const st = statusOf(r.lead_status)
              return (
                <tr key={r.id} className={'click' + (sel.includes(r.id) ? ' picked' : '')} onClick={() => open(r)}>
                  {isAdmin && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={'Select ' + r.name} checked={sel.includes(r.id)} onChange={(e) => setSel(e.target.checked ? [...sel, r.id] : sel.filter((id) => id !== r.id))} style={{ width: 'auto' }} /></td>}
                  <td><PriorityBadge p={r.priority} /></td>
                  <td><span className="cell-title">{r.name}</span> {isBought(r) && <span className="tag good"><BadgeCheck size={12} />Purchased</span>} {r.prospect && <Star size={14} className="i" style={{ color: '#eab308' }} />}</td>
                  <td>{r.phone && <a href={waLink(r.phone)!} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{r.phone}</a>}</td>
                  <td>{r.industry}</td>{viewAll && <td>{ownerOf(r) || <span className="muted">—</span>}</td>}<td>{r.batch}{isAdmin && r.batch_date && r.batch_date >= today() && <span className="tag brand" style={{ marginLeft: 6 }} title="Staff cannot see this webinar until the day after it">Upcoming</span>}</td>
                  <td>{r.called ? <PhoneCall size={16} className="i" style={{ color: 'var(--ok)' }} /> : r.not_available ? <PhoneOff size={16} className="i" style={{ color: 'var(--muted)' }} /> : null}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <Select value={r.lead_status ?? ''} disabled={!canEditRow(r)} onChange={(v) => changeStatus(r, v)} placeholder="Set status" options={STATUS_OPTS} />
                    {r.lead_status && NEEDS_REASON.includes(r.lead_status) && r.status_remark && <div className="muted sm-text clamp2" style={{ maxWidth: 230, marginTop: 3 }} title={r.status_remark}>{r.status_remark}</div>}
                    {(r.lead_status === 'pending_demo' || r.lead_status === 'pending_consultation') && (() => { const d = demoOf(r.id); const k = r.lead_status === 'pending_consultation' ? 'Consultation' : 'Demo'; return <div className="muted sm-text" style={{ marginTop: 3 }}>{d ? <>{k}: <b>{d.staff_name ?? 'TBC'}</b> · {demoWhen(d)}</> : 'Not booked in AIGOAL yet'}</div> })()}
                    {r.lead_status === 'invite_webinar' && <div className="muted sm-text" style={{ marginTop: 3 }}>Invite to <b>{niceDay(r.webinar_invite_date)}</b> webinar</div>}
                    {r.lead_status === 'close_deal' && <div className="muted sm-text" style={{ marginTop: 3 }}>{r.deal_product && <><b>{r.deal_product}</b> · </>}Closed by <b>{r.closed_by_name}</b>{r.closed_date && ` · ${niceDay(r.closed_date)}`}</div>}
                  </td>
                  <td className="sticky-end"><Pencil size={15} className="i" style={{ color: 'var(--muted)' }} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!shown.length && <Empty icon={Users} title="No customers found">{isAdmin ? 'Add one, import a CSV, or adjust the filters.' : 'Nothing assigned to you yet.'}</Empty>}
        <Pagination pager={pager} />
      </div>

      {edit && (
        <Modal wide title={edit.name || 'New customer'}
          sub={edit.id ? <>
            <PriorityBadge p={edit.priority ?? 'P4'} />
            {edit.batch && <span className="tag">Webinar {edit.batch}</span>}
            {ownerOf(edit as Customer) && <span className="tag">Sales: {ownerOf(edit as Customer)}</span>}
            {statusOf(live?.lead_status ?? null) && <span className={'tag ' + statusOf(live?.lead_status ?? null)!.tag}>{statusOf(live?.lead_status ?? null)!.label}</span>}
            {live && isBought(live) && <span className="tag good"><BadgeCheck size={11} />Purchased</span>}
          </> : undefined}
          onClose={() => setEdit(null)}>
          {edit.id && (
            <div className="modal-tabs">
              <button className={tab === 'details' ? 'on' : ''} onClick={() => setTab('details')}><UserRound size={15} className="i" /> Customer details</button>
              <button className={tab === 'followup' ? 'on' : ''} onClick={() => setTab('followup')}><MessageSquare size={15} className="i" /> Sales follow-up</button>
              <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}><History size={15} className="i" /> History</button>
            </div>
          )}

          {viewOnly && <div className="lockbar"><Lock size={13} /> View only: this lead is assigned to {ownerOf(edit as Customer) || 'someone else'}. Only they (or Admin) can change it.</div>}
          <form onSubmit={save}><fieldset disabled={viewOnly} className="plain-fs">
            {tab === 'details' && (
              <>
                <div className="sect">
                  <h3><UserRound size={14} /> Contact</h3>
                  {!isAdmin && edit.id && <div className="lockbar"><Lock size={13} /> Priority, assigned sales, webinar, name, phone and email can only be changed by Admin.</div>}
                  <div className="form-grid">
                    {txt('name', 'Name', true)}
                    <div className="field"><label>Phone {!isAdmin && <Lock size={11} className="i" />}</label>
                      <div className="row" style={{ flexWrap: 'nowrap', gap: '.4rem' }}>
                        <input style={{ flex: 1 }} disabled={!isAdmin} value={edit.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
                        {waLink(edit.phone) && <a className="btn" href={waLink(edit.phone)!} target="_blank" rel="noreferrer"><MessageCircle size={15} />WhatsApp</a>}
                      </div></div>
                    {txt('email', 'Email', true)}
                    <div className="field"><label>Priority {!isAdmin && <Lock size={11} className="i" />}</label><Select block disabled={!isAdmin} value={edit.priority ?? 'P4'} onChange={(v) => set('priority', v)} options={PRI} /></div>
                    <div className="field"><label>Assigned sales {!isAdmin && <Lock size={11} className="i" />}</label><Select block disabled={!isAdmin} value={ownerVal} onChange={(v) => setEdit(applyOwner(edit!, v, staff))} options={ownerOpts} /></div>
                    {txt('batch', 'Webinar', true)}
                  </div>
                </div>
                <div className="sect">
                  <h3><ClipboardList size={14} /> Business profile</h3>
                  <div className="form-grid">
                    {txt('industry', 'Industry')}{txt('team_size', 'Team size')}{txt('monthly_revenue', 'Monthly revenue')}
                    {txt('leads_per_day', 'Leads per day')}{txt('reply_method', 'How do they reply?')}{txt('missed_leads', 'Missed leads')}
                    {txt('other_courses', 'Other courses attended')}
                  </div>
                  <div className="field"><label>Where do their leads come from?</label>
                    <div className="chips">{CHANNELS.map((c) => chip(edit.channels?.includes(c) ?? false, c, () => set('channels', edit.channels?.includes(c) ? (edit.channels ?? []).filter((x) => x !== c) : [...(edit.channels ?? []), c])))}</div></div>
                </div>
              </>
            )}

            {tab === 'followup' && (
              <>
                <div className="sect">
                  <h3><Flame size={14} /> Status</h3>
                  <div className="form-grid">
                    <div className="field"><label>Status</label><Select block value={edit.lead_status ?? ''} onChange={(v) => setEdit({ ...edit, lead_status: (v || null) as Customer['lead_status'], status_remark: NEEDS_REASON.includes(v) ? edit.status_remark : null })} options={STATUS_OPTS} /></div>
                    {edit.lead_status && NEEDS_REASON.includes(edit.lead_status) && (
                      <div className="field"><label>{edit.lead_status === 'potential' ? 'Why is this a potential customer?' : 'What is Management needed for?'} (required)</label>
                        <textarea style={{ minHeight: 70 }} value={edit.status_remark ?? ''} onChange={(e) => set('status_remark', e.target.value)} /></div>
                    )}
                  </div>
                  {edit.id && (edit.lead_status === 'pending_demo' || edit.lead_status === 'pending_consultation' || demoOf(edit.id)) && (() => { const d = demoOf(edit.id!); return (
                    <div className="pend none" style={{ marginBottom: '.8rem' }}>
                      <div>
                        <b><CalendarSync size={14} className="i" /> {d?.kind === 'consultation' || edit.lead_status === 'pending_consultation' ? 'Consultation' : 'Demo'} booking (from AIGOAL)</b>
                        {d ? <div className="sm-text" style={{ marginTop: 2 }}><b>{d.staff_name ?? 'Staff TBC'}</b> · {demoWhen(d)} <span className={'tag ' + (d.status === 'completed' ? 'good' : 'brand')} style={{ marginLeft: 6 }}>{d.status === 'completed' ? 'Completed' : 'Booked'}</span></div>
                          : <div className="muted sm-text">Nothing is booked in AIGOAL for this customer yet. Once booked, it appears here after the calendar sync.</div>}
                      </div>
                      {edit.id && !d && <button type="button" onClick={() => setBook({ id: edit.id!, name: edit.name ?? '', kind: edit.lead_status === 'pending_consultation' ? 'consultation' : 'demo' })}><CalendarSync size={15} />Book now</button>}
                      {edit.id && !d && <button type="button" onClick={() => setBook({ id: edit.id!, name: edit.name ?? '', kind: edit.lead_status === 'pending_consultation' ? 'consultation' : 'demo' })}><CalendarSync size={15} />Book now</button>}
                      {d?.zoom_url && d.status !== 'completed' && <a className="btn" href={d.zoom_url} target="_blank" rel="noreferrer"><Video size={15} />Zoom</a>}
                    </div>) })()}
                  {edit.lead_status === 'invite_webinar' && (
                    <div className="field"><label>Invite to which webinar? (required)</label>
                      <DatePicker value={edit.webinar_invite_date} clearable={false} onChange={(v) => set('webinar_invite_date', v)} />
                      <div className="chips" style={{ marginTop: '.4rem' }}>{nextWednesdays().map((d) => chip(edit.webinar_invite_date === d, niceDay(d), () => set('webinar_invite_date', d)))}</div></div>
                  )}
                  {edit.lead_status === 'close_deal' && (
                    <div className="pend none" style={{ background: 'var(--ok-soft)', display: 'block' }}>
                      <b><BadgeCheck size={14} className="i" /> Deal closed</b>
                      <div className="muted sm-text" style={{ marginBottom: '.5rem' }}>{live?.lead_status === 'close_deal'
                        ? <>Recorded under <b>{live.closed_by_name}</b>{live.closed_at && ` · ${new Date(live.closed_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`}.</>
                        : <>When you save, it is recorded under your login (<b>{profile?.full_name}</b>).</>}</div>
                      <div className="form-grid">
                        <div className="field"><label>Product closed (required)</label><Select block value={edit.deal_product ?? ''} onChange={(v) => set('deal_product', v || null)} options={PRODUCT_OPTS} placeholder="Choose product" /></div>
                        <div className="field"><label>Date closed</label><DatePicker value={edit.closed_date || todayKL()} clearable={false} onChange={(v) => set('closed_date', v)} /></div>
                      </div>
                    </div>
                  )}
                  <div className="row" style={{ gap: '.5rem', margin: '.2rem 0 .8rem' }}>
                    {chip(!!edit.called, 'Called', () => set('called', !edit.called))}
                    {chip(!!edit.not_available, 'Not available', () => set('not_available', !edit.not_available))}
                    {chip(!!edit.prospect, 'Prospect 准顾客', () => set('prospect', !edit.prospect))}
                  </div>
                  <div className="form-grid">
                    {txt('not_interested_reason', 'Not interested: reason')}{txt('result', 'Follow-up result')}
                  </div>
                </div>
                {edit.id && <AccountNotes accountId={edit.id} table="customer_notes" fk="customer_id" kinds={['followup', 'call', 'remark']} readOnly={viewOnly} />}
                {!edit.id && <p className="muted sm-text">Save the customer first, then add follow-ups here.</p>}
              </>
            )}

            {tab === 'history' && edit.id && <AuditTrail table="customers" recordId={edit.id} />}

            {tab !== 'history' && (
              <>
                {err && <Alert text={err} />}
                {!viewOnly && <div className="modal-foot">
                  <button className="primary"><Save size={16} />Save</button>
                  {edit.id && isAdmin && <button type="button" className="danger" onClick={del}><Trash2 size={16} />Delete</button>}
                </div>}
              </>
            )}
          </fieldset></form>
        </Modal>
      )}

      {voice && <VoiceUpdate page="customer" onClose={() => setVoice(false)} onDone={load} />}
      {assignOpen && <AssignLeads leads={sel.length ? rows.filter((r) => sel.includes(r.id)) : shown} sales={staff.filter((x) => x.is_sales)} onClose={() => { setAssignOpen(false) }} onDone={() => { setSel([]); load() }} />}
      {book && <BookingPicker customer={book} kind={book.kind} onClose={() => setBook(null)} onDone={load} />}
      {prodOpen && <ProductsManager products={products} onClose={() => setProdOpen(false)} onChanged={reloadProducts} />}
      {ask && (
        <Modal title={statusOf(ask.status)?.label ?? 'Status'} onClose={() => setAsk(null)}>
          {NEEDS_REASON.includes(ask.status) && (<>
            <p className="muted" style={{ marginTop: 0 }}>{ask.status === 'potential' ? `Why is ${ask.row.name} a potential customer?` : `What is ${ask.row.name} waiting on Management for?`} A reason is required.</p>
            <div className="field"><textarea autoFocus value={ask.remark} onChange={(e) => setAsk({ ...ask, remark: e.target.value })} placeholder={ask.status === 'potential' ? 'e.g. Owner has 20 staff and is keen on a demo next week' : 'e.g. Needs special pricing approval from Management'} /></div>
          </>)}
          {ask.status === 'invite_webinar' && (<>
            <p className="muted" style={{ marginTop: 0 }}>Which webinar is {ask.row.name} being invited to?</p>
            <div className="field"><label>Webinar date</label><DatePicker value={ask.inviteDate} clearable={false} onChange={(v) => setAsk({ ...ask, inviteDate: v })} />
              <div className="chips" style={{ marginTop: '.5rem' }}>{nextWednesdays().map((d) => chip(ask.inviteDate === d, niceDay(d), () => setAsk({ ...ask, inviteDate: d })))}</div></div>
          </>)}
          {ask.status === 'close_deal' && (<>
            <p className="muted" style={{ marginTop: 0 }}>Closing {ask.row.name}. It is recorded under your login ({profile?.full_name}).</p>
            <div className="field"><label>Product closed</label><Select block value={ask.product} onChange={(v) => setAsk({ ...ask, product: v })} options={PRODUCT_OPTS} placeholder="Choose product" /></div>
            <div className="field"><label>Date closed</label><DatePicker value={ask.closeDate} clearable={false} onChange={(v) => setAsk({ ...ask, closeDate: v })} /></div>
          </>)}
          <div className="modal-foot"><button className="primary" disabled={!askReady} onClick={saveAsk}><Save size={16} />Save status</button></div>
        </Modal>
      )}
    </>
  )
}
