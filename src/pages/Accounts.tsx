import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, BadgeCheck, CalendarSync, MessageSquareQuote, Pencil, Plus, ReceiptText, Save, Trash2, Users, Video } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import Modal from '../components/Modal'
import AuditTrail from '../components/AuditTrail'
import { Alert, DatePicker, Empty, Msg, PageHeader, Pagination, SearchBox, Select, Stat, opts, usePaged } from '../components/ui'
import { applyOwner, ownerOptions, ownerValue } from '../lib/owners'
import { useStaff } from '../lib/useStaff'
import type { OnboardingSession, PurchaseAccount } from '../lib/types'

const IN_USE = [{ value: '', label: 'Unknown' }, { value: 'Y', label: 'Yes, in use' }, { value: 'P', label: 'Partially' }, { value: 'N', label: 'Not using' }]
const STAGES = [{ value: '', label: 'Not set' }, { value: '1', label: 'Stage 1' }, { value: '2', label: 'Stage 2' }, { value: '3', label: 'Stage 3' }]
const MILESTONES: [keyof PurchaseAccount, string][] = [
  ['opened_by', 'Account opened by (开户)'], ['docs_provided', 'Docs provided (资料提供)'],
  ['chatbot_done', 'Chat bot done'], ['landing_page_done', 'Landing page done'],
  ['optimised', 'Optimised (优化完成)'], ['maintenance', 'Maintenance'],
]
const blank: Partial<PurchaseAccount> = { product: 'AIGOAL', account_name: '', testimonial: false }
const ROUNDS: [1 | 2 | 3, string, keyof PurchaseAccount][] = [[1, 'Onboarding 1', 'coaching_1'], [2, 'Onboarding 2', 'coaching_2'], [3, 'Onboarding 3', 'final_coaching']]
const KL = 'Asia/Kuala_Lumpur'
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: KL })
const fmtFull = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: KL })
const useLabel = (v: string | null) => IN_USE.find((o) => o.value === (v ?? ''))?.label ?? v

export default function Accounts() {
  const { isAdmin } = useAuth()
  const staff = useStaff()
  const [rows, setRows] = useState<PurchaseAccount[]>([])
  const [q, setQ] = useState('')
  const [stage, setStage] = useState('all')
  const [use, setUse] = useState('all')
  const [sales, setSales] = useState('all')
  const [edit, setEdit] = useState<Partial<PurchaseAccount> | null>(null)
  const [err, setErr] = useState('')
  const [sessions, setSessions] = useState<OnboardingSession[]>([])
  const [sync, setSync] = useState<{ token: string; busy: boolean; msg: string; unmatched: string[] } | null>(null)

  const load = async () => {
    const { data } = await supabase.from('purchase_accounts').select('*').order('purchase_date', { ascending: false, nullsFirst: false }).limit(5000)
    setRows((data ?? []) as PurchaseAccount[])
    const { data: ss } = await supabase.from('onboarding_sessions').select('*').order('start_at')
    setSessions((ss ?? []) as OnboardingSession[])
  }
  useEffect(() => { load() }, [])

  const salesList = useMemo(() => [...new Set(rows.map((r) => r.sales).filter(Boolean))] as string[], [rows])
  const shown = rows.filter((r) =>
    (stage === 'all' || (r.onboarding_stage ?? '') === stage) && (use === 'all' || (r.in_use ?? '') === use) && (sales === 'all' || r.sales === sales) &&
    (!q || [r.account_name, r.owner_name, r.contact_person, r.phone, r.email, r.industry, r.remarks, r.action_plan].join(' ').toLowerCase().includes(q.toLowerCase())))

  const { rows: pageRows, pager } = usePaged(shown, JSON.stringify([q, stage, use, sales]))
  const ownersAll = useMemo(() => rows.map((r) => r.owner_name ?? ''), [rows])

  // latest non-cancelled booking per round for an account
  const roundOf = (accountId: string, round: number) =>
    sessions.filter((x) => x.account_id === accountId && x.round === round && x.status !== 'cancelled').sort((a, b) => b.start_at.localeCompare(a.start_at))[0]
  const runSync = async () => {
    if (!sync) return
    setSync({ ...sync, busy: true, msg: '', unmatched: [] })
    const { data, error } = await supabase.functions.invoke('sync-onboarding', { body: { token: sync.token.trim() } })
    let m = ''
    if (error) { try { m = (await (error as any).context.json()).error } catch { m = error.message } }
    if (m) return setSync({ ...sync, busy: false, msg: m, unmatched: [] })
    setSync({ token: '', busy: false, msg: `Synced ${data.synced} onboarding session(s) from ${data.onboarding_found} found ✓`, unmatched: data.unmatched ?? [] })
    load()
  }

  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!edit) return
    const { id, ...rest } = edit as PurchaseAccount
    const payload = { ...rest, purchase_date: rest.purchase_date || null, deadline: rest.deadline || null, updated_at: new Date().toISOString() }
    const { error } = id ? await supabase.from('purchase_accounts').update(payload).eq('id', id) : await supabase.from('purchase_accounts').insert(payload)
    if (error) return setErr(error.message)
    setEdit(null); setErr(''); load()
  }
  const del = async () => {
    if (edit?.id && confirm('Delete this account?')) { await supabase.from('purchase_accounts').delete().eq('id', edit.id); setEdit(null); load() }
  }
  const set = (k: keyof PurchaseAccount, v: any) => setEdit({ ...edit, [k]: v })
  const txt = (k: keyof PurchaseAccount, label: string, area = false) => (
    <div className="field"><label>{label}</label>
      {area ? <textarea value={(edit?.[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} /> : <input value={(edit?.[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} />}
    </div>
  )

  return (
    <>
      <PageHeader title="Purchase Accounts" sub={isAdmin ? 'All customers who bought AIGOAL, and where they are in onboarding.' : 'Your customers who bought AIGOAL, and where they are in onboarding.'}>
        {isAdmin && <button onClick={() => setSync({ token: '', busy: false, msg: '', unmatched: [] })}><CalendarSync size={16} />Sync AIGOAL calendar</button>}
        <button className="primary" onClick={() => { setEdit({ ...blank }); setErr('') }}><Plus size={16} />Add account</button>
      </PageHeader>
      <div className="grid">
        <Stat icon={Users} label="Total accounts" value={rows.length} />
        <Stat icon={BadgeCheck} tone="green" label="In use" value={rows.filter((r) => r.in_use === 'Y').length} />
        <Stat icon={AlertTriangle} tone="orange" label="With open issues" value={rows.filter((r) => r.issues).length} />
        <Stat icon={MessageSquareQuote} tone="yellow" label="Testimonials" value={rows.filter((r) => r.testimonial).length} />
      </div>
      <div className="row" style={{ marginBottom: '1rem' }}>
        <SearchBox value={q} onChange={setQ} placeholder="Search name, phone, industry, notes…" />
        <Select value={stage} onChange={setStage} options={[{ value: 'all', label: 'All stages' }, ...STAGES.slice(1)]} />
        <Select value={use} onChange={setUse} options={[{ value: 'all', label: 'Any usage' }, ...IN_USE]} />
        <Select value={sales} onChange={setSales} options={[{ value: 'all', label: 'All sales' }, ...opts(salesList)]} />
        <span className="muted sm-text">{shown.length} shown</span>
      </div>
      <div className="card flush table-wrap">
        <table>
          <thead><tr><th>Account</th><th>Name</th><th>Email</th><th>Phone</th><th>Industry</th><th>Purchased</th><th>Stage</th><th>Onboarding</th><th>In use</th><th>{isAdmin ? 'Assigned to' : 'Sales'}</th><th>Issue / next action</th><th>Deadline</th><th></th></tr></thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id} className="click" onClick={() => { setEdit(r); setErr('') }}>
                <td><div className="cell-title">{r.account_name}</div><div className="muted sm-text">{r.category}</div></td>
                <td className="cell-title">{r.contact_person || <span className="muted">—</span>}</td>
                <td>{r.email ? <a href={`mailto:${r.email}`} onClick={(e) => e.stopPropagation()}>{r.email}</a> : <span className="muted">—</span>}</td>
                <td className="nowrap">{r.phone ? <a href={`https://wa.me/${r.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{r.phone}</a> : <span className="muted">—</span>}</td>
                <td>{r.industry}</td><td className="nowrap">{r.purchase_date}</td>
                <td className="nowrap">{r.onboarding_stage && <span className="tag brand">Stage {r.onboarding_stage}</span>}</td>
                <td className="nowrap">
                  {ROUNDS.map(([n, , legacy]) => {
                    const x = roundOf(r.id, n)
                    return <div key={n} className="sm-text">{x ? <><span className={'tag ' + (x.status === 'completed' ? 'good' : 'brand')} style={{ marginRight: 4 }}>{n}</span>{fmtDay(x.start_at)}</> : (r[legacy] ? <span className="muted"><span className="tag" style={{ marginRight: 4 }}>{n}</span>{String(r[legacy])}</span> : null)}</div>
                  })}
                </td>
                <td>{r.in_use && <span className={'tag ' + (r.in_use === 'Y' ? 'good' : r.in_use === 'N' ? 'warn' : '')}>{useLabel(r.in_use)}</span>}</td>
                <td>{isAdmin ? (r.owner_name || <span className="muted">Unassigned</span>) : (r.sales ?? r.closed_by)}</td>
                <td style={{ maxWidth: 320 }}>{r.issues && <div className="cell-title">{r.issues}</div>}<div className="muted sm-text pre">{r.action_plan}</div></td>
                <td className="nowrap">{r.deadline}</td>
                <td><Pencil size={15} className="i" style={{ color: 'var(--muted)' }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <Empty icon={ReceiptText} title="No accounts found">{isAdmin ? 'Try clearing the filters.' : 'No purchase accounts are assigned to you yet.'}</Empty>}
        <Pagination pager={pager} />
      </div>

      {edit && (
        <Modal title={edit.id ? edit.account_name || 'Account' : 'Add account'} onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            <h2>Account</h2>
            <div className="form-grid">
              <div className="field"><label>System / company name</label><input required value={edit.account_name ?? ''} onChange={(e) => set('account_name', e.target.value)} /></div>
              {txt('contact_person', 'Contact person')}{txt('phone', 'Phone')}{txt('email', 'Register email')}{txt('industry', 'Industry')}{txt('category', 'Category')}
              <div className="field"><label>Purchase date</label><DatePicker value={edit.purchase_date ?? ''} onChange={(v) => set('purchase_date', v)} /></div>
              {isAdmin && <div className="field"><label>Assigned to (who sees this account)</label><Select block value={ownerValue(edit)} onChange={(v) => setEdit(applyOwner(edit, v, staff))} options={ownerOptions(staff, ownersAll)} /></div>}
              {txt('closed_by', 'Closed via (成交)')}{txt('sales', 'Sales')}
              <div className="field"><label>Onboarding stage</label><Select block value={edit.onboarding_stage ?? ''} onChange={(v) => set('onboarding_stage', v || null)} options={STAGES} /></div>
              <div className="field"><label>In use</label><Select block value={edit.in_use ?? ''} onChange={(v) => set('in_use', v || null)} options={IN_USE} /></div>
              {txt('ai_builder', 'AI builder')}{txt('ai_builder_2', 'AI builder 2')}{txt('whatsapp_group', 'WhatsApp group link')}
            </div>
            <label className="check" style={{ marginBottom: '1rem' }}><input type="checkbox" checked={edit.testimonial ?? false} onChange={(e) => set('testimonial', e.target.checked)} />Testimonial received</label>

            <h2>Follow-up</h2>
            <div className="form-grid">{txt('remarks', 'Remarks', true)}{txt('issues', 'Issues', true)}{txt('action_plan', 'Next action', true)}
              <div className="field"><label>Deadline</label><DatePicker value={edit.deadline ?? ''} onChange={(v) => set('deadline', v)} /></div>
            </div>

            {edit.id && (
              <>
                <h2>Onboarding sessions <span className="muted sm-text" style={{ fontWeight: 400 }}>from the AIGOAL calendar (read-only)</span></h2>
                <div style={{ marginBottom: '1rem' }}>
                  {ROUNDS.map(([n, label, legacy]) => {
                    const x = roundOf(edit.id!, n)
                    return (
                      <div key={n} className="day-row">
                        <b style={{ width: 110 }}>{label}</b>
                        {x ? <>
                          <span>{fmtFull(x.start_at)}</span>
                          <span className={'tag ' + (x.status === 'completed' ? 'good' : 'brand')}>{x.status === 'completed' ? 'Completed' : 'Booked'}</span>
                          {x.host && <span className="muted sm-text">with {x.host}</span>}
                          {x.zoom_url && x.status !== 'completed' && <a href={x.zoom_url} target="_blank" rel="noreferrer" className="row sm-text" style={{ gap: '.25rem' }}><Video size={14} />Zoom</a>}
                        </> : <span className="muted">{(edit[legacy] as string) ? `Not in calendar. Sheet record: ${edit[legacy]}` : 'Not booked yet'}</span>}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
            <h2>Progress timeline</h2>
            <div className="form-grid">{MILESTONES.map(([k, l]) => txt(k, l))}</div>
            {err && <div className="alert">{err}</div>}
            <div className="modal-foot">
              <button className="primary"><Save size={16} />Save</button>
              {edit.id && isAdmin && <button type="button" className="danger" onClick={del}><Trash2 size={16} />Delete</button>}
            </div>
          </form>
          {edit.id && <AuditTrail table="purchase_accounts" recordId={edit.id} />}
        </Modal>
      )}

      {sync && (
        <Modal title="Sync AIGOAL calendar" onClose={() => setSync(null)}>
          <p className="muted" style={{ marginTop: 0 }}>Pulls Onboarding 1 / 2 / 3 bookings from app.aigoal.ai and attaches them to the matching account (by phone, then email). These dates cannot be typed in here.</p>
          <div className="field"><label>AIGOAL API token (expires in about an hour; it is used once and not stored)</label><textarea value={sync.token} onChange={(e) => setSync({ ...sync, token: e.target.value })} style={{ minHeight: 70, fontFamily: 'monospace', fontSize: '.78rem' }} /></div>
          {sync.msg && !sync.msg.includes('✓') && <Alert text={sync.msg} />}
          {sync.msg.includes('✓') && <Msg text={sync.msg} />}
          {sync.unmatched.length > 0 && <div className="alert" style={{ marginTop: '.6rem' }}>No matching account for: {sync.unmatched.join('; ')}</div>}
          <div className="modal-foot"><button className="primary" disabled={sync.busy || sync.token.trim().length < 20} onClick={runSync}><CalendarSync size={16} />{sync.busy ? 'Syncing…' : 'Sync now'}</button></div>
        </Modal>
      )}
    </>
  )
}
