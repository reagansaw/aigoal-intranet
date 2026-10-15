import { useEffect, useRef, useState } from 'react'
import { Check, Mic, Sparkles, Square } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useStaff } from '../lib/useStaff'
import { dayLabel as niceDate } from '../lib/util'
import Modal from './Modal'
import { Alert, Msg, Select } from './ui'

type Parsed = {
  target: 'customer' | 'account'; name: string; action: 'note' | 'status' | 'remind' | 'unsupported'
  note_kind?: 'followup' | 'call' | 'remark' | 'issue'; body?: string; next_action?: string; deadline?: string
  status?: 'pending_management' | 'potential' | 'invite_webinar' | 'none'; status_remark?: string; invite_date?: string
  remind_person?: string; why_unsupported?: string
}
type Cand = { id: string; label: string; sub: string }
const STATUS_LABEL: Record<string, string> = { pending_management: 'Pending Management', potential: 'Potential', invite_webinar: 'Invite Webinar', none: 'No status' }

/** Speak (or type) an update; it is understood, previewed, and only saved when you confirm. Saves through the normal rules for your login. */
export default function VoiceUpdate({ page, onClose, onDone }: { page: 'customer' | 'account'; onClose: () => void; onDone: () => void }) {
  const { profile } = useAuth()
  const staff = useStaff()
  const [lang, setLang] = useState('en-US')
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [res, setRes] = useState<{ parsed: Parsed; candidates: Cand[] } | null>(null)
  const [pick, setPick] = useState('')
  const [saved, setSaved] = useState('')
  const rec = useRef<any>(null)
  const SR = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null

  useEffect(() => () => rec.current?.stop?.(), [])
  const toggle = () => {
    if (listening) { rec.current?.stop(); return }
    const r = new SR(); rec.current = r
    r.lang = lang; r.interimResults = true; r.continuous = true
    const base = text ? text.trimEnd() + ' ' : ''
    r.onresult = (e: any) => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; setText(base + t) }
    r.onerror = () => setListening(false); r.onend = () => setListening(false)
    r.start(); setListening(true); setErr('')
  }

  const understand = async () => {
    rec.current?.stop(); setBusy(true); setErr(''); setRes(null)
    const { data, error } = await supabase.functions.invoke('voice-update', { body: { text, hint: page } })
    setBusy(false)
    if (error) { try { return setErr((await (error as any).context.json()).error) } catch { return setErr('Could not reach the server. Try again.') } }
    setRes(data); setPick(data.candidates?.[0]?.id ?? '')
  }

  const p = res?.parsed
  const person = p?.action === 'remind' ? staff.find((s) => (s.full_name || '').toLowerCase().startsWith((p.remind_person || '~').toLowerCase())) : undefined
  const needReason = p?.action === 'status' && (p.status === 'pending_management' || p.status === 'potential') && !p.status_remark
  const needDate = p?.action === 'status' && p.status === 'invite_webinar' && !p.invite_date
  const ready = !!p && p.action !== 'unsupported' && !!pick && !needReason && !needDate && (p.action !== 'remind' || !!person) && (p.action !== 'note' || !!p.body) && (p.action !== 'status' || p.target === 'customer')

  const confirm = async () => {
    if (!p || !ready) return
    setBusy(true); setErr('')
    let error: { message: string } | null = null
    if (p.action === 'note') {
      const table = p.target === 'customer' ? 'customer_notes' : 'account_notes'
      const fk = p.target === 'customer' ? 'customer_id' : 'account_id'
      const kind = p.target === 'customer' ? (p.note_kind === 'issue' ? 'remark' : p.note_kind ?? 'followup') : p.note_kind === 'call' ? 'followup' : p.note_kind ?? 'followup'
      ;({ error } = await supabase.from(table).insert({ [fk]: pick, kind, body: p.body, next_action: kind === 'remark' ? null : p.next_action || null, deadline: kind === 'remark' ? null : p.deadline || null, author_id: profile!.id }))
    } else if (p.action === 'status') {
      const patch: Record<string, unknown> = { lead_status: p.status === 'none' ? null : p.status }
      if (p.status_remark) patch.status_remark = p.status_remark
      if (p.invite_date) patch.webinar_invite_date = p.invite_date
      ;({ error } = await supabase.from('customers').update(patch).eq('id', pick))
    } else if (p.action === 'remind') {
      ;({ error } = await supabase.rpc('remind_account', { account_id: pick, person_id: person!.id, note: p.body || p.next_action || null }))
    }
    setBusy(false)
    if (error) return setErr(error.message)
    setSaved('Saved ✓'); onDone()
  }

  const summary = !p ? '' : p.action === 'note' ? `Add a ${p.note_kind ?? 'follow-up'}${p.target === 'customer' ? ' note' : ' to the timeline'}` : p.action === 'status' ? `Set status to ${STATUS_LABEL[p.status ?? 'none']}` : p.action === 'remind' ? `Remind ${person?.full_name ?? p.remind_person ?? '…'}` : 'Not supported'

  return (
    <Modal title="Voice update" sub={page === 'customer' ? 'Follow-Up Customers' : 'Purchase Accounts'} onClose={onClose}>
      {saved ? (<><Msg text={saved} /><div className="modal-foot"><button className="primary" onClick={onClose}>Done</button></div></>) : (<>
        <p className="muted" style={{ marginTop: 0 }}>Say who it is about and what happened, for example <i>“Tan Ah Meng, called today, wants the demo, follow up on Friday.”</i> Nothing is saved until you confirm.</p>
        <div className="row" style={{ gap: '.6rem', marginBottom: '.6rem' }}>
          {SR ? <button type="button" className={listening ? 'danger' : 'primary'} onClick={toggle}>{listening ? <Square size={16} /> : <Mic size={16} />}{listening ? 'Stop' : 'Speak'}</button> : <span className="muted sm-text">This browser has no speech input. Type instead, or use Chrome / Safari.</span>}
          <Select value={lang} onChange={setLang} options={[{ value: 'en-US', label: 'English' }, { value: 'zh-CN', label: '中文' }, { value: 'ms-MY', label: 'Bahasa Melayu' }]} />
        </div>
        <div className="field"><textarea style={{ minHeight: 100 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Your update will appear here as you speak. You can edit it." /></div>
        <button type="button" className="primary" disabled={busy || text.trim().length < 3} onClick={understand}><Sparkles size={16} />{busy && !res ? 'Reading…' : 'Understand'}</button>
        {err && <div style={{ marginTop: '.8rem' }}><Alert text={err} /></div>}

        {p && (
          <div className="pend none" style={{ display: 'block', marginTop: '1rem' }}>
            <b>{summary}</b>
            {p.action === 'unsupported' ? <div className="muted sm-text" style={{ marginTop: 4 }}>{p.why_unsupported || 'Please do this one on the page.'}</div> : (<>
              <div className="field" style={{ marginTop: '.6rem' }}><label>Who ({p.target === 'customer' ? 'lead' : 'account'}) · heard “{p.name}”</label>
                {res!.candidates.length ? <Select block value={pick} onChange={setPick} options={res!.candidates.map((c) => ({ value: c.id, label: c.label, hint: c.sub }))} /> : <div className="muted sm-text">No match for “{p.name}”. Check the name, or use the other list.</div>}</div>
              {p.body && <div className="sm-text" style={{ margin: '.3rem 0' }}>{p.body}</div>}
              {p.next_action && <div className="sm-text"><b>Next:</b> {p.next_action}{p.deadline && <> · by <b>{niceDate(p.deadline)}</b></>}</div>}
              {p.action === 'status' && p.status_remark && <div className="sm-text"><b>Reason:</b> {p.status_remark}</div>}
              {p.action === 'status' && p.target !== 'customer' && <div className="muted sm-text">Status only applies to leads.</div>}
              {needReason && <div className="muted sm-text">This status needs a reason. Say it too, then Understand again.</div>}
              {needDate && <div className="muted sm-text">Which webinar date? Say it too, then Understand again.</div>}
              {p.action === 'remind' && !person && <div className="muted sm-text">Who should be reminded? Say a team member's first name.</div>}
            </>)}
          </div>
        )}
        <div className="modal-foot"><button className="primary" disabled={!ready || busy} onClick={confirm}><Check size={16} />{busy && res ? 'Saving…' : 'Confirm and save'}</button></div>
      </>)}
    </Modal>
  )
}
