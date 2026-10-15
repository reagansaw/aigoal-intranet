import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Modal from './Modal'
import { Alert, Select } from './ui'

interface Svc { id: string; name: string; kind: 'demo' | 'consultation'; duration_min: number; staff: { id: string; name: string }[] }
interface Slot { start: string; staff: string }
const TZ = 'Asia/Kuala_Lumpur'
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
const dayLabel = (k: string) => new Date(k + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ })

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('appointment', { body })
  if (error) { try { return { error: (await (error as any).context.json()).error as string } } catch { return { error: error.message } } }
  return data
}

/** Book a DEMO / Consultation for a lead straight into the AIGOAL calendar, picking from real availability. */
export default function BookingPicker({ customer, kind, onClose, onDone }: {
  customer: { id: string; name: string }; kind: 'demo' | 'consultation'; onClose: () => void; onDone: () => void
}) {
  const [svcs, setSvcs] = useState<Svc[]>([])
  const [k, setK] = useState(kind)
  const [staff, setStaff] = useState('')
  const [slots, setSlots] = useState<Slot[]>([])
  const [day, setDay] = useState('')
  const [pick, setPick] = useState<Slot | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<{ needs_approval: boolean } | null>(null)

  const svc = svcs.find((s) => s.kind === k)
  const staffName = (id: string) => svc?.staff.find((s) => s.id === id)?.name ?? ''

  useEffect(() => { call({ action: 'options' }).then((r) => { if (r.error) setErr(r.error); else setSvcs(r.services) }) }, [])
  useEffect(() => {
    if (!svc) return
    setLoading(true); setSlots([]); setDay(''); setPick(null); setErr('')
    call({ action: 'slots', service: svc.id, staff }).then((r) => {
      setLoading(false)
      if (r.error) return setErr(r.error)
      setSlots(r.slots); setDay(r.slots[0] ? dayKey(r.slots[0].start) : '')
    })
  }, [svc?.id, staff])

  const days = useMemo(() => [...new Set(slots.map((s) => dayKey(s.start)))], [slots])
  const times = slots.filter((s) => dayKey(s.start) === day)

  const book = async () => {
    if (!svc || !pick) return
    setBusy(true); setErr('')
    const r = await call({ action: 'book', service: svc.id, customer_id: customer.id, staff: pick.staff, start: pick.start })
    setBusy(false)
    if (r.error) return setErr(r.error)
    setDone({ needs_approval: !!r.needs_approval }); onDone()
  }

  if (done) return (
    <Modal title="Appointment booked" onClose={onClose}>
      <p style={{ marginTop: 0 }}><b>{customer.name}</b> is booked for a {k === 'demo' ? 'demo' : 'consultation'} with <b>{staffName(pick!.staff)}</b> on <b>{dayLabel(dayKey(pick!.start))}, {timeLabel(pick!.start)}</b>.</p>
      {done.needs_approval && <p className="muted">AIGOAL marks this booking as waiting for approval. It appears here with the Zoom link once approved and the calendar syncs.</p>}
      <div className="modal-foot"><button className="primary" onClick={onClose}>Done</button></div>
    </Modal>
  )

  return (
    <Modal title={`Book for ${customer.name}`} onClose={onClose}>
      <div className="chips" style={{ marginBottom: '.8rem' }}>
        {svcs.map((s) => <button key={s.id} type="button" className={'chip' + (k === s.kind ? ' on' : '')} onClick={() => { setK(s.kind); setStaff('') }}>{s.kind === 'demo' ? 'Demo' : 'Consultation'} · {s.duration_min} min</button>)}
      </div>
      {svc && <div className="field"><label>Who</label>
        <Select block value={staff} onChange={setStaff} options={[{ value: '', label: 'Anyone available' }, ...svc.staff.map((s) => ({ value: s.id, label: s.name }))]} /></div>}
      {err && <Alert text={err} />}
      {loading ? <p className="muted">Loading availability…</p> : !slots.length ? <p className="muted">No free times in the next 30 days{staff ? ' for this person' : ''}.</p> : (<>
        <div className="field"><label>Day</label>
          <div className="chips">{days.map((d) => <button key={d} type="button" className={'chip' + (day === d ? ' on' : '')} onClick={() => { setDay(d); setPick(null) }}>{dayLabel(d)}</button>)}</div></div>
        <div className="field"><label>Time (Malaysia)</label>
          <div className="chips">{times.map((s) => <button key={s.start + s.staff} type="button" className={'chip' + (pick === s ? ' on' : '')} onClick={() => setPick(s)}>{timeLabel(s.start)}{!staff && ` · ${staffName(s.staff)}`}</button>)}</div></div>
      </>)}
      <div className="modal-foot"><button className="primary" disabled={!pick || busy} onClick={book}><CalendarCheck size={16} />{busy ? 'Booking…' : pick ? `Book ${timeLabel(pick.start)} with ${staffName(pick.staff)}` : 'Pick a time'}</button></div>
    </Modal>
  )
}
