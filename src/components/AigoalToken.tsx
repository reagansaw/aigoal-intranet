import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Modal from './Modal'
import { Alert, Msg } from './ui'

/** Admin: paste the AIGOAL login token; it is checked, saved for the automatic sync and the calendar goes Live until it expires. */
export default function AigoalToken({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState(false)
  // Paste the whole "TOKEN=… TENANT=…" block if you like: only the token is used
  const token = text.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/)?.[0] ?? text.trim().replace(/^bearer\s+/i, '').replace(/^TOKEN=/, '').replace(/["'\s]/g, '')

  const save = async () => {
    setBusy(true); setMsg('')
    const { data, error } = await supabase.functions.invoke('sync-onboarding', { body: { token, save: true } })
    let m = ''
    if (error) { try { m = (await (error as any).context.json()).error } catch { m = 'Could not reach the server. Check your connection and try again.' } }
    setBusy(false)
    if (m) return setMsg(m)
    setText(''); setOk(true)
    const until = data.token_expires_at ? new Date(data.token_expires_at).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' }) : null
    setMsg(`Calendar is Live ✓ Synced ${data.synced} onboarding and ${data.demos_synced} demo / consultation booking(s).${until ? ` The token works until about ${until} (Malaysia time), then paste a new one.` : ''}`)
    onDone()
  }

  return (
    <Modal title="AIGOAL token" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>Paste the token from AIGOAL (it lasts about an hour). It is checked, saved for the automatic 30-minute sync, and the calendar goes Live until it expires.</p>
      <div className="field"><label>Token</label>
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="TOKEN=eyJhbGciOi…" style={{ minHeight: 90, fontFamily: 'monospace', fontSize: '.78rem' }} /></div>
      {msg && !ok && <Alert text={msg} />}
      {ok && <Msg text={msg} />}
      <div className="modal-foot"><button className="primary" disabled={busy || ok || token.length < 20} onClick={save}><KeyRound size={16} />{busy ? 'Checking…' : 'Save and go Live'}</button></div>
    </Modal>
  )
}
