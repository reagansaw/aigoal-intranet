import { useMemo, useState } from 'react'
import { UserCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Customer, Profile } from '../lib/types'
import Modal from './Modal'
import { Alert, Msg } from './ui'

const PRIS = ['P1', 'P2', 'P3', 'P4'] as const

/** Share the chosen leads equally between the chosen sales people, level within each of P1 / P2 / P3 / P4. */
export function splitLeads(leads: Customer[], people: string[]) {
  const out: Record<string, string[]> = Object.fromEntries(people.map((p) => [p, []]))
  const total: Record<string, number> = Object.fromEntries(people.map((p) => [p, 0]))
  for (const pri of PRIS) {
    const group = leads.filter((l) => l.priority === pri)
    // the person with the fewest leads so far goes first, so totals stay level across priorities too
    const order = [...people].sort((a, b) => total[a] - total[b])
    group.forEach((l, i) => { const p = order[i % order.length]; out[p].push(l.id); total[p]++ })
  }
  return out
}

export default function AssignLeads({ leads, sales, onClose, onDone }: { leads: Customer[]; sales: Profile[]; onClose: () => void; onDone: () => void }) {
  const [picked, setPicked] = useState<string[]>([])
  const [onlyFree, setOnlyFree] = useState(true)
  // webinars present in the list (oldest first); all ticked at the start
  const webinars = useMemo(() => {
    const m = new Map<string, { label: string; date: string; n: number; free: number }>()
    leads.forEach((l) => { const k = l.batch ?? 'No webinar'; const e = m.get(k) ?? { label: k, date: l.batch_date ?? '', n: 0, free: 0 }; e.n++; if (!l.owner_id && !l.owner_name) e.free++; m.set(k, e) })
    return [...m.values()].sort((a, b) => (a.date || '9').localeCompare(b.date || '9'))
  }, [leads])
  const [off, setOff] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [done, setDone] = useState(false)

  const pool = useMemo(() => leads.filter((l) => !off.includes(l.batch ?? 'No webinar') && (!onlyFree || (!l.owner_id && !l.owner_name))), [leads, onlyFree, off])
  const plan = useMemo(() => (picked.length ? splitLeads(pool, picked) : {}), [pool, picked])
  const count = (pid: string, pri?: string) => (plan[pid] ?? []).filter((id) => !pri || pool.find((l) => l.id === id)?.priority === pri).length
  const assigned = leads.length - leads.filter((l) => !l.owner_id && !l.owner_name).length

  const go = async () => {
    setBusy(true); setMsg('')
    for (const pid of picked) {
      const name = sales.find((s) => s.id === pid)?.full_name ?? null
      const ids = plan[pid] ?? []
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await supabase.from('customers').update({ owner_id: pid, owner_name: name }).in('id', ids.slice(i, i + 200))
        if (error) { setBusy(false); return setMsg(error.message) }
      }
    }
    setBusy(false); setDone(true); onDone()
  }

  return (
    <Modal title="Assign leads" sub={`${leads.length} lead${leads.length === 1 ? '' : 's'} to choose from`} onClose={onClose}>
      {done ? (<>
        <Msg text={`Assigned ${pool.length} lead(s) ✓`} />
        <div className="modal-foot"><button className="primary" onClick={onClose}>Done</button></div>
      </>) : (<>
        <p className="muted" style={{ marginTop: 0 }}>Pick who gets the leads. They are shared equally, level within each of P1, P2, P3 and P4.</p>
        <div className="field"><label>Webinar</label>
          <div className="chips">
            {webinars.filter((w) => (onlyFree ? w.free : w.n) > 0).map((w) => { const on = !off.includes(w.label); return <button key={w.label} type="button" aria-pressed={on} className={'chip' + (on ? ' on' : '')} onClick={() => setOff(on ? [...off, w.label] : off.filter((x) => x !== w.label))}>{w.label} <span className="muted">· {onlyFree ? w.free : w.n}</span></button> })}
          </div>
          <div className="row sm-text muted" style={{ gap: '.6rem', marginTop: '.3rem' }}>
            <button type="button" className="ghost sm" onClick={() => setOff([])}>All webinars</button>
            <button type="button" className="ghost sm" onClick={() => setOff(webinars.map((w) => w.label))}>None</button>
          </div></div>
        <div className="field"><label>Sales people</label>
          <div className="chips">{sales.map((s) => <button key={s.id} type="button" className={'chip' + (picked.includes(s.id) ? ' on' : '')} onClick={() => setPicked(picked.includes(s.id) ? picked.filter((x) => x !== s.id) : [...picked, s.id])}>{s.full_name}</button>)}</div></div>
        {assigned > 0 && (
          <label className="row" style={{ gap: '.5rem', margin: '.2rem 0 .8rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} style={{ width: 'auto' }} />
            <span>Only leads with no sales person yet <span className="muted">({assigned} of the selected already have one{onlyFree ? ' and are skipped' : ' and will be moved'})</span></span>
          </label>
        )}
        {picked.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: '.8rem' }}>
            <table>
              <thead><tr><th>Person</th>{PRIS.map((p) => <th key={p} className="num">{p}</th>)}<th className="num">Total</th></tr></thead>
              <tbody>
                {picked.map((pid) => <tr key={pid}><td>{sales.find((s) => s.id === pid)?.full_name}</td>{PRIS.map((p) => <td key={p} className="num">{count(pid, p)}</td>)}<td className="num"><b>{count(pid)}</b></td></tr>)}
              </tbody>
              <tfoot><tr><th>Leads to assign</th>{PRIS.map((p) => <th key={p} className="num">{pool.filter((l) => l.priority === p).length}</th>)}<th className="num">{pool.length}</th></tr></tfoot>
            </table>
          </div>
        )}
        {msg && <Alert text={msg} />}
        <div className="modal-foot"><button className="primary" disabled={busy || !picked.length || !pool.length} onClick={go}><UserCheck size={16} />{busy ? 'Assigning…' : `Assign now${pool.length ? ` (${pool.length})` : ''}`}</button></div>
      </>)}
    </Modal>
  )
}
