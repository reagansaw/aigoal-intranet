import { useState } from 'react'
import { CalendarSync } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Modal from './Modal'
import { Alert, Msg } from './ui'

/** Admin: pull Onboarding 1/2/3, DEMO and Consultation bookings now, with a pasted AIGOAL token (used once, never stored). */
export default function SyncCalendar({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [lines, setLines] = useState<string[]>([])

  const run = async () => {
    setBusy(true); setMsg(''); setLines([])
    const { data, error } = await supabase.functions.invoke('sync-onboarding', { body: { token: token.trim() } })
    let m = ''
    if (error) { try { m = (await (error as any).context.json()).error } catch { m = error.message } }
    setBusy(false)
    if (m) return setMsg(m)
    setToken('')
    setMsg(`Synced ${data.synced} onboarding session(s) and ${data.demos_synced} demo / consultation booking(s) ✓`)
    const l: string[] = []
    if (data.set_pending_demo) l.push(`${data.set_pending_demo} lead(s) with an upcoming booking were set to Pending Demo / Consultation.`)
    if (data.unmatched?.length) l.push(`Onboarding with no matching account: ${data.unmatched.join('; ')}`)
    if (data.demos_unmatched?.length) l.push(`Bookings with no matching lead: ${data.demos_unmatched.join('; ')}`)
    setLines(l); onDone()
  }

  return (
    <Modal title="Sync AIGOAL calendar" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>Pulls <b>Onboarding 1 / 2 / 3</b>, <b>DEMO</b> and <b>Consultation</b> bookings from app.aigoal.ai. Onboarding goes to the matching purchase account and the others to the matching lead (by phone, then email).</p>
      <div className="field"><label>AIGOAL API token (expires in about an hour; used once and not stored)</label>
        <textarea autoFocus value={token} onChange={(e) => setToken(e.target.value)} style={{ minHeight: 70, fontFamily: 'monospace', fontSize: '.78rem' }} /></div>
      {msg && !msg.includes('✓') && <Alert text={msg} />}
      {msg.includes('✓') && <Msg text={msg} />}
      {lines.map((l, i) => <div key={i} className="alert" style={{ marginTop: '.6rem' }}>{l}</div>)}
      <div className="modal-foot"><button className="primary" disabled={busy || token.trim().length < 20} onClick={run}><CalendarSync size={16} />{busy ? 'Syncing…' : 'Sync now'}</button></div>
    </Modal>
  )
}
