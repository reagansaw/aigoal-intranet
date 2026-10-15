import { useEffect, useState } from 'react'
import { AlertTriangle, Bell, CheckCircle2, MessageSquarePlus, StickyNote, Undo2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { ago } from '../lib/audit'
import { dayLabel, today } from '../lib/util'
import { DatePicker, Empty, initials } from './ui'
import type { AccountNote } from '../lib/types'

const KINDS = [
  { v: 'followup', label: 'Follow-up', icon: MessageSquarePlus },
  { v: 'issue', label: 'Issue', icon: AlertTriangle },
  { v: 'remark', label: 'Remark', icon: StickyNote },
] as const

/** Dated, signed follow-up timeline for one account (many entries over time; nothing is overwritten). */
export default function AccountNotes({ accountId, onChange, refreshKey }: { accountId: string; onChange?: () => void; refreshKey?: number }) {
  const { profile } = useAuth()
  const [notes, setNotes] = useState<AccountNote[] | null>(null)
  const [kind, setKind] = useState<'followup' | 'issue' | 'remark'>('followup')
  const [body, setBody] = useState('')
  const [next, setNext] = useState('')
  const [due, setDue] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const { data } = await supabase.from('account_notes').select('*').eq('account_id', accountId).order('created_at', { ascending: false }).limit(300)
    setNotes((data ?? []) as AccountNote[])
  }
  useEffect(() => { load() }, [accountId, refreshKey])

  const add = async () => {
    if (!body.trim()) return
    setBusy(true); setErr('')
    const { error } = await supabase.from('account_notes').insert({ account_id: accountId, kind, body: body.trim(), next_action: kind === 'remark' ? null : next.trim() || null, deadline: kind === 'remark' ? null : due || null, author_id: profile!.id })
    setBusy(false)
    if (error) return setErr(error.message)
    setBody(''); setNext(''); setDue(''); load(); onChange?.()
  }
  const resolve = async (n: AccountNote, resolved: boolean) => { await supabase.from('account_notes').update({ resolved }).eq('id', n.id); load(); onChange?.() }

  return (
    <div>
      <div className="composer">
        <div className="kinds">
          {KINDS.map((k) => <button key={k.v} type="button" className={kind === k.v ? 'on' : ''} onClick={() => setKind(k.v)}><k.icon size={14} />{k.label}</button>)}
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={kind === 'issue' ? 'What is the problem?' : kind === 'remark' ? 'Write a remark about this customer…' : 'What happened in this follow-up?'} />
        {kind !== 'remark' && (
          <div className="form-grid" style={{ marginTop: '.6rem' }}>
            <div><label>Next action (optional)</label><input value={next} onChange={(e) => setNext(e.target.value)} placeholder="e.g. Call again on Monday" /></div>
            <div><label>Deadline (optional)</label><DatePicker value={due} onChange={setDue} /></div>
          </div>
        )}
        {err && <div className="alert" style={{ marginTop: '.6rem' }}>{err}</div>}
        <div className="row" style={{ marginTop: '.7rem' }}>
          <button type="button" className="primary" disabled={busy || !body.trim()} onClick={add}>Add to timeline</button>
          <span className="muted sm-text">Signed with your name and the time. Entries cannot be edited.</span>
        </div>
      </div>

      {notes === null && <p className="muted">Loading…</p>}
      {notes?.length === 0 && <Empty icon={MessageSquarePlus} title="No follow-ups yet">Add the first one above.</Empty>}
      <div className="tl">
        {notes?.map((n) => (
          <div key={n.id} className={'tl-item' + (n.kind === 'reminder' ? ' tl-sys' : '')}>
            <div className="avatar">{n.kind === 'reminder' ? <Bell size={15} /> : initials(n.author_name)}</div>
            <div className="tl-body">
              <div className="tl-head">
                <b>{n.author_name}</b>
                {n.kind === 'issue' && <span className={'tag ' + (n.resolved ? 'good' : 'warn')}>{n.resolved ? 'Issue resolved' : 'Issue'}</span>}
                {n.kind === 'remark' && <span className="tag">Remark</span>}
                {n.kind === 'followup' && <span className="tag brand">Follow-up</span>}
                {n.kind === 'reminder' && <span className="tag warn">Reminder</span>}
                <span className="muted sm-text" title={new Date(n.created_at).toLocaleString('en-GB')}>{ago(n.created_at)}</span>
              </div>
              <div className="tl-text">{n.body}</div>
              <div className="tl-meta">
                {n.next_action && <span className="tag">Next: {n.next_action}</span>}
                {n.deadline && <span className={'tag' + (n.deadline < today() && !n.resolved ? ' warn' : '')}>Due {dayLabel(n.deadline)}</span>}
                {n.kind === 'issue' && !n.resolved && <button type="button" className="sm" onClick={() => resolve(n, true)}><CheckCircle2 size={14} />Mark resolved</button>}
                {n.kind === 'issue' && n.resolved && <><span className="muted sm-text">by {n.resolved_by_name}</span><button type="button" className="ghost sm" onClick={() => resolve(n, false)}><Undo2 size={13} />Reopen</button></>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
