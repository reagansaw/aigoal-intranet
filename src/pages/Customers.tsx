import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BadgeCheck, ClipboardList, Flame, History, Hourglass, Lock, MessageCircle, MessageSquare, Pencil, PhoneCall, PhoneOff, Plus, Save, Star, Timer, Trash2, UserRound, Users } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useStaff } from '../lib/useStaff'
import { today } from '../lib/util'
import { ago } from '../lib/audit'
import Modal from '../components/Modal'
import CsvImport from '../components/CsvImport'
import AuditTrail from '../components/AuditTrail'
import AccountNotes from '../components/AccountNotes'
import { Alert, DatePicker, Empty, Msg, PageHeader, Pagination, PriorityBadge, SearchBox, Select, Stat, usePaged } from '../components/ui'
import { applyOwner, ownerOptions, ownerValue } from '../lib/owners'
import type { Customer } from '../lib/types'

const PRI = [
  { value: 'P1', label: 'P1 · Hot (热单)' }, { value: 'P2', label: 'P2 · Attended, left early' },
  { value: 'P3', label: 'P3 · Missed, replied YES' }, { value: 'P4', label: 'P4 · No response' },
]
const LEAD_STATUS: { value: Exclude<Customer['lead_status'], null>; label: string; tag: string }[] = [
  { value: 'pending_management', label: 'Pending Management', tag: 'warn' },
  { value: 'pending_demo', label: 'Pending Demo', tag: 'brand' },
  { value: 'invite_webinar', label: 'Invite Webinar', tag: '' },
  { value: 'potential', label: 'Potential', tag: 'brand' },
  { value: 'close_deal', label: 'Close Deal', tag: 'good' },
]
// One definition of "purchased" for the tile, the filter and the tag: flagged Won by the app, closed here, or marked bought in the sheets
const isBought = (r: Pick<Customer, 'purchased' | 'lead_status' | 'closed_date' | 'result'>) =>
  r.purchased || r.lead_status === 'close_deal' || !!r.closed_date || /成交|bought|purchased/i.test(r.result ?? '')
const TIMES = Array.from({ length: 26 }, (_, i) => { const m = 8 * 60 + i * 30; const h = Math.floor(m / 60), mm = m % 60; return { value: `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, label: `${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}` } })
const timeLabel = (v?: string | null) => TIMES.find((t) => t.value === v)?.label ?? v ?? ''
const niceDay = (d?: string | null) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '')
const nextWednesdays = (n = 5) => { const out: string[] = []; const d = new Date(); d.setHours(12); while (out.length < n) { d.setDate(d.getDate() + 1); if (d.getDay() === 3) out.push(d.toISOString().slice(0, 10)) } return out }
const NEEDS_REASON = ['pending_management', 'potential']
const statusOf = (v: string | null) => LEAD_STATUS.find((s) => s.value === v)
const STATUS_OPTS = [{ value: '', label: 'No status' }, ...LEAD_STATUS.map(({ value, label }) => ({ value, label }))]
const CHANNELS = ['Facebook', 'Instagram', 'WhatsApp', 'Telegram', '小红书', 'Website', 'Tiktok']
const blank: Partial<Customer> = { priority: 'P4', name: '', channels: [] }
const pk = (r: Record<string, string>, ...k: string[]) => k.map((x) => r[x]).find((v) => v) || null
const yes = (v: string | null) => !!v && /^(y|yes|true|f|✓|1)/i.test(v.trim())
const EDITABLE: (keyof Customer)[] = ['demo_by_id', 'demo_by_name', 'demo_date', 'demo_time', 'webinar_invite_date', 'name', 'phone', 'email', 'industry', 'batch', 'priority', 'owner_id', 'owner_name', 'repeat_from', 'called', 'not_available', 'not_interested_reason',
  'team_size', 'monthly_revenue', 'leads_per_day', 'reply_method', 'missed_leads', 'channels', 'other_courses', 'result', 'prospect', 'lead_status', 'status_remark']

export default function Customers() {
  const { isAdmin, profile } = useAuth()
  const staff = useStaff()
  const [params] = useSearchParams()
  const [rows, setRows] = useState<Customer[]>([])
  const [q, setQ] = useState('')
  const [pri, setPri] = useState('all')
  const [batch, setBatch] = useState('all')
  const [owner, setOwner] = useState(params.get('owner') ?? 'all')
  const [statusF, setStatusF] = useState(params.get('status') ?? 'all')
  const [buy, setBuy] = useState('all')
  const [ask, setAsk] = useState<{ row: Customer; status: string; remark: string; demoBy: string; demoDate: string; demoTime: string; inviteDate: string } | null>(null)
  const [toast, setToast] = useState('')
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
    (pri === 'all' || r.priority === pri) && (statusF === 'all' || (statusF === 'none' ? !r.lead_status : r.lead_status === statusF)) && (buy === 'all' || (buy === 'yes') === isBought(r)) && (batch === 'all' || r.batch === batch) &&
    (owner === 'all' || (owner === 'none' ? !ownerOf(r) : ownerOf(r) === owner)) &&
    (!q || [r.name, r.phone, r.email, r.industry].join(' ').toLowerCase().includes(q.toLowerCase())))
  const count = (p: string) => shown.filter((r) => r.priority === p).length
  const closed = shown.filter(isBought).length
  const statusCount = (v: string) => rows.filter((r) => r.lead_status === v).length

  const ownerOpts = ownerOptions(staff.filter((x) => x.is_sales || x.role === 'admin'), owners)
  const ownerVal = ownerValue(edit ?? {})
  const { rows: pageRows, pager } = usePaged(shown, JSON.stringify([q, pri, batch, owner, buy, statusF]))

  // ───── status changes (inline in the table) ─────
  const changeStatus = async (row: Customer, v: string) => {
    if (['pending_management', 'potential', 'pending_demo', 'invite_webinar'].includes(v))
      return setAsk({ row, status: v, remark: row.lead_status === v ? row.status_remark ?? '' : '', demoBy: row.demo_by_id ?? '', demoDate: row.demo_date ?? '', demoTime: row.demo_time ?? '', inviteDate: row.webinar_invite_date ?? '' })
    if (v === 'close_deal' && !confirm(`Close this deal? It will be recorded under your login (${profile?.full_name}) today.`)) return
    const { error } = await supabase.from('customers').update({ lead_status: v || null }).eq('id', row.id)
    setToast(error ? error.message : ''); load()
  }
  const askReady = !!ask && (NEEDS_REASON.includes(ask.status) ? !!ask.remark.trim() : ask.status === 'pending_demo' ? !!(ask.demoBy && ask.demoDate && ask.demoTime) : !!ask.inviteDate)
  const saveAsk = async () => {
    if (!ask || !askReady) return
    const patch: Record<string, unknown> = { lead_status: ask.status }
    if (NEEDS_REASON.includes(ask.status)) patch.status_remark = ask.remark.trim()
    if (ask.status === 'pending_demo') Object.assign(patch, { demo_by_id: ask.demoBy, demo_by_name: staff.find((s) => s.id === ask.demoBy)?.full_name ?? null, demo_date: ask.demoDate, demo_time: ask.demoTime })
    if (ask.status === 'invite_webinar') patch.webinar_invite_date = ask.inviteDate
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
    if (edit.lead_status === 'pending_demo' && !(edit.demo_by_id && edit.demo_date && edit.demo_time)) { setTab('followup'); return setErr('Pending Demo needs who will demo, the date and the time.') }
    if (edit.lead_status === 'invite_webinar' && !edit.webinar_invite_date) { setTab('followup'); return setErr('Invite Webinar needs the webinar date.') }
    const payload: Record<string, unknown> = {}
    EDITABLE.forEach((k) => { payload[k] = (edit as any)[k] ?? null })
    payload.channels = edit.channels ?? []; payload.called = !!edit.called; payload.not_available = !!edit.not_available; payload.prospect = !!edit.prospect
    const { error } = edit.id ? await supabase.from('customers').update(payload).eq('id', edit.id) : await supabase.from('customers').insert(payload)
    if (error) return setErr(error.message)
    setEdit(null); setErr(''); load()
  }
  const del = async () => { if (edit?.id && confirm('Delete this customer?')) { await supabase.from('customers').delete().eq('id', edit.id); setEdit(null); load() } }
  const txt = (k: keyof Customer, label: string, locked = false) => (
    <div className="field"><label>{label} {locked && !isAdmin && <Lock size={11} className="i" />}</label><input disabled={locked && !isAdmin} value={(edit?.[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} /></div>
  )
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
      <PageHeader title={isAdmin ? 'Follow-Up Customers' : 'My Follow-Up Customers'} sub={isAdmin ? 'Main list. Each sales person only sees the leads assigned to them.' : 'Leads assigned to you.'}>
        {isAdmin && <CsvImport onRows={importRows} />}
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
        {isAdmin && <Select value={owner} onChange={setOwner} options={[{ value: 'all', label: 'All sales' }, { value: 'none', label: 'Unassigned' }, ...owners.map((n) => ({ value: n, label: n, hint: String(rows.filter((r) => ownerOf(r) === n).length) }))]} />}
        <span className="muted sm-text">{shown.length} customers</span>
        <Msg text={toast} />
      </div>

      <div className="card flush table-wrap">
        <table>
          <thead><tr><th>Priority</th><th>Name</th><th>Phone</th><th>Industry</th>{isAdmin && <th>Sales</th>}<th>Webinar</th><th>Call</th><th style={{ minWidth: 200 }}>Status</th><th className="sticky-end" style={{ width: 52 }}></th></tr></thead>
          <tbody>
            {pageRows.map((r) => {
              const st = statusOf(r.lead_status)
              return (
                <tr key={r.id} className="click" onClick={() => open(r)}>
                  <td><PriorityBadge p={r.priority} /></td>
                  <td><span className="cell-title">{r.name}</span> {isBought(r) && <span className="tag good"><BadgeCheck size={12} />Purchased</span>} {r.prospect && <Star size={14} className="i" style={{ color: '#eab308' }} />}</td>
                  <td>{r.phone && <a href={waLink(r.phone)!} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{r.phone}</a>}</td>
                  <td>{r.industry}</td>{isAdmin && <td>{ownerOf(r) || <span className="muted">—</span>}</td>}<td>{r.batch}</td>
                  <td>{r.called ? <PhoneCall size={16} className="i" style={{ color: 'var(--ok)' }} /> : r.not_available ? <PhoneOff size={16} className="i" style={{ color: 'var(--muted)' }} /> : null}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <Select value={r.lead_status ?? ''} onChange={(v) => changeStatus(r, v)} placeholder="Set status" options={STATUS_OPTS} />
                    {r.lead_status && NEEDS_REASON.includes(r.lead_status) && r.status_remark && <div className="muted sm-text clamp2" style={{ maxWidth: 230, marginTop: 3 }} title={r.status_remark}>{r.status_remark}</div>}
                    {r.lead_status === 'pending_demo' && <div className="muted sm-text" style={{ marginTop: 3 }}>Demo: <b>{r.demo_by_name}</b> · {niceDay(r.demo_date)} {timeLabel(r.demo_time)}</div>}
                    {r.lead_status === 'invite_webinar' && <div className="muted sm-text" style={{ marginTop: 3 }}>Invite to <b>{niceDay(r.webinar_invite_date)}</b> webinar</div>}
                    {r.lead_status === 'close_deal' && <div className="muted sm-text" style={{ marginTop: 3 }}>Closed by <b>{r.closed_by_name}</b>{r.closed_at && ` · ${ago(r.closed_at)}`}</div>}
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

          <form onSubmit={save}>
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
                  {edit.lead_status === 'pending_demo' && (
                    <div className="form-grid" style={{ marginBottom: '.4rem' }}>
                      <div className="field"><label>Who will demo? (required)</label><Select block value={edit.demo_by_id ?? ''} placeholder="Choose a person" onChange={(v) => setEdit({ ...edit, demo_by_id: v || null, demo_by_name: staff.find((s) => s.id === v)?.full_name ?? null })} options={staff.map((s) => ({ value: s.id, label: s.full_name || s.email || '' }))} /></div>
                      <div className="field"><label>Demo date (required)</label><DatePicker value={edit.demo_date} clearable={false} onChange={(v) => set('demo_date', v)} /></div>
                      <div className="field"><label>Demo time (required)</label><Select block value={edit.demo_time ?? ''} placeholder="Choose a time" onChange={(v) => set('demo_time', v || null)} options={TIMES} /></div>
                    </div>
                  )}
                  {edit.lead_status === 'invite_webinar' && (
                    <div className="field"><label>Invite to which webinar? (required)</label>
                      <DatePicker value={edit.webinar_invite_date} clearable={false} onChange={(v) => set('webinar_invite_date', v)} />
                      <div className="chips" style={{ marginTop: '.4rem' }}>{nextWednesdays().map((d) => chip(edit.webinar_invite_date === d, niceDay(d), () => set('webinar_invite_date', d)))}</div></div>
                  )}
                  {edit.lead_status === 'close_deal' && (
                    <div className="pend none" style={{ background: 'var(--ok-soft)' }}>
                      <div><b><BadgeCheck size={14} className="i" /> Deal closed</b>
                        <div className="muted sm-text">{live?.lead_status === 'close_deal'
                          ? <>Recorded under <b>{live.closed_by_name}</b>{live.closed_at && ` · ${new Date(live.closed_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`}.</>
                          : <>When you save, it is recorded under your login (<b>{profile?.full_name}</b>) and today's date.</>}</div></div>
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
                {edit.id && <AccountNotes accountId={edit.id} table="customer_notes" fk="customer_id" kinds={['followup', 'call', 'remark']} />}
                {!edit.id && <p className="muted sm-text">Save the customer first, then add follow-ups here.</p>}
              </>
            )}

            {tab === 'history' && edit.id && <AuditTrail table="customers" recordId={edit.id} />}

            {tab !== 'history' && (
              <>
                {err && <Alert text={err} />}
                <div className="modal-foot">
                  <button className="primary"><Save size={16} />Save</button>
                  {edit.id && isAdmin && <button type="button" className="danger" onClick={del}><Trash2 size={16} />Delete</button>}
                </div>
              </>
            )}
          </form>
        </Modal>
      )}

      {ask && (
        <Modal title={statusOf(ask.status)?.label ?? 'Status'} onClose={() => setAsk(null)}>
          {NEEDS_REASON.includes(ask.status) && (<>
            <p className="muted" style={{ marginTop: 0 }}>{ask.status === 'potential' ? `Why is ${ask.row.name} a potential customer?` : `What is ${ask.row.name} waiting on Management for?`} A reason is required.</p>
            <div className="field"><textarea autoFocus value={ask.remark} onChange={(e) => setAsk({ ...ask, remark: e.target.value })} placeholder={ask.status === 'potential' ? 'e.g. Owner has 20 staff and is keen on a demo next week' : 'e.g. Needs special pricing approval from Management'} /></div>
          </>)}
          {ask.status === 'pending_demo' && (<>
            <p className="muted" style={{ marginTop: 0 }}>Who will give {ask.row.name} the demo, and when?</p>
            <div className="form-grid">
              <div className="field"><label>Who will demo?</label><Select block value={ask.demoBy} placeholder="Choose a person" onChange={(v) => setAsk({ ...ask, demoBy: v })} options={staff.map((s) => ({ value: s.id, label: s.full_name || s.email || '' }))} /></div>
              <div className="field"><label>Date</label><DatePicker value={ask.demoDate} clearable={false} onChange={(v) => setAsk({ ...ask, demoDate: v })} /></div>
              <div className="field"><label>Time</label><Select block value={ask.demoTime} placeholder="Choose a time" onChange={(v) => setAsk({ ...ask, demoTime: v })} options={TIMES} /></div>
            </div>
          </>)}
          {ask.status === 'invite_webinar' && (<>
            <p className="muted" style={{ marginTop: 0 }}>Which webinar is {ask.row.name} being invited to?</p>
            <div className="field"><label>Webinar date</label><DatePicker value={ask.inviteDate} clearable={false} onChange={(v) => setAsk({ ...ask, inviteDate: v })} />
              <div className="chips" style={{ marginTop: '.5rem' }}>{nextWednesdays().map((d) => chip(ask.inviteDate === d, niceDay(d), () => setAsk({ ...ask, inviteDate: d })))}</div></div>
          </>)}
          <div className="modal-foot"><button className="primary" disabled={!askReady} onClick={saveAsk}><Save size={16} />Save status</button></div>
        </Modal>
      )}
    </>
  )
}
