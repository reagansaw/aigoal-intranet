import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useStaff } from '../lib/useStaff'
import { addDays, addMonths, dayLabel, monthLabel, monthStart, today } from '../lib/util'
import type { Todo } from '../lib/types'

export default function Todos() {
  const { profile, isManager } = useAuth()
  const staff = useStaff()
  const [uid, setUid] = useState(profile!.id)
  const [view, setView] = useState<'day' | 'month'>('day')
  const [day, setDay] = useState(today())
  const [month, setMonth] = useState(monthStart(new Date()))
  const [todos, setTodos] = useState<Todo[]>([])
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Todo['priority']>('normal')
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

  const byDay = todos.reduce<Record<string, Todo[]>>((m, t) => ((m[t.due_date] ||= []).push(t), m), {})
  const done = todos.filter((t) => t.done).length

  const item = (t: Todo) => (
    <div key={t.id} className={'todo' + (t.done ? ' done' : '')}>
      <input type="checkbox" checked={t.done} onChange={() => toggle(t)} />
      <span className="t">{t.title} {t.priority === 'high' && <span className="tag P1">high</span>}</span>
      {!t.done && <button className="sm" title="Move to next day" onClick={() => moveTomorrow(t)}>→</button>}
      <button className="sm danger" onClick={() => del(t)}>✕</button>
    </div>
  )

  return (
    <>
      <div className="row between">
        <h1>To-Do</h1>
        {isManager && (
          <select style={{ width: 'auto' }} value={uid} onChange={(e) => setUid(e.target.value)}>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
          </select>
        )}
      </div>
      <div className="tabs">
        <button className={view === 'day' ? 'on' : ''} onClick={() => setView('day')}>Day</button>
        <button className={view === 'month' ? 'on' : ''} onClick={() => setView('month')}>Month</button>
      </div>
      <div className="card">
        <div className="row between">
          <div className="row">
            <button onClick={() => view === 'day' ? setDay(addDays(day, -1)) : setMonth(addMonths(month, -1))}>‹</button>
            <b>{view === 'day' ? dayLabel(day) : monthLabel(month)}</b>
            <button onClick={() => view === 'day' ? setDay(addDays(day, 1)) : setMonth(addMonths(month, 1))}>›</button>
            <button onClick={() => { setDay(today()); setMonth(monthStart(new Date())) }}>Today</button>
          </div>
          <span className="muted">{done}/{todos.length} done</span>
        </div>
        <div className="bar" style={{ margin: '.6rem 0' }}><i style={{ width: todos.length ? `${(done / todos.length) * 100}%` : 0 }} /></div>
        {view === 'day' && (
          <>
            <form className="row" onSubmit={add} style={{ marginBottom: '.5rem' }}>
              <input style={{ flex: 1, minWidth: 180 }} placeholder="Add a task for this day…" value={title} onChange={(e) => setTitle(e.target.value)} />
              <select style={{ width: 'auto' }} value={priority} onChange={(e) => setPriority(e.target.value as Todo['priority'])}>
                <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
              </select>
              <button className="primary">Add</button>
            </form>
            {err && <div className="err">{err}</div>}
            {todos.map(item)}
            {!todos.length && <p className="muted">No tasks for this day.</p>}
          </>
        )}
        {view === 'month' &&
          Object.entries(byDay).map(([d, list]) => (
            <div key={d} style={{ marginBottom: '.6rem' }}>
              <div className="row between">
                <b style={{ cursor: 'pointer' }} onClick={() => { setDay(d); setView('day') }}>{dayLabel(d)}</b>
                <span className="muted">{list.filter((t) => t.done).length}/{list.length}</span>
              </div>
              {list.map(item)}
            </div>
          ))}
        {view === 'month' && !todos.length && <p className="muted">No tasks this month.</p>}
      </div>
    </>
  )
}
