import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, ListChecks, ListTodo, Plus, Timer, Trash2, TriangleAlert } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useStaff } from '../lib/useStaff'
import { addDays, addMonths, dayLabel, monthLabel, monthStart, today } from '../lib/util'
import { isLate, klDay, outcomeOf, tally, weekStart } from '../lib/todo'
import { Alert, DatePicker, Empty, NumberInput, PageHeader, Select, Stat } from '../components/ui'
import TodoBoard from '../components/TodoBoard'
import TodoChart, { type DayCount } from '../components/TodoChart'
import type { Todo } from '../lib/types'

const UNITS = [{ value: 'min', label: 'minutes' }, { value: 'h', label: 'hours' }]
export const dur = (m: number | null | undefined) => (!m ? '' : m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`)
const PRIORITIES = [{ value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }]
type Range = 'day' | 'week' | 'month'

export default function Todos() {
  const { profile, isManager } = useAuth()
  const allStaff = useStaff()
  const staff = allStaff.filter((s) => s.role !== 'admin') // admin-level accounts are not listed
  const [uid, setUid] = useState(profile!.id)
  useEffect(() => { if (profile!.role === 'admin' && staff.length && !staff.some((s) => s.id === uid)) setUid(staff[0].id) }, [staff.length])
  const [range, setRange] = useState<Range>('month')
  const [layout, setLayout] = useState<'board' | 'list'>('board')
  const [day, setDay] = useState(today())
  const [todos, setTodos] = useState<Todo[]>([])
  const [inbox, setInbox] = useState<Todo[]>([])
  const [trend, setTrend] = useState<DayCount[]>([])
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('normal')
  const [notes, setNotes] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [unit, setUnit] = useState('min')
  const [err, setErr] = useState('')

  const month = monthStart(new Date(day + 'T12:00:00'))
  const [from, to] = range === 'day' ? [day, day] : range === 'week' ? [weekStart(day), addDays(weekStart(day), 6)] : [month, addDays(addMonths(month, 1), -1)]

  const load = async () => {
    const { data } = await supabase.from('todos').select('*').eq('user_id', uid).gte('due_date', from).lte('due_date', to).order('due_date').order('created_at')
    const list = (data ?? []) as Todo[]
    setTodos(list)
    // chart: the chosen range (a single day shows the last 7 days)
    const [cf, ct] = range === 'day' ? [addDays(day, -6), day] : [from, to]
    const { data: rng } = await supabase.from('todos').select('due_date, done, created_at, done_at').eq('user_id', uid).gte('due_date', cf).lte('due_date', ct)
    const m: Record<string, DayCount> = {}
    for (let d = cf; d <= ct; d = addDays(d, 1)) m[d] = { day: d, done: 0, total: 0 }
    ;(rng ?? []).forEach((t: any) => { const e = m[t.due_date]; if (e) { e.total++; if (outcomeOf(t) === 'done') e.done++ } })
    setTrend(Object.values(m))
    const { data: unsched } = await supabase.from('todos').select('*').eq('user_id', uid).is('due_date', null).eq('done', false).order('created_at')
    setInbox((unsched ?? []) as Todo[])
  }
  useEffect(() => { load() }, [uid, range, day])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    const minutes = amount ? Math.round(amount * (unit === 'h' ? 60 : 1)) : null
    const { error } = await supabase.from('todos').insert({ user_id: uid, title: title.trim(), notes: notes.trim() || null, due_date: dueDate || day, duration_min: minutes, priority })
    if (error) return setErr(error.message)
    setTitle(''); setNotes(''); setDueDate(''); setAmount(null); setErr(''); load()
  }
  const toggle = async (t: Todo) => {
    await supabase.from('todos').update({ done: !t.done, done_at: !t.done ? new Date().toISOString() : null }).eq('id', t.id)
    load()
  }
  const del = async (t: Todo) => { await supabase.from('todos').delete().eq('id', t.id); load() }
  const copyToday = async (t: Todo) => { await supabase.from('todos').insert({ user_id: uid, title: t.title, notes: t.notes, due_date: today(), duration_min: t.duration_min, priority: t.priority }); load() }
  const step = (n: number) => setDay(range === 'day' ? addDays(day, n) : range === 'week' ? addDays(day, 7 * n) : addMonths(month, n))
  const label = range === 'day' ? dayLabel(day) : range === 'week' ? `${dayLabel(from)} – ${dayLabel(to)}` : monthLabel(month)

  const marks = useMemo(() => tally(todos), [todos])
  const byDay = todos.reduce<Record<string, Todo[]>>((m, t) => ((m[t.due_date ?? ''] ||= []).push(t), m), {})

  const item = (t: Todo, n: number) => {
    const o = outcomeOf(t)
    return (
      <div key={t.id} className={'todo' + (t.done ? ' done' : '')}>
        <span className="todo-n">{n}</span>
        <input type="checkbox" checked={t.done} onChange={() => toggle(t)} aria-label="Done" />
        <span className="t">{t.title}{t.notes && <div className="src">{t.notes}</div>}{t.source && <div className="src">{t.source}</div>}</span>
        <span className="tag" title="Created date">Created {dayLabel(klDay(t.created_at))}</span>
        {t.due_date && <span className={'tag' + (o === 'missed' ? ' warn' : '')} title="Due date">Due {dayLabel(t.due_date)}</span>}
        {t.duration_min && <span className="tag" title="Time to complete"><Timer size={12} />{dur(t.duration_min)}</span>}
        {o === 'missed' && <span className="tag warn"><TriangleAlert size={12} />Not done</span>}
        {isLate(t) && <span className="tag">Done late</span>}
        {t.priority === 'high' && <span className="tag warn">High</span>}
        <span className="acts">
          {o === 'missed' && <button className="ghost sm" title="Make a fresh copy for today" onClick={() => copyToday(t)}>Copy to today</button>}
          <button className="ghost icon sm danger" title="Delete" aria-label="Delete" onClick={() => del(t)}><Trash2 size={15} /></button>
        </span>
      </div>
    )
  }

  return (
    <>
      <PageHeader title="To-Do" sub="Created date is automatic, set the due date, and see done vs not done by day, week or month.">
        {isManager && <Select value={uid} onChange={setUid} options={staff.map((s) => ({ value: s.id, label: s.full_name || s.email || '' }))} />}
      </PageHeader>

      <div className="row between" style={{ marginBottom: '1rem', gap: '.8rem' }}>
        <div className="row" style={{ gap: '.6rem' }}>
          <div className="tabs" style={{ margin: 0 }} role="tablist" aria-label="Filter">
            {(['day', 'week', 'month'] as Range[]).map((r) => <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{r === 'day' ? 'Day' : r === 'week' ? 'Week' : 'Month'}</button>)}
          </div>
          <div className="tabs" style={{ margin: 0 }} role="tablist" aria-label="View">
            <button className={layout === 'board' ? 'on' : ''} onClick={() => setLayout('board')}><LayoutGrid size={14} className="i" /> Board</button>
            <button className={layout === 'list' ? 'on' : ''} onClick={() => setLayout('list')}><ListTodo size={14} className="i" /> List</button>
          </div>
        </div>
        <div className="date-nav">
          <button className="icon" aria-label="Previous" onClick={() => step(-1)}><ChevronLeft size={17} /></button>
          <b>{label}</b>
          <button className="icon" aria-label="Next" onClick={() => step(1)}><ChevronRight size={17} /></button>
          <button onClick={() => setDay(today())}>Today</button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <Stat icon={ListTodo} label="Total to-do" value={marks.total} />
        <Stat icon={ListChecks} tone="green" label="Done" value={marks.done} />
        <Stat icon={TriangleAlert} tone="red" label="Not done" value={marks.missed} />
        <Stat icon={CalendarDays} tone="gray" label="Still open" value={marks.open} />
        <Stat icon={CalendarDays} tone="yellow" label={`Mark · ${marks.done}/${marks.total}`} value={marks.score == null ? '—' : `${marks.score}%`} />
      </div>
      <p className="muted sm-text" style={{ margin: '-.2rem 0 1rem' }}>
        <b>Not done</b> = past its due date without a tick. A task created and due on the same day must be ticked by the end of that day; if not, it counts as not done even if ticked later.
        Mark = done ÷ total to-do (10 to-do with 5 done = 5/10 = 50%).
      </p>

      {layout === 'board' && <TodoBoard cards={[...inbox, ...todos]} uid={uid} month={month} fallbackDay={day} onChange={load} />}

      {layout === 'list' && (
        <div className="card">
          {range === 'day' && (
            <form onSubmit={add} className="todo-form">
              <div className="field"><label>Task</label><input placeholder="What needs to be done?" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              <div className="form-grid">
                <div className="field"><label>Created date</label><input disabled value={dayLabel(today())} title="Set automatically" /></div>
                <div className="field"><label>Due date</label><DatePicker value={dueDate || day} clearable={false} onChange={setDueDate} /></div>
                <div className="field"><label>Time needed to complete</label>
                  <div className="row" style={{ flexWrap: 'nowrap' }}><div style={{ flex: 1 }}><NumberInput value={amount} onChange={setAmount} placeholder="e.g. 30" /></div><Select value={unit} onChange={setUnit} options={UNITS} /></div></div>
                <div className="field"><label>Priority</label><Select block value={priority} onChange={setPriority} options={PRIORITIES} /></div>
              </div>
              <div className="field"><label>Remarks</label><textarea style={{ minHeight: 60 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Details, links, what done looks like…" /></div>
              <button className="primary" disabled={!title.trim()}><Plus size={16} />Add task</button>
            </form>
          )}
          <Alert text={err} />
          {range === 'day' ? todos.map((t, i) => item(t, i + 1)) : Object.entries(byDay).map(([d, list]) => (
            <div key={d} style={{ marginTop: '1rem' }}>
              <div className="row between" style={{ marginBottom: '.2rem' }}>
                <button className="ghost sm" onClick={() => { setDay(d); setRange('day') }}><CalendarDays size={15} />{dayLabel(d)}</button>
                <span className="muted sm-text">{tally(list).done}/{list.length} done{tally(list).missed > 0 && ` · ${tally(list).missed} not done`}</span>
              </div>
              {list.map((t, i) => item(t, i + 1))}
            </div>
          ))}
          {!todos.length && <Empty icon={ListChecks} title={`No tasks for this ${range}`}>{range === 'day' ? 'Fill in the form above and click Add task.' : 'Switch to Day to add one, or use the Board.'}</Empty>}
        </div>
      )}

      <TodoChart data={trend} selected={range === 'day' ? day : undefined} title={range === 'day' ? 'Last 7 days' : range === 'week' ? 'This week' : `${monthLabel(month)} at a glance`} />
    </>
  )
}
