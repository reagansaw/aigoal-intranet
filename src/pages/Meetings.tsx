import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck, CheckCircle2, ListPlus, NotebookPen, Pencil, Plus, Save, Trash2, Users } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useStaff } from '../lib/useStaff'
import { dayLabel, today } from '../lib/util'
import Modal from '../components/Modal'
import { Alert, DatePicker, Empty, PageHeader, Pagination, SearchBox, Select, usePaged } from '../components/ui'
import type { Meeting, MeetingTask } from '../lib/types'

type Draft = { meeting: Partial<Meeting>; tasks: Partial<MeetingTask>[] }
const uid = () => 'new-' + Math.random().toString(36).slice(2)
const isNew = (id?: string) => !id || id.startsWith('new-')

export default function Meetings() {
  const { profile, isAdmin } = useAuth()
  const staff = useStaff()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [tasks, setTasks] = useState<MeetingTask[]>([])
  const [tab, setTab] = useState<'meetings' | 'mine'>('meetings')
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [orig, setOrig] = useState<string[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const nameOf = (id?: string | null) => staff.find((s) => s.id === id)?.full_name || '—'
  const load = async () => {
    const { data: m } = await supabase.from('meetings').select('*').order('meeting_date', { ascending: false }).order('created_at', { ascending: false })
    const { data: t } = await supabase.from('meeting_tasks').select('*').order('sort')
    setMeetings((m ?? []) as Meeting[]); setTasks((t ?? []) as MeetingTask[])
  }
  useEffect(() => { load() }, [])

  const open = (m?: Meeting) => {
    setErr('')
    if (!m) { setOrig([]); setDraft({ meeting: { title: '', meeting_date: today(), minute_taker_id: profile!.id, attendee_ids: [profile!.id], discussion: '' }, tasks: [] }); return }
    const ts = tasks.filter((t) => t.meeting_id === m.id)
    setOrig(ts.map((t) => t.id)); setDraft({ meeting: m, tasks: ts })
  }
  const canEdit = !draft?.meeting.id || isAdmin || draft.meeting.created_by === profile!.id || draft.meeting.minute_taker_id === profile!.id
  const setM = (k: keyof Meeting, v: any) => setDraft(draft && { ...draft, meeting: { ...draft.meeting, [k]: v } })
  const setT = (id: string, p: Partial<MeetingTask>) => setDraft(draft && { ...draft, tasks: draft.tasks.map((t) => (t.id === id ? { ...t, ...p } : t)) })
  const toggleAttendee = (id: string) => setM('attendee_ids', draft!.meeting.attendee_ids!.includes(id) ? draft!.meeting.attendee_ids!.filter((x) => x !== id) : [...draft!.meeting.attendee_ids!, id])

  const save = async () => {
    if (!draft) return
    const { meeting } = draft
    if (!meeting.title?.trim()) return setErr('Give the meeting a title.')
    setBusy(true); setErr('')
    const body = { title: meeting.title.trim(), meeting_date: meeting.meeting_date, minute_taker_id: meeting.minute_taker_id || null, attendee_ids: meeting.attendee_ids ?? [], discussion: meeting.discussion || null }
    let id = meeting.id
    if (id) { const { error } = await supabase.from('meetings').update(body).eq('id', id); if (error) { setBusy(false); return setErr(error.message) } }
    else { const { data, error } = await supabase.from('meetings').insert(body).select('id').single(); if (error) { setBusy(false); return setErr(error.message) } id = data.id }
    const keep = draft.tasks.filter((t) => !isNew(t.id)).map((t) => t.id)
    const removed = orig.filter((x) => !keep.includes(x))
    if (removed.length) await supabase.from('meeting_tasks').delete().in('id', removed)
    const clean = draft.tasks.filter((t) => t.title?.trim())
    for (let i = 0; i < clean.length; i++) {
      const t = clean[i]; const row = { meeting_id: id, sort: i, title: t.title!.trim(), assignee_id: t.assignee_id || null, deadline: t.deadline || null, status: t.status ?? 'open' }
      const { error } = isNew(t.id) ? await supabase.from('meeting_tasks').insert(row) : await supabase.from('meeting_tasks').update(row).eq('id', t.id!)
      if (error) { setBusy(false); return setErr(error.message) }
    }
    setBusy(false); setDraft(null); load()
  }
  const del = async () => {
    if (draft?.meeting.id && confirm('Delete this meeting and its action items?')) { await supabase.from('meetings').delete().eq('id', draft.meeting.id); setDraft(null); load() }
  }
  const importTask = async (taskId: string) => {
    const { error } = await supabase.rpc('import_meeting_task', { task_id: taskId })
    if (error) return setErr(error.message)
    await load()
    if (draft) { const { data } = await supabase.from('meeting_tasks').select('*').eq('id', taskId).single(); if (data) setT(taskId, { todo_id: data.todo_id }) }
  }
  const toggleDone = async (t: MeetingTask) => { await supabase.from('meeting_tasks').update({ status: t.status === 'done' ? 'open' : 'done' }).eq('id', t.id); load() }

  const shown = meetings.filter((m) => !q || [m.title, m.discussion, nameOf(m.minute_taker_id)].join(' ').toLowerCase().includes(q.toLowerCase()))
  const { rows: pageRows, pager } = usePaged(shown, q)
  const mine = useMemo(() => tasks.filter((t) => t.assignee_id === profile!.id).sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || (a.deadline ?? '9').localeCompare(b.deadline ?? '9')), [tasks])
  const mineOpen = mine.filter((t) => t.status === 'open').length
  const titleOf = (id: string) => meetings.find((m) => m.id === id)?.title ?? ''
  const staffOpts = [{ value: '', label: 'Unassigned' }, ...staff.map((s) => ({ value: s.id, label: s.full_name || s.email || '' }))]

  return (
    <>
      <PageHeader title="Meeting Minutes" sub="Who wrote the summary, what was discussed, and who owns each action by when.">
        <SearchBox value={q} onChange={setQ} placeholder="Search meetings…" />
        <button className="primary" onClick={() => open()}><Plus size={16} />New meeting</button>
      </PageHeader>
      <div className="tabs">
        <button className={tab === 'meetings' ? 'on' : ''} onClick={() => setTab('meetings')}>Meetings</button>
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>My action items{mineOpen ? ` (${mineOpen})` : ''}</button>
      </div>

      {tab === 'meetings' && (
        <div className="card flush table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Meeting</th><th>Minutes by</th><th>Attendees</th><th>Actions</th><th></th></tr></thead>
            <tbody>
              {pageRows.map((m) => {
                const ts = tasks.filter((t) => t.meeting_id === m.id); const done = ts.filter((t) => t.status === 'done').length
                return (
                  <tr key={m.id} className="click" onClick={() => open(m)}>
                    <td className="nowrap">{dayLabel(m.meeting_date)}</td>
                    <td><div className="cell-title">{m.title}</div><div className="muted sm-text" style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.discussion}</div></td>
                    <td>{nameOf(m.minute_taker_id)}</td>
                    <td className="muted">{m.attendee_ids.map((a) => nameOf(a).split(' ')[0]).join(', ')}</td>
                    <td className="nowrap">{ts.length ? <span className={'tag ' + (done === ts.length ? 'good' : 'brand')}>{done}/{ts.length} done</span> : <span className="muted">—</span>}</td>
                    <td><Pencil size={15} className="i" style={{ color: 'var(--muted)' }} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!shown.length && <Empty icon={NotebookPen} title="No meetings yet">Create one to record the discussion and action items.</Empty>}
          <Pagination pager={pager} />
        </div>
      )}

      {tab === 'mine' && (
        <div className="card">
          {mine.map((t) => (
            <div key={t.id} className={'todo' + (t.status === 'done' ? ' done' : '')}>
              <input type="checkbox" checked={t.status === 'done'} onChange={() => toggleDone(t)} aria-label="Done" />
              <span className="t">{t.title}<div className="src">{titleOf(t.meeting_id)}</div></span>
              {t.deadline && <span className={'tag' + (t.status === 'open' && t.deadline < today() ? ' warn' : '')}>Due {dayLabel(t.deadline)}</span>}
              {t.todo_id ? <span className="tag good"><CheckCircle2 size={12} />In my To-Do</span>
                : <button className="sm" onClick={() => importTask(t.id)}><ListPlus size={14} />Add to my To-Do</button>}
            </div>
          ))}
          {!mine.length && <Empty icon={CalendarCheck} title="No action items for you">Tasks assigned to you in meetings will appear here.</Empty>}
          <Alert text={err} />
        </div>
      )}

      {draft && (
        <Modal wide title={draft.meeting.id ? draft.meeting.title || 'Meeting' : 'New meeting'} onClose={() => setDraft(null)}>
          <div className="form-grid">
            <div className="field"><label>Meeting title</label><input disabled={!canEdit} value={draft.meeting.title ?? ''} onChange={(e) => setM('title', e.target.value)} placeholder="e.g. Weekly sales sync" /></div>
            <div className="field"><label>Date</label><DatePicker value={draft.meeting.meeting_date} clearable={false} disabled={!canEdit} onChange={(v) => setM('meeting_date', v)} /></div>
            <div className="field"><label>Minutes written by (谁负责做总结)</label><Select block disabled={!canEdit} value={draft.meeting.minute_taker_id ?? ''} onChange={(v) => setM('minute_taker_id', v)} options={staffOpts} /></div>
          </div>
          <div className="field"><label><Users size={13} className="i" /> Attendees</label>
            <div className="chips">{staff.map((s) => <button key={s.id} type="button" disabled={!canEdit} className={'chip' + (draft.meeting.attendee_ids?.includes(s.id) ? ' on' : '')} onClick={() => toggleAttendee(s.id)}>{s.full_name || s.email}</button>)}</div>
          </div>
          <div className="field"><label>What was discussed (开会谈到的东西)</label><textarea disabled={!canEdit} style={{ minHeight: 160 }} value={draft.meeting.discussion ?? ''} onChange={(e) => setM('discussion', e.target.value)} placeholder="Topics, decisions, numbers, concerns…" /></div>

          <h2 style={{ marginTop: '1.2rem' }}>Action items (Task, 谁负责, deadline)</h2>
          {draft.tasks.map((t) => (
            <div key={t.id} className={'mtask' + (t.status === 'done' ? ' done' : '')}>
              <input type="checkbox" checked={t.status === 'done'} aria-label="Done" disabled={isNew(t.id) || (!canEdit && t.assignee_id !== profile!.id)}
                onChange={async () => { const s = t.status === 'done' ? 'open' : 'done'; setT(t.id!, { status: s }); if (!canEdit) { await supabase.from('meeting_tasks').update({ status: s }).eq('id', t.id!); load() } }} />
              <div className="mt-title"><input disabled={!canEdit} placeholder="Task" value={t.title ?? ''} onChange={(e) => setT(t.id!, { title: e.target.value })} /></div>
              <Select block disabled={!canEdit} value={t.assignee_id ?? ''} onChange={(v) => setT(t.id!, { assignee_id: v || null })} options={staffOpts} />
              <DatePicker value={t.deadline} placeholder="Deadline" disabled={!canEdit} onChange={(v) => setT(t.id!, { deadline: v || null })} />
              <div className="mt-acts">
                {t.todo_id ? <span className="tag good"><CheckCircle2 size={12} />In To-Do</span>
                  : <button type="button" className="sm" disabled={isNew(t.id) || !t.assignee_id} title={isNew(t.id) ? 'Save the meeting first' : 'Add to the responsible person\'s To-Do'} onClick={() => importTask(t.id!)}><ListPlus size={14} />To-Do</button>}
                {canEdit && <button type="button" className="ghost icon sm danger" aria-label="Remove" onClick={() => setDraft({ ...draft, tasks: draft.tasks.filter((x) => x.id !== t.id) })}><Trash2 size={15} /></button>}
              </div>
            </div>
          ))}
          {canEdit && <button type="button" style={{ marginTop: '.6rem' }} onClick={() => setDraft({ ...draft, tasks: [...draft.tasks, { id: uid(), title: '', status: 'open', assignee_id: null, deadline: null }] })}><Plus size={16} />Add action item</button>}
          <p className="muted sm-text">“To-Do” puts the task on the responsible person's To-Do list as <b>unscheduled</b>; they then pick the day they will do it.</p>

          <Alert text={err} />
          <div className="modal-foot">
            {canEdit && <button className="primary" disabled={busy} onClick={save}><Save size={16} />{busy ? 'Saving…' : 'Save meeting'}</button>}
            {canEdit && draft.meeting.id && <button className="danger" onClick={del}><Trash2 size={16} />Delete</button>}
          </div>
        </Modal>
      )}
    </>
  )
}
