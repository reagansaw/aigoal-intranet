import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, ListChecks, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useStaff } from '../lib/useStaff'
import { addDays, addMonths, dayLabel, monthLabel, monthStart, today } from '../lib/util'
import { Alert, Empty, PageHeader, Select } from '../components/ui'
import type { Todo } from '../lib/types'

const PRIORITIES = [{ value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }]

export default function Todos() {
  const { profile, isManager } = useAuth()
  const staff = useStaff()
  const [uid, setUid] = useState(profile!.id)
  const [view, setView] = useState<'day' | 'month'>('day')
  const [day, setDay] = useState(today())
  const [month, setMonth] = useState(monthStart(new Date()))
  const [todos, setTodos] = useState<Todo[]>([])
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('normal')
  const [err, setErr] = useState('')

  const load = async () => {
    const [from, to] = view === 'day' ? [day, day] : [month, addDays(addMonths(month, 1), -1)]
    const { data } = await supabase.from('todos').select('*').eq('user_id', uid).gte('due_date', from).lte('due_date', to).order('due_date').order('created_at')
    setTodos((data ?? []) as Todo[])
  }
  useEffect(() => { load() }, [uid, view, day, month])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    const { error } = await supabase.from('todos').insert({ user_id: uid, title: title.trim(), due_date: day, priority })
    if (error) return setErr(error.message)
    setTitle(''); setErr(''); load()
  }
  const toggle = async (t: Todo) => {
    await supabase.from('todos').update({ done: !t.done, done_at: !t.done ? new Date().toISOString() : null }).eq('id', t.id)
    load()
  }
  const del = async (t: Todo) => { await supabase.from('todos').delete().eq('id', t.id); load() }
  const moveTomorrow = async (t: Todo) => { await supabase.from('todos').update({ due_date: addDays(t.due_date, 1) }).eq('id', t.id); load() }
  const step = (n: number) => (view === 'day' ? setDay(addDays(day, n)) : setMonth(addMonths(month, n)))

  const byDay = todos.reduce<Record<string, Todo[]>>((m, t) => ((m[t.due_date] ||= []).push(t), m), {})
  const done = todos.filter((t) => t.done).length
  const pct = todos.length ? Math.round((done / todos.length) * 100) : 0

  const item = (t: Todo) => (
    <div key={t.id} className={'todo' + (t.done ? ' done' : '')}>
      <input type="checkbox" checked={t.done} onChange={() => toggle(t)} aria-label="Done" />
      <span className="t">{t.title}</span>
      {t.priority === 'high' && <span className="tag warn">High</span>}
      {t.priority === 'low' && <span className="tag">Low</span>}
      <span className="acts">
        {!t.done && <button className="ghost icon sm" title="Move to next day" aria-label="Move to next day" onClick={() => moveTomorrow(t)}><ArrowRight size={15} /></button>}
        <button className="ghost icon sm danger" title="Delete" aria-label="Delete" onClick={() => del(t)}><Trash2 size={15} /></button>
      </span>
    </div>
  )

  return (
    <>
      <PageHeader title="To-Do" sub="Plan the day, review the month.">
        {isManager && <Select value={uid} onChange={setUid} options={staff.map((s) => ({ value: s.id, label: s.full_name || s.email || '' }))} />}
      </PageHeader>
      <div className="row between" style={{ marginBottom: '1rem' }}>
        <div className="tabs" style={{ margin: 0 }}>
          <button className={view === 'day' ? 'on' : ''} onClick={() => setView('day')}>Day</button>
          <button className={view === 'month' ? 'on' : ''} onClick={() => setView('month')}>Month</button>
        </div>
        <div className="date-nav">
          <button className="icon" aria-label="Previous" onClick={() => step(-1)}><ChevronLeft size={17} /></button>
          <b>{view === 'day' ? dayLabel(day) : monthLabel(month)}</b>
          <button className="icon" aria-label="Next" onClick={() => step(1)}><ChevronRight size={17} /></button>
          <button onClick={() => { setDay(today()); setMonth(monthStart(new Date())) }}>Today</button>
        </div>
      </div>

      <div className="card">
        <div className="row between" style={{ marginBottom: '.5rem' }}>
          <span className="muted">{done} of {todos.length} completed</span><b>{pct}%</b>
        </div>
        <div className="bar" style={{ marginBottom: '.75rem' }}><i style={{ width: `${pct}%` }} /></div>

        {view === 'day' && (
          <>
            <form className="row" onSubmit={add} style={{ marginBottom: '.75rem', flexWrap: 'nowrap' }}>
              <input style={{ flex: 1, minWidth: 0 }} placeholder="Add a task for this day…" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Select value={priority} onChange={setPriority} options={PRIORITIES} />
              <button className="primary"><Plus size={16} />Add</button>
            </form>
            <Alert text={err} />
            {todos.map(item)}
            {!todos.length && <Empty icon={ListChecks} title="No tasks for this day">Type above and press Enter to add one.</Empty>}
          </>
        )}

        {view === 'month' && Object.entries(byDay).map(([d, list]) => (
          <div key={d} style={{ marginTop: '1rem' }}>
            <div className="row between" style={{ marginBottom: '.2rem' }}>
              <button className="ghost sm" onClick={() => { setDay(d); setView('day') }}><CalendarDays size={15} />{dayLabel(d)}</button>
              <span className="muted sm-text">{list.filter((t) => t.done).length}/{list.length}</span>
            </div>
            {list.map(item)}
          </div>
        ))}
        {view === 'month' && !todos.length && <Empty icon={CalendarDays} title="No tasks this month" />}
      </div>
    </>
  )
}
