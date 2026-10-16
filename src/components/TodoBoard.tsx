import { useState } from 'react'
import { CalendarClock, MoveRight, Plus, Save, Timer, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { addDays, dayLabel, today } from '../lib/util'
import { outcomeOf, klDay } from '../lib/todo'
import type { Todo } from '../lib/types'
import Modal from './Modal'
import { Alert, DatePicker, Menu, NumberInput, Select } from './ui'

type Col = 'todo' | 'done'
const COLS: { key: Col; title: string; hint: string; tone: string }[] = [
  { key: 'todo', title: 'To do', hint: 'Planned', tone: 'var(--brand)' },
  { key: 'done', title: 'Done', hint: 'Finished', tone: 'var(--ok)' },
]
const colOf = (t: Todo): Col => (t.status === 'done' || t.done ? 'done' : 'todo')
const dur = (m: number | null | undefined) => (!m ? '' : m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`)
const PRIORITIES = [{ value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }]
const rank = { high: 0, normal: 1, low: 2 }

/** Trello-style board for the month: drag a card between To schedule / To do / Doing / Done (or use the Move menu on a phone). */
export default function TodoBoard({ cards, uid, month, fallbackDay, onChange }: { cards: Todo[]; uid: string; month: string; fallbackDay?: string; onChange: () => void }) {
  const [drag, setDrag] = useState('')
  const [over, setOver] = useState<Col | ''>('')
  const [isNew, setIsNew] = useState(false)
  const [edit, setEdit] = useState<Todo | null>(null)
  const [unit, setUnit] = useState('min')
  const [err, setErr] = useState('')
  const inMonth = today().startsWith(month.slice(0, 7))
  const fb = fallbackDay ?? (inMonth ? today() : month)

  const patchOf = (t: Todo, to: Col): Record<string, unknown> =>
    ({ status: to, ...(t.due_date ? {} : { due_date: fb }) })
  const move = async (t: Todo, to: Col) => { if (colOf(t) === to) return; await supabase.from('todos').update(patchOf(t, to)).eq('id', t.id); onChange() }
  // "Add a card" opens the full card form straight away (list and day already filled in)
  const startNew = (to: Col) => {
    setEdit({ id: '', user_id: uid, title: '', notes: null, due_date: fb, duration_min: null, priority: 'normal', done: to === 'done', status: to, created_at: new Date().toISOString(), done_at: null, deadline: null, source: null, meeting_task_id: null } as Todo)
    setIsNew(true); setErr('')
  }
  const save = async () => {
    if (!edit || !edit.title.trim()) return setErr('Give the card a title.')
    if (!edit.due_date) return setErr('Choose a due date.')
    const row = { title: edit.title.trim(), notes: edit.notes?.trim() || null, due_date: edit.due_date || null, duration_min: edit.duration_min || null, priority: edit.priority, status: edit.status }
    const { error } = isNew ? await supabase.from('todos').insert({ ...row, user_id: uid }) : await supabase.from('todos').update(row).eq('id', edit.id)
    if (error) return setErr(error.message)
    setEdit(null); setIsNew(false); setErr(''); onChange()
  }
  const copyToday = async (t: Todo) => { await supabase.from('todos').insert({ user_id: uid, title: t.title, notes: t.notes, due_date: today(), duration_min: t.duration_min, priority: t.priority }); onChange() }
  const del = async () => { if (edit && confirm('Delete this card?')) { await supabase.from('todos').delete().eq('id', edit.id); setEdit(null); onChange() } }

  return (
    <>
      <div className="board">
        {COLS.map((c) => {
          const list = cards.filter((t) => colOf(t) === c.key).sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9') || rank[a.priority] - rank[b.priority])
          const mins = list.reduce((n, t) => n + (t.duration_min ?? 0), 0)
          return (
            <div key={c.key} className={'board-col' + (over === c.key ? ' over' : '')}
              onDragOver={(e) => { e.preventDefault(); setOver(c.key) }} onDragLeave={() => setOver((o) => (o === c.key ? '' : o))}
              onDrop={(e) => { e.preventDefault(); setOver(''); const t = cards.find((x) => x.id === drag); if (t) move(t, c.key) }}>
              <div className="board-head"><i style={{ background: c.tone }} /><b>{c.title}</b><span className="board-n">{list.length}</span>{mins > 0 && <span className="muted sm-text" style={{ marginLeft: 'auto' }}><Timer size={11} className="i" /> {dur(mins)}</span>}</div>
              <div className="board-list">
                {list.map((t, i) => (
                  <div key={t.id} className={'bcard pri-' + t.priority + (t.done ? ' done' : '') + (outcomeOf(t) === 'missed' ? ' missed' : '') + (drag === t.id ? ' dragging' : '')} draggable
                    onDragStart={(e) => { setDrag(t.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id) }} onDragEnd={() => { setDrag(''); setOver('') }}
                    onClick={() => { setEdit(t); setIsNew(false); setErr('') }}>
                    <div className="bcard-title"><span className="todo-n">{i + 1}</span><span>{t.title}</span></div>
                    {t.notes && <div className="bcard-notes">{t.notes}</div>}
                    <div className="bcard-meta">
                      <span className="tag" title="Created date">Created {dayLabel(klDay(t.created_at))}</span>
                      {outcomeOf(t) === 'done' && <span className="tag good">Done</span>}{outcomeOf(t) === 'missed' && <span className="tag bad">Not done</span>}
                      {t.due_date && <span className={'tag' + (outcomeOf(t) === 'missed' ? ' warn' : '')} title="Due date"><CalendarClock size={11} />Due {dayLabel(t.due_date)}</span>}
                      {t.duration_min ? <span className="tag"><Timer size={11} />{dur(t.duration_min)}</span> : null}
                      {t.priority === 'high' && <span className="tag warn">High</span>}
                      {t.source && <span className="tag brand" title={t.source}>Meeting</span>}
                      <span className="bcard-move" onClick={(e) => e.stopPropagation()}>
                        <Menu label="Move" icon={MoveRight} options={COLS.filter((x) => x.key !== c.key).map((x) => ({ value: x.key, label: x.title }))} onPick={(v) => move(t, v as Col)} />
                      </span>
                    </div>
                  </div>
                ))}
                {!list.length && <div className="board-empty">{c.hint}</div>}
              </div>
              {<button className="board-addbtn" onClick={() => startNew(c.key)}><Plus size={14} />Add a card</button>}
            </div>
          )
        })}
      </div>

      {edit && (
        <Modal title={isNew ? 'New card' : 'Card'} onClose={() => { setEdit(null); setIsNew(false) }}>
          <div className="field"><label>Title</label><input autoFocus value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
          <div className="form-grid">
            <div className="field"><label>Created date</label><input disabled value={dayLabel(klDay(edit.created_at))} title="Set automatically" /></div>
            <div className="field"><label>Due date</label><DatePicker value={edit.due_date ?? ''} clearable={false} onChange={(v) => setEdit({ ...edit, due_date: v || null })} /></div>
            <div className="field"><label>Time needed</label>
              <div className="row" style={{ flexWrap: 'nowrap' }}><div style={{ flex: 1 }}><NumberInput value={edit.duration_min ? (unit === 'h' ? Math.round((edit.duration_min / 60) * 100) / 100 : edit.duration_min) : null} onChange={(n) => setEdit({ ...edit, duration_min: n ? Math.round(n * (unit === 'h' ? 60 : 1)) : null })} placeholder="e.g. 30" /></div>
                <Select value={unit} onChange={setUnit} options={[{ value: 'min', label: 'minutes' }, { value: 'h', label: 'hours' }]} /></div></div>
            <div className="field"><label>Priority</label><Select block value={edit.priority} onChange={(v) => setEdit({ ...edit, priority: v as Todo['priority'] })} options={PRIORITIES} /></div>
            <div className="field"><label>List</label><Select block value={colOf(edit)} onChange={(v) => setEdit({ ...edit, ...(patchOf(edit, v as Col) as Partial<Todo>), done: v === 'done' })} options={COLS.map((x) => ({ value: x.key, label: x.title }))} /></div>
          </div>
          <div className="field"><label>Remarks</label><textarea style={{ minHeight: 90 }} value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} placeholder="Details, links, what done looks like…" /></div>
          {edit.source && <p className="muted sm-text">From: {edit.source}</p>}
          {err && <Alert text={err} />}
          <div className="modal-foot"><button className="primary" onClick={save}><Save size={16} />{isNew ? 'Add card' : 'Save'}</button>{!isNew && outcomeOf(edit) === 'missed' && <button type="button" onClick={async () => { await copyToday(edit); setEdit(null) }}>Copy to today</button>}{!isNew && <button className="danger" onClick={del}><Trash2 size={16} />Delete</button>}</div>
        </Modal>
      )}
    </>
  )
}
