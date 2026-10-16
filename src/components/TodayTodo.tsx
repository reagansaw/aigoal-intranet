import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, ListChecks, Moon, Timer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { addDays, today } from '../lib/util'
import type { Todo } from '../lib/types'
import { Empty } from './ui'

const klHour = () => Number(new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kuala_Lumpur' }))
const mark = (pct: number) => (pct >= 100 ? { label: 'Perfect day', tag: 'good' } : pct >= 80 ? { label: 'Great day', tag: 'good' } : pct >= 50 ? { label: 'Fair day', tag: 'warn' } : { label: 'Needs catching up', tag: 'warn' })
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`)

type Closed = { done: number; total: number; carried: number; note: string | null }

/** Home card: today's tasks with a count, and an end-of-day mark (done out of planned) that can carry the rest to tomorrow. */
export default function TodayTodo({ me, todos, setTodos }: { me: string; todos: Todo[]; setTodos: (t: Todo[]) => void }) {
  const [closed, setClosed] = useState<Closed | null | undefined>(undefined)
  const [note, setNote] = useState('')
  const [carry, setCarry] = useState(true)
  const [busy, setBusy] = useState(false)
  const day = today()
  useEffect(() => { supabase.from('todo_day_marks').select('done,total,carried,note').eq('user_id', me).eq('day', day).maybeSingle().then(({ data }) => setClosed((data as Closed) ?? null)) }, [me, day])

  const done = todos.filter((t) => t.done).length
  const left = todos.length - done
  const pct = todos.length ? Math.round((done / todos.length) * 100) : 0
  const planned = todos.reduce((n, t) => n + (t.duration_min ?? 0), 0)
  const evening = klHour() >= 17 || (todos.length > 0 && left === 0)

  const toggle = async (t: Todo) => {
    await supabase.from('todos').update({ done: !t.done, done_at: !t.done ? new Date().toISOString() : null }).eq('id', t.id)
    setTodos(todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))
  }
  const closeDay = async () => {
    setBusy(true)
    const open = todos.filter((t) => !t.done)
    // unfinished tasks are moved to tomorrow: the database records the delay on each one (cannot be edited)
    if (carry && open.length) await supabase.from('todos').update({ due_date: addDays(day, 1) }).in('id', open.map((t) => t.id))
    const row = { user_id: me, day, done, total: todos.length, carried: carry ? open.length : 0, note: note.trim() || null }
    await supabase.from('todo_day_marks').upsert(row)
    setClosed(row); if (carry && open.length) setTodos(todos.filter((t) => t.done)); setBusy(false)
  }

  const m = mark(closed ? (closed.total ? Math.round((closed.done / closed.total) * 100) : 100) : pct)
  return (
    <div className="card">
      <div className="card-head">
        <h2>Today's to-do <span className="tag" style={{ marginLeft: 6 }}>{todos.length} {todos.length === 1 ? 'item' : 'items'}</span></h2>
        <Link to="/todos" className="row" style={{ gap: '.25rem' }}>Open <ArrowRight size={15} /></Link>
      </div>
      {todos.length > 0 && (
        <div className="row between sm-text muted" style={{ marginBottom: '.3rem' }}>
          <span><b style={{ color: 'var(--ink)' }}>{done}</b> done · <b style={{ color: 'var(--ink)' }}>{left}</b> to go{planned > 0 && <> · <Timer size={12} className="i" /> {dur(planned)} planned</>}</span><b>{pct}%</b>
        </div>
      )}
      <div className="bar" style={{ marginBottom: '.5rem' }}><i style={{ width: `${pct}%` }} /></div>
      {todos.map((t, i) => (
        <label key={t.id} className={'todo' + (t.done ? ' done' : '')} style={{ margin: 0, cursor: 'pointer', color: 'inherit', fontSize: 'inherit', fontWeight: 400 }}>
          <span className="todo-n">{i + 1}</span><input type="checkbox" checked={t.done} onChange={() => toggle(t)} />
          <span className="t">{t.title}{t.notes && <div className="src">{t.notes}</div>}</span>
          {t.duration_min ? <span className="tag"><Timer size={12} />{dur(t.duration_min)}</span> : null}
        </label>
      ))}
      {!todos.length && <Empty icon={ListChecks} title="Nothing planned today">Add tasks from the To-Do page.</Empty>}

      {closed ? (
        <div className="pend none" style={{ marginTop: '.8rem', display: 'block' }}>
          <b><CheckCircle2 size={14} className="i" /> Day closed · <span className={'tag ' + m.tag}>{m.label}</span> {closed.done}/{closed.total} done ({closed.total ? Math.round((closed.done / closed.total) * 100) : 100}%)</b>
          {closed.carried > 0 && <div className="muted sm-text">{closed.carried} unfinished moved to tomorrow (recorded as delayed).</div>}
          {closed.note && <div className="sm-text" style={{ marginTop: 2 }}>{closed.note}</div>}
        </div>
      ) : evening && closed !== undefined && todos.length > 0 && (
        <div className="pend none" style={{ marginTop: '.8rem', display: 'block' }}>
          <b><Moon size={14} className="i" /> End of day · {done}/{todos.length} done ({pct}%) · <span className={'tag ' + m.tag}>{m.label}</span></b>
          <textarea style={{ minHeight: 56, margin: '.5rem 0' }} placeholder="Anything to note about today? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          {left > 0 && <label className="row" style={{ gap: '.5rem', cursor: 'pointer', marginBottom: '.5rem' }}><input type="checkbox" checked={carry} onChange={(e) => setCarry(e.target.checked)} style={{ width: 'auto' }} />Move the {left} unfinished to tomorrow (recorded as delayed 1 day)</label>}
          <button className="primary sm" disabled={busy} onClick={closeDay}>{busy ? 'Saving…' : 'Close my day'}</button>
        </div>
      )}
    </div>
  )
}
