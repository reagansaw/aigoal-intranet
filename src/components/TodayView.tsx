import { useState, type FormEvent } from 'react'
import { AlarmClockOff, ArrowRight, CalendarClock, CalendarDays, Check, Clock, Inbox, ListChecks, Plus, Timer, Trash2, TriangleAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { addDays, dayLabel, today } from '../lib/util'
import { klDay, outcomeOf, tally } from '../lib/todo'
import type { Todo } from '../lib/types'
import Modal from './Modal'
import { Alert, DatePicker, Empty, NumberInput, Select, Tip } from './ui'

const dur = (m: number | null | undefined) => (!m ? '' : m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`)
const PRIORITIES = [{ value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }]
const UNITS = [{ value: 'min', label: 'minutes' }, { value: 'h', label: 'hours' }]
type When = 'today' | 'pick' | 'later'

/** Delay badge: written by the database when a task is moved to a later day; nobody can edit or remove it. */
export function DelayTag({ t }: { t: Pick<Todo, 'delayed_days' | 'original_due'> }) {
  if (!t.delayed_days) return null
  return <span className="tag bad" title={`Originally due ${t.original_due ? dayLabel(t.original_due) : ''}. This record cannot be changed.`}><AlarmClockOff size={11} />Delayed {t.delayed_days} day{t.delayed_days > 1 ? 's' : ''}</span>
}

/**
 * What a staff member sees first: today's tasks, anything overdue from earlier days (stays until moved or done),
 * tasks waiting for a day (backlog), and a 30-day strip to jump ahead.
 */
export default function TodayView({ uid, day, setDay, todays, overdue, backlog, upcoming, onChange }: {
  uid: string; day: string; setDay: (d: string) => void
  todays: Todo[]; overdue: Todo[]; backlog: Todo[]; upcoming: Record<string, Pick<Todo, 'done' | 'due_date' | 'created_at' | 'done_at' | 'delayed_days'>[]>; onChange: () => void
}) {
  const [title, setTitle] = useState('')
  const [when, setWhen] = useState<When>('today')
  const [pickDay, setPickDay] = useState(day)
  const [notes, setNotes] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [unit, setUnit] = useState('min')
  const [priority, setPriority] = useState('normal')
  const [more, setMore] = useState(false)
  const [err, setErr] = useState('')
  const [moveFor, setMoveFor] = useState<Todo | null>(null)
  const [moveTo, setMoveTo] = useState('')
  const isToday = day === today()

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    const due = when === 'later' ? null : when === 'today' ? day : pickDay
    if (when === 'pick' && !pickDay) return setErr('Pick a day.')
    const minutes = amount ? Math.round(amount * (unit === 'h' ? 60 : 1)) : null
    const { error } = await supabase.from('todos').insert({ user_id: uid, title: title.trim(), notes: notes.trim() || null, due_date: due, duration_min: minutes, priority })
    if (error) return setErr(error.message)
    setTitle(''); setNotes(''); setAmount(null); setErr(''); onChange()
  }
  const toggle = async (t: Todo) => { await supabase.from('todos').update({ done: !t.done, done_at: !t.done ? new Date().toISOString() : null }).eq('id', t.id); onChange() }
  const del = async (t: Todo) => { if (confirm('Delete this task?')) { await supabase.from('todos').delete().eq('id', t.id); onChange() } }
  const schedule = async (t: Todo, d: string) => { if (d) { await supabase.from('todos').update({ due_date: d }).eq('id', t.id); onChange() } }
  const move = async () => {
    if (!moveFor || !moveTo) return
    if (moveFor.due_date && moveTo <= moveFor.due_date) return setErr('Pick a day after the current due date.')
    await supabase.from('todos').update({ due_date: moveTo, done: false, done_at: null }).eq('id', moveFor.id)
    setMoveFor(null); setErr(''); onChange()
  }

  const row = (t: Todo, n: number, late = false) => {
    const o = outcomeOf(t)
    return (
      <div key={t.id} className={'todo' + (t.done ? ' done' : '') + (late ? ' late' : '')}>
        <span className="todo-n">{n}</span>
        <input type="checkbox" checked={t.done} onChange={() => toggle(t)} aria-label="Done" />
        <span className="t">{t.title}{t.notes && <div className="src">{t.notes}</div>}{t.source && <div className="src">{t.source}</div>}</span>
        {late && t.due_date && <span className="tag warn"><CalendarClock size={11} />Due {dayLabel(t.due_date)}</span>}
        {t.duration_min ? <span className="tag"><Timer size={12} />{dur(t.duration_min)}</span> : null}
        {t.priority === 'high' && <span className="tag warn">High</span>}
        {o === 'done' && <span className="tag good">Done</span>}
        {o === 'missed' && <span className="tag bad"><TriangleAlert size={11} />Not done</span>}
        <DelayTag t={t} />
        <span className="acts">
          {!t.done && <button className="sm" title="Move to a later day (the delay is recorded)" onClick={() => { setMoveFor(t); setMoveTo(addDays(today(), 1)); setErr('') }}><ArrowRight size={14} />Move</button>}
          {!(t.delayed_days > 0 || o === 'missed') && <button className="ghost icon sm danger" title="Delete" aria-label="Delete" onClick={() => del(t)}><Trash2 size={15} /></button>}
        </span>
      </div>
    )
  }

  const mk = tally(todays)
  const days30 = Array.from({ length: 30 }, (_, i) => addDays(today(), i))
  const tone = (d: string) => {
    const l = upcoming[d] ?? []; if (!l.length) return ''
    const t = tally(l); return t.missed ? 'bad' : t.open ? 'open' : 'ok'
  }

  return (
    <>
      {/* ── today ── */}
      <div className="card">
        <div className="card-head">
          <h2><ListChecks size={17} className="i" />{isToday ? 'Today' : dayLabel(day)} <span className="muted" style={{ fontWeight: 400 }}>{isToday && `· ${dayLabel(day)}`}</span></h2>
          <span className="muted sm-text">{mk.total ? <><b style={{ color: 'var(--ink)' }}>{mk.done}/{mk.total}</b> done{mk.missed > 0 && <> · <b style={{ color: 'var(--bad)' }}>{mk.missed}</b> not done</>}</> : 'Nothing planned'}</span>
        </div>
        <div className="bar" style={{ margin: '0 0 .8rem' }}><i style={{ width: `${mk.score ?? 0}%` }} /></div>

        <form onSubmit={add} className="todo-quick">
          <div className="row" style={{ flexWrap: 'nowrap', gap: '.5rem' }}>
            <input style={{ flex: 1, minWidth: 0 }} placeholder="Add a task…" value={title} onChange={(e) => setTitle(e.target.value)} />
            <button className="primary" disabled={!title.trim()}><Plus size={16} />Add</button>
          </div>
          <div className="row" style={{ gap: '.5rem', marginTop: '.5rem', alignItems: 'center' }}>
            <span className="muted sm-text">Do it:</span>
            <div className="chips">
              <button type="button" className={'chip' + (when === 'today' ? ' on' : '')} onClick={() => setWhen('today')}>{isToday ? 'Today' : dayLabel(day)}</button>
              <button type="button" className={'chip' + (when === 'pick' ? ' on' : '')} onClick={() => setWhen('pick')}>Pick a day</button>
              <button type="button" className={'chip' + (when === 'later' ? ' on' : '')} onClick={() => setWhen('later')}><Inbox size={12} />No day yet</button>
            </div>
            {when === 'pick' && <div style={{ width: 180 }}><DatePicker value={pickDay} clearable={false} onChange={setPickDay} /></div>}
            <button type="button" className="ghost sm" onClick={() => setMore(!more)}>{more ? 'Less' : 'Remarks, time, priority'}</button>
          </div>
          {more && (
            <div className="form-grid" style={{ marginTop: '.5rem' }}>
              <div className="field"><label>Time needed</label><div className="row" style={{ flexWrap: 'nowrap' }}><div style={{ flex: 1 }}><NumberInput value={amount} onChange={setAmount} placeholder="e.g. 30" /></div><Select value={unit} onChange={setUnit} options={UNITS} /></div></div>
              <div className="field"><label>Priority</label><Select block value={priority} onChange={setPriority} options={PRIORITIES} /></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label>Remarks</label><textarea style={{ minHeight: 56 }} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            </div>
          )}
        </form>
        {err && !moveFor && <Alert text={err} />}
        {todays.map((t, i) => row(t, i + 1))}
        {!todays.length && <Empty icon={ListChecks} title={isToday ? 'Nothing planned for today' : 'Nothing planned for this day'}>Add one above, or pick a task from the waiting list below.</Empty>}
      </div>

      {/* ── overdue from earlier days ── */}
      {overdue.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--bad)' }}>
          <div className="card-head"><h2 style={{ color: 'var(--bad)' }}><TriangleAlert size={17} className="i" />Not done from earlier days ({overdue.length})</h2><span className="muted sm-text">These stay here until you move them to a day or finish them. Moving records the delay.</span></div>
          {overdue.map((t, i) => row(t, i + 1, true))}
        </div>
      )}

      {/* ── waiting for a day ── */}
      <div className="card">
        <div className="card-head"><h2><Inbox size={17} className="i" />Waiting for a day ({backlog.length}) <Tip text="Tasks you (or the boss) have noted down but not yet put on a day. Pick a day when you are ready; they do not count in the marks until then." /></h2></div>
        {backlog.map((t) => (
          <div key={t.id} className="todo">
            <span className="t">{t.title}{t.notes && <div className="src">{t.notes}</div>}{t.source && <div className="src">{t.source}</div>}</span>
            <span className="tag" title="Created">{dayLabel(klDay(t.created_at))}</span>
            {t.deadline && <span className={'tag' + (t.deadline < today() ? ' warn' : '')}>Deadline {dayLabel(t.deadline)}</span>}
            <div style={{ width: 180 }}><DatePicker value="" placeholder="Choose a day" clearable={false} onChange={(d) => schedule(t, d)} /></div>
            <button className="ghost icon sm danger" title="Delete" aria-label="Delete" onClick={() => del(t)}><Trash2 size={15} /></button>
          </div>
        ))}
        {!backlog.length && <p className="muted sm-text" style={{ margin: 0 }}>Nothing waiting. Use “No day yet” above to park a task here.</p>}
      </div>

      {/* ── next 30 days ── */}
      <div className="card">
        <div className="card-head"><h2><CalendarDays size={17} className="i" />Next 30 days</h2>
          <span className="row sm-text muted" style={{ gap: '.8rem' }}><span><i className="dot" style={{ background: 'var(--brand)' }} /> Has tasks</span><span><i className="dot" style={{ background: 'var(--ok)' }} /> All done</span><span><i className="dot" style={{ background: 'var(--bad)' }} /> Not done</span></span></div>
        <div className="strip30">
          {days30.map((d) => { const l = upcoming[d] ?? []; const dt = new Date(d + 'T12:00:00'); const wk = [0, 6].includes(dt.getDay()); return (
            <button key={d} type="button" className={'strip-day ' + tone(d) + (d === day ? ' sel' : '') + (wk ? ' wk' : '')} onClick={() => setDay(d)} title={`${dayLabel(d)} · ${l.length} task${l.length === 1 ? '' : 's'}`}>
              <small>{dt.toLocaleDateString('en-GB', { weekday: 'short' })}</small><b>{dt.getDate()}</b><span>{l.length || ''}</span>
            </button>) })}
        </div>
      </div>

      {moveFor && (
        <Modal title="Move to a later day" onClose={() => setMoveFor(null)}>
          <p style={{ marginTop: 0 }}><b>{moveFor.title}</b>{moveFor.due_date && <> · due {dayLabel(moveFor.due_date)}</>}</p>
          <div className="field"><label>New day</label><DatePicker value={moveTo} clearable={false} onChange={setMoveTo} /></div>
          <div className="chips" style={{ marginBottom: '.8rem' }}>{[1, 2, 3, 7].map((n) => <button key={n} type="button" className={'chip' + (moveTo === addDays(today(), n) ? ' on' : '')} onClick={() => setMoveTo(addDays(today(), n))}>{n === 1 ? 'Tomorrow' : n === 7 ? 'Next week' : `+${n} days`}</button>)}</div>
          <div className="alert" style={{ alignItems: 'center' }}><Clock size={15} /><span>This will be recorded as <b>delayed {Math.max(moveFor.delayed_days, moveTo && (moveFor.original_due ?? moveFor.due_date) ? Math.round((new Date(moveTo).getTime() - new Date((moveFor.original_due ?? moveFor.due_date)!).getTime()) / 864e5) : 0)} day(s)</b> on the task. The record cannot be edited or removed.</span></div>
          {err && <Alert text={err} />}
          <div className="modal-foot"><button className="primary" onClick={move}><Check size={16} />Move</button></div>
        </Modal>
      )}
    </>
  )
}
