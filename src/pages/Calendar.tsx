import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Ban, Briefcase, CalendarCheck, CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, Pencil, Plane, Plus, Save, Trash2, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useStaff } from '../lib/useStaff'
import { addDays, addMonths, dayLabel, iso, monthLabel, monthStart, today } from '../lib/util'
import Modal from '../components/Modal'
import { Alert, DatePicker, Empty, Msg, NumberInput, PageHeader, Pagination, Select, Stat, usePaged } from '../components/ui'
import type { CalendarOff, Holiday, LeaveFigures, Meeting, TimeOff } from '../lib/types'

const TYPE = { leave: 'Annual leave', travel: 'Business travel' } as const
const STATUS_TAG: Record<string, string> = { pending: 'warn', approved: 'good', rejected: '', cancelled: '' }
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const inRange = (d: string, s: string, e: string) => d >= s && d <= e
const first = (n: string) => n.split(' ')[0]

export default function CalendarPage() {
  const { profile, isAdmin, isManager } = useAuth()
  const staff = useStaff()
  const year = new Date().getFullYear()
  const [sp] = useSearchParams()
  const [tab, setTab] = useState<'cal' | 'mine' | 'approve' | 'balances' | 'holidays'>((sp.get('tab') as any) ?? 'cal')
  const [month, setMonth] = useState(monthStart(new Date()))
  const [sel, setSel] = useState(today())
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [offs, setOffs] = useState<CalendarOff[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [mine, setMine] = useState<TimeOff[]>([])
  const [all, setAll] = useState<TimeOff[]>([])
  const [fig, setFig] = useState<LeaveFigures | null>(null)
  const [show, setShow] = useState({ hol: true, leave: true, travel: true, meet: true })
  const [apply, setApply] = useState<Partial<TimeOff> | null>(null)
  const [reject, setReject] = useState<{ r: TimeOff; note: string } | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  const nameOf = (id: string) => staff.find((s) => s.id === id)?.full_name || '—'
  const activeHol = useMemo(() => holidays.filter((h) => h.active), [holidays])

  const load = async () => {
    const [h, o, m, mr, f] = await Promise.all([
      supabase.from('holidays').select('*').order('holiday_date'),
      supabase.from('calendar_time_off').select('*'),
      supabase.from('meetings').select('*'),
      supabase.from('time_off_requests').select('*').eq('user_id', profile!.id).order('start_date', { ascending: false }),
      supabase.rpc('my_leave', { yr: year }),
    ])
    setHolidays((h.data ?? []) as Holiday[]); setOffs((o.data ?? []) as CalendarOff[]); setMeetings((m.data ?? []) as Meeting[])
    setMine((mr.data ?? []) as TimeOff[]); setFig(((f.data ?? [])[0] as LeaveFigures) ?? null)
    if (isManager) { const { data } = await supabase.from('time_off_requests').select('*').order('created_at', { ascending: false }); setAll((data ?? []) as TimeOff[]) }
  }
  useEffect(() => { load() }, [])

  // ───── calendar grid ─────
  const cells = useMemo(() => {
    const f = new Date(month + 'T00:00:00'); const off = (f.getDay() + 6) % 7
    const start = iso(new Date(f.getFullYear(), f.getMonth(), 1 - off))
    return Array.from({ length: 42 }, (_, i) => addDays(start, i))
  }, [month])
  const itemsOn = (d: string) => ({
    hol: show.hol ? activeHol.filter((h) => h.holiday_date === d) : [],
    leave: show.leave ? offs.filter((o) => o.type === 'leave' && inRange(d, o.start_date, o.end_date)) : [],
    travel: show.travel ? offs.filter((o) => o.type === 'travel' && inRange(d, o.start_date, o.end_date)) : [],
    meet: show.meet ? meetings.filter((m) => m.meeting_date === d) : [],
  })
  const selItems = itemsOn(sel)

  // ───── apply form ─────
  const preview = useMemo(() => {
    if (!apply?.start_date || !apply?.end_date || apply.end_date < apply.start_date) return null
    let n = 0
    for (let d = apply.start_date; d <= apply.end_date; d = addDays(d, 1)) {
      const dow = new Date(d + 'T00:00:00').getDay()
      if (dow !== 0 && dow !== 6 && !activeHol.some((h) => h.holiday_date === d)) n++
    }
    return apply.half_day && apply.start_date === apply.end_date ? (n ? 0.5 : 0) : n
  }, [apply, activeHol])
  const submit = async () => {
    if (!apply) return
    setErr('')
    const row = { user_id: profile!.id, type: apply.type, start_date: apply.start_date, end_date: apply.end_date, half_day: !!apply.half_day && apply.start_date === apply.end_date,
      reason: apply.reason || null, destination: apply.type === 'travel' ? apply.destination || null : null }
    const { error } = await supabase.from('time_off_requests').insert(row)
    if (error) return setErr(error.message.replace(/^.*?exception:?\s*/i, ''))
    setApply(null); setTab('mine'); load()
  }
  const decide = async (r: TimeOff, status: TimeOff['status'], note?: string) => {
    const { error } = await supabase.from('time_off_requests').update({ status, decision_note: note ?? null }).eq('id', r.id)
    if (error) return setMsg(error.message)
    setMsg('Updated ✓'); setReject(null); load()
  }

  // ───── tables ─────
  const [aFilter, setAFilter] = useState('pending')
  const approvals = all.filter((r) => aFilter === 'all' || r.status === aFilter)
  const pendingCount = all.filter((r) => r.status === 'pending').length
  const { rows: mineRows, pager: minePager } = usePaged(mine, 'mine')
  const { rows: appRows, pager: appPager } = usePaged(approvals, aFilter)
  const [bal, setBal] = useState<{ user_id: string; full_name: string; entitlement: number; used: number; pending: number; remaining: number }[]>([])
  const [ent, setEnt] = useState<Record<string, number | null>>({})
  const [everyone, setEveryone] = useState<number | null>(8)
  const loadBal = async () => { const { data } = await supabase.rpc('leave_balances', { yr: year }); setBal((data ?? []) as any); setEnt({}) }
  useEffect(() => { if (tab === 'balances') loadBal() }, [tab])
  const saveEnt = async (id: string) => { const { error } = await supabase.from('profiles').update({ leave_entitlement: ent[id] ?? 0 }).eq('id', id); setMsg(error ? error.message : 'Saved ✓'); loadBal(); load() }
  const setAllLeave = async () => {
    if (everyone == null || !confirm(`Set the annual leave entitlement of EVERYONE to ${everyone} days?`)) return
    const { error } = await supabase.rpc('set_leave_for_everyone', { days: everyone }); setMsg(error ? error.message : `Everyone now has ${everyone} days ✓`); loadBal(); load()
  }
  const [hYear, setHYear] = useState(String(year))
  const [hol, setHol] = useState<Partial<Holiday> | null>(null)
  const hShown = holidays.filter((h) => h.holiday_date.startsWith(hYear))
  const { rows: hRows, pager: hPager } = usePaged(hShown, hYear)
  const saveHol = async () => {
    if (!hol?.holiday_date || !hol.name?.trim()) return setErr('Date and name are required.')
    const body = { holiday_date: hol.holiday_date, name: hol.name.trim(), region: hol.region || 'National', active: hol.active ?? true }
    const { error } = hol.id ? await supabase.from('holidays').update(body).eq('id', hol.id) : await supabase.from('holidays').insert(body)
    if (error) return setErr(error.message); setHol(null); setErr(''); load()
  }
  const years = [...new Set([String(year), String(year + 1), ...holidays.map((h) => h.holiday_date.slice(0, 4))])].sort()
  const statusTag = (s: string) => <span className={'tag ' + STATUS_TAG[s]}>{s}</span>
  const typeIcon = (t: string) => (t === 'travel' ? <Plane size={14} className="i" /> : <Briefcase size={14} className="i" />)

  return (
    <>
      <PageHeader title="Calendar & Leave" sub="Malaysia public holidays, who is away, and your leave balance.">
        <button className="primary" onClick={() => { setErr(''); setApply({ type: 'leave', start_date: today(), end_date: today(), half_day: false }) }}><CalendarPlus size={16} />Apply leave / travel</button>
      </PageHeader>

      <div className="grid">
        <Stat icon={CalendarDays} label={`Annual leave ${year}`} value={fig ? `${fig.entitlement} days` : '—'} />
        <Stat icon={Check} tone="green" label="Approved & used" value={fig ? `${fig.used} days` : '—'} />
        <Stat icon={CalendarPlus} tone="orange" label="Waiting for approval" value={fig ? `${fig.pending} days` : '—'} />
        <Stat icon={CalendarCheck} tone="red" label="Remaining" value={fig ? `${fig.remaining} days` : '—'} />
      </div>

      <div className="tabs">
        <button className={tab === 'cal' ? 'on' : ''} onClick={() => setTab('cal')}>Calendar</button>
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>My requests</button>
        {isManager && <button className={tab === 'approve' ? 'on' : ''} onClick={() => setTab('approve')}>Approvals{pendingCount ? ` (${pendingCount})` : ''}</button>}
        {isManager && <button className={tab === 'balances' ? 'on' : ''} onClick={() => setTab('balances')}>Leave balances</button>}
        {isAdmin && <button className={tab === 'holidays' ? 'on' : ''} onClick={() => setTab('holidays')}>Holidays</button>}
      </div>

      {tab === 'cal' && (
        <>
          <div className="card flush">
            <div className="card-head" style={{ padding: '1rem 1.25rem .6rem' }}>
              <div className="date-nav">
                <button className="icon" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft size={17} /></button>
                <b>{monthLabel(month)}</b>
                <button className="icon" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={17} /></button>
                <button onClick={() => { setMonth(monthStart(new Date())); setSel(today()) }}>Today</button>
              </div>
              <div className="legend">
                {([['hol', 'Public holiday'], ['leave', 'Leave'], ['travel', 'Travel'], ['meet', 'Meetings']] as const).map(([k, l]) => (
                  <label key={k} className="check"><input type="checkbox" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} /><span className={'sw ' + k} />{l}</label>
                ))}
              </div>
            </div>
            <div className="cal">
              {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
              {cells.map((d) => {
                const it = itemsOn(d); const wk = [0, 6].includes(new Date(d + 'T00:00:00').getDay())
                const chips = [
                  ...it.hol.map((h) => <div key={h.id} className="cal-chip hol" title={`${h.name} (${h.region})`}>{h.name}</div>),
                  ...it.leave.map((o) => <div key={o.id} className="cal-chip leave" title={`${o.full_name}: leave`}>{first(o.full_name)} · leave</div>),
                  ...it.travel.map((o) => <div key={o.id} className="cal-chip travel" title={`${o.full_name}: travel ${o.destination ?? ''}`}>{first(o.full_name)} · travel</div>),
                  ...it.meet.map((m) => <div key={m.id} className="cal-chip meet" title={m.title}>{m.title}</div>),
                ]
                return (
                  <div key={d} className={'cal-cell' + (d.slice(0, 7) !== month.slice(0, 7) ? ' out' : '') + (wk ? ' weekend' : '') + (d === today() ? ' today' : '') + (d === sel ? ' sel' : '')} onClick={() => setSel(d)}>
                    <span className="cal-num">{Number(d.slice(8))}</span>
                    {chips.slice(0, 3)}
                    {chips.length > 3 && <div className="cal-chip more">+{chips.length - 3} more</div>}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h2>{dayLabel(sel)}</h2></div>
            {selItems.hol.map((h) => <div key={h.id} className="day-row"><span className="sw hol" /><b>{h.name}</b><span className="muted sm-text">Public holiday · {h.region}</span></div>)}
            {selItems.leave.map((o) => <div key={o.id} className="day-row"><span className="sw leave" /><b>{o.full_name}</b><span className="muted sm-text">On leave{o.half_day ? ' (half day)' : ''} · {dayLabel(o.start_date)}{o.end_date !== o.start_date && ` to ${dayLabel(o.end_date)}`}</span></div>)}
            {selItems.travel.map((o) => <div key={o.id} className="day-row"><span className="sw travel" /><b>{o.full_name}</b><span className="muted sm-text">Travelling{o.destination ? ` to ${o.destination}` : ''} · {dayLabel(o.start_date)}{o.end_date !== o.start_date && ` to ${dayLabel(o.end_date)}`}</span></div>)}
            {selItems.meet.map((m) => <div key={m.id} className="day-row"><span className="sw meet" /><b>{m.title}</b><span className="muted sm-text">Meeting</span></div>)}
            {!selItems.hol.length && !selItems.leave.length && !selItems.travel.length && !selItems.meet.length && <p className="muted" style={{ margin: 0 }}>Nothing on this day.</p>}
          </div>
          <p className="muted sm-text">Holidays shown are national plus Kuala Lumpur &amp; Selangor. Islamic holiday dates can shift by a day; Admin can edit them under Holidays.</p>
        </>
      )}

      {tab === 'mine' && (
        <div className="card flush table-wrap">
          <table>
            <thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Reason</th><th></th></tr></thead>
            <tbody>
              {mineRows.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{typeIcon(r.type)} {TYPE[r.type]}{r.destination && <div className="muted sm-text">{r.destination}</div>}</td>
                  <td className="nowrap">{dayLabel(r.start_date)}{r.end_date !== r.start_date && <> to {dayLabel(r.end_date)}</>}{r.half_day && ' (half)'}</td>
                  <td>{r.type === 'leave' ? r.days : <span className="muted">n/a</span>}</td>
                  <td>{statusTag(r.status)}{r.decision_note && <div className="muted sm-text">{r.decision_note}</div>}</td>
                  <td style={{ maxWidth: 280 }} className="muted">{r.reason}</td>
                  <td>{['pending', 'approved'].includes(r.status) && r.end_date >= today() && <button className="sm" onClick={() => confirm('Cancel this request?') && decide(r, 'cancelled')}><Ban size={14} />Cancel</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!mine.length && <Empty icon={CalendarDays} title="No requests yet">Use “Apply leave / travel” to submit one.</Empty>}
          <Pagination pager={minePager} />
        </div>
      )}

      {tab === 'approve' && isManager && (
        <>
          <div className="row" style={{ marginBottom: '1rem' }}>
            <Select value={aFilter} onChange={setAFilter} options={[{ value: 'pending', label: 'Waiting for approval' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'all', label: 'All requests' }]} />
            <Msg text={msg} />
          </div>
          <div className="card flush table-wrap">
            <table>
              <thead><tr><th>Person</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {appRows.map((r) => (
                  <tr key={r.id}>
                    <td className="cell-title nowrap">{nameOf(r.user_id)}</td>
                    <td className="nowrap">{typeIcon(r.type)} {TYPE[r.type]}{r.destination && <div className="muted sm-text">{r.destination}</div>}</td>
                    <td className="nowrap">{dayLabel(r.start_date)}{r.end_date !== r.start_date && <> to {dayLabel(r.end_date)}</>}{r.half_day && ' (half)'}</td>
                    <td>{r.type === 'leave' ? r.days : <span className="muted">n/a</span>}</td>
                    <td style={{ maxWidth: 260 }} className="muted">{r.reason}</td>
                    <td>{statusTag(r.status)}</td>
                    <td className="nowrap">
                      {r.status === 'pending' && (r.user_id !== profile!.id || isAdmin) && <>
                        <button className="sm primary" onClick={() => decide(r, 'approved')}><Check size={14} />Approve</button>{' '}
                        <button className="sm danger" onClick={() => setReject({ r, note: '' })}><X size={14} />Reject</button></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!approvals.length && <Empty icon={CalendarCheck} title="Nothing here">No requests match this filter.</Empty>}
            <Pagination pager={appPager} />
          </div>
        </>
      )}

      {tab === 'balances' && isManager && (
        <>
          <div className="card">
            <div className="card-head"><h2>Annual leave entitlement</h2></div>
            <p className="muted" style={{ marginTop: 0 }}>The standard is 8 days a year. Change one person below, or set the same number for everyone (also becomes the default for new staff).</p>
            <div className="row">
              <div style={{ width: 110 }}><NumberInput value={everyone} onChange={setEveryone} /></div>
              <button className="primary" onClick={setAllLeave}><Save size={16} />Set everyone to {everyone ?? '…'} days</button>
              <Msg text={msg} />
            </div>
          </div>
          <div className="card flush table-wrap">
            <table>
              <thead><tr><th>Person</th><th>Entitlement ({year})</th><th>Used</th><th>Waiting</th><th>Remaining</th><th></th></tr></thead>
              <tbody>
                {bal.map((b) => (
                  <tr key={b.user_id}>
                    <td className="cell-title">{b.full_name}</td>
                    <td style={{ width: 150 }}><NumberInput value={b.user_id in ent ? ent[b.user_id] : b.entitlement} onChange={(n) => setEnt({ ...ent, [b.user_id]: n })} /></td>
                    <td>{b.used}</td><td>{b.pending}</td><td><b>{b.remaining}</b></td>
                    <td>{b.user_id in ent && ent[b.user_id] !== b.entitlement && <button className="sm primary" onClick={() => saveEnt(b.user_id)}><Save size={14} />Save</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'holidays' && isAdmin && (
        <>
          <div className="row between" style={{ marginBottom: '1rem' }}>
            <Select value={hYear} onChange={setHYear} options={years.map((y) => ({ value: y, label: y }))} />
            <button className="primary" onClick={() => { setErr(''); setHol({ holiday_date: `${hYear}-01-01`, name: '', region: 'National', active: true }) }}><Plus size={16} />Add holiday</button>
          </div>
          <div className="card flush table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Holiday</th><th>Applies to</th><th>Shown</th><th></th></tr></thead>
              <tbody>
                {hRows.map((h) => (
                  <tr key={h.id} style={{ opacity: h.active ? 1 : .5 }}>
                    <td className="nowrap">{dayLabel(h.holiday_date)}</td><td className="cell-title">{h.name}</td><td>{h.region}</td>
                    <td>{h.active ? <span className="tag good">Yes</span> : <span className="tag">Hidden</span>}</td>
                    <td><button className="ghost icon sm" aria-label="Edit" onClick={() => { setErr(''); setHol(h) }}><Pencil size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination pager={hPager} />
          </div>
        </>
      )}

      {apply && (
        <Modal title="Apply leave / travel" onClose={() => setApply(null)}>
          <div className="form-grid">
            <div className="field"><label>Type</label><Select block value={apply.type!} onChange={(v) => setApply({ ...apply, type: v as TimeOff['type'] })} options={[{ value: 'leave', label: 'Annual leave' }, { value: 'travel', label: 'Business travel' }]} /></div>
            <div className="field" />
            <div className="field"><label>From</label><DatePicker clearable={false} value={apply.start_date} onChange={(v) => setApply({ ...apply, start_date: v, end_date: apply.end_date && apply.end_date >= v ? apply.end_date : v })} /></div>
            <div className="field"><label>To</label><DatePicker clearable={false} value={apply.end_date} onChange={(v) => setApply({ ...apply, end_date: v })} /></div>
          </div>
          {apply.type === 'leave' && apply.start_date === apply.end_date && <label className="check" style={{ marginBottom: '.8rem' }}><input type="checkbox" checked={!!apply.half_day} onChange={(e) => setApply({ ...apply, half_day: e.target.checked })} />Half day</label>}
          {apply.type === 'travel' && <div className="field"><label>Destination</label><input value={apply.destination ?? ''} onChange={(e) => setApply({ ...apply, destination: e.target.value })} placeholder="e.g. Penang, client visit" /></div>}
          <div className="field"><label>{apply.type === 'travel' ? 'Purpose' : 'Reason (optional)'}</label><textarea value={apply.reason ?? ''} onChange={(e) => setApply({ ...apply, reason: e.target.value })} /></div>
          {preview !== null && (
            <div className="card" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
              {apply.type === 'leave'
                ? <>Uses <b>{preview}</b> working day(s) (weekends and public holidays are not counted). Remaining after: <b>{fig ? fig.remaining - preview : '—'}</b> of {fig?.entitlement ?? '—'}.</>
                : <>Travel does not use up your leave. It will show on the team calendar once approved.</>}
            </div>
          )}
          <Alert text={err} />
          <div className="modal-foot"><button className="primary" onClick={submit}><CalendarPlus size={16} />Submit for approval</button></div>
        </Modal>
      )}

      {reject && (
        <Modal title={`Reject ${nameOf(reject.r.user_id)}'s request`} onClose={() => setReject(null)}>
          <div className="field"><label>Reason (they will see this)</label><textarea value={reject.note} onChange={(e) => setReject({ ...reject, note: e.target.value })} /></div>
          <div className="modal-foot"><button className="danger" onClick={() => decide(reject.r, 'rejected', reject.note)}><X size={16} />Reject request</button></div>
        </Modal>
      )}

      {hol && (
        <Modal title={hol.id ? 'Edit holiday' : 'Add holiday'} onClose={() => setHol(null)}>
          <div className="form-grid">
            <div className="field"><label>Date</label><DatePicker clearable={false} value={hol.holiday_date} onChange={(v) => setHol({ ...hol, holiday_date: v })} /></div>
            <div className="field"><label>Name</label><input value={hol.name ?? ''} onChange={(e) => setHol({ ...hol, name: e.target.value })} /></div>
            <div className="field"><label>Applies to</label><input list="regions" value={hol.region ?? ''} onChange={(e) => setHol({ ...hol, region: e.target.value })} /><datalist id="regions"><option value="National" /><option value="KL & Selangor" /><option value="Company" /></datalist></div>
          </div>
          <label className="check"><input type="checkbox" checked={hol.active ?? true} onChange={(e) => setHol({ ...hol, active: e.target.checked })} />Show on calendar and exclude from leave days</label>
          <Alert text={err} />
          <div className="modal-foot">
            <button className="primary" onClick={saveHol}><Save size={16} />Save</button>
            {hol.id && <button className="danger" onClick={async () => { if (confirm('Delete this holiday?')) { await supabase.from('holidays').delete().eq('id', hol.id!); setHol(null); load() } }}><Trash2 size={16} />Delete</button>}
          </div>
        </Modal>
      )}
    </>
  )
}
