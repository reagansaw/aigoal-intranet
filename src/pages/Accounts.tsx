import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { BadgeCheck, CalendarClock, CalendarSync, Check, Hammer, Pencil, Plus, Receipt, Save, Trash2, Undo2, Video, Wrench } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useStaff } from '../lib/useStaff'
import { applyOwner, ownerOptions, ownerValue } from '../lib/owners'
import { buildPipeline, dayTime, type StageKey } from '../lib/pipeline'
import Modal from '../components/Modal'
import AuditTrail from '../components/AuditTrail'
import { PipelineDots, Stepper } from '../components/Pipeline'
import { Alert, DatePicker, Empty, Msg, PageHeader, Pagination, SearchBox, Select, Stat, opts, usePaged } from '../components/ui'
import type { OnboardingSession, PurchaseAccount } from '../lib/types'

const IN_USE = [{ value: '', label: 'Unknown' }, { value: 'Y', label: 'Yes, in use' }, { value: 'P', label: 'Partially' }, { value: 'N', label: 'Not using' }]
const STAGES: { value: string; label: string }[] = [
  { value: 'all', label: 'All steps' }, { value: 'o1', label: 'Onboarding 1' }, { value: 'dev', label: 'Ready to develop' },
  { value: 'devdone', label: 'Developing' }, { value: 'o2', label: 'Onboarding 2' }, { value: 'o3', label: 'Onboarding 3' }, { value: 'complete', label: 'Completed' },
]
const blank: Partial<PurchaseAccount> = { product: 'AIGOAL', account_name: '', testimonial: false }

export default function Accounts() {
  const { isAdmin } = useAuth()
  const staff = useStaff()
  const [rows, setRows] = useState<PurchaseAccount[]>([])
  const [sessions, setSessions] = useState<OnboardingSession[]>([])
  const [q, setQ] = useState('')
  const [stage, setStage] = useState('all')
  const [issues, setIssues] = useState('all')
  const [who, setWho] = useState('all')
  const [edit, setEdit] = useState<Partial<PurchaseAccount> | null>(null)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')
  const [sync, setSync] = useState<{ token: string; busy: boolean; msg: string; unmatched: string[] } | null>(null)

  const load = async () => {
    const { data } = await supabase.from('purchase_accounts').select('*').order('purchase_date', { ascending: false, nullsFirst: false }).limit(5000)
    setRows((data ?? []) as PurchaseAccount[])
    const { data: ss } = await supabase.from('onboarding_sessions').select('*').order('start_at')
    setSessions((ss ?? []) as OnboardingSession[])
  }
  useEffect(() => { load() }, [])

  const withP = useMemo(() => rows.map((r) => ({ r, p: buildPipeline(r, sessions) })), [rows, sessions])
  const count = (...keys: StageKey[]) => withP.filter((x) => keys.includes(x.p.stage)).length
  const owners = useMemo(() => [...new Set(rows.map((r) => r.owner_name).filter(Boolean))] as string[], [rows])
  const shown = withP.filter(({ r, p }) =>
    (stage === 'all' || (stage === 'o23' ? ['o2', 'o3'].includes(p.stage) : p.stage === stage)) &&
    (issues === 'all' || !!r.issues) && (who === 'all' || r.owner_name === who) &&
    (!q || [r.account_name, r.contact_person, r.phone, r.email, r.industry, r.issues, r.action_plan, r.remarks, r.owner_name].join(' ').toLowerCase().includes(q.toLowerCase())))
  const { rows: pageRows, pager } = usePaged(shown, JSON.stringify([q, stage, issues, who]))
  const tile = (key: string) => setStage(stage === key ? 'all' : key)

  const act = async (id: string, action: 'start' | 'done' | 'reset') => {
    const { error } = await supabase.rpc('set_develop', { account_id: id, action })
    if (error) return setToast(error.message)
    setToast(''); await load()
  }

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
    const { id, develop_started_at, develop_done_at, ...rest } = edit as PurchaseAccount
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

  // pipeline of the account being edited (live from the saved row, so button clicks refresh it)
  const cur = edit?.id ? withP.find((x) => x.r.id === edit.id) : undefined
  const nextBooking = cur && ['o1', 'o2', 'o3'].includes(cur.p.stage)
    ? sessions.filter((s) => s.account_id === cur.r.id && s.round === Number(cur.p.stage[1]) && s.status !== 'cancelled' && s.status !== 'completed').sort((a, b) => b.start_at.localeCompare(a.start_at))[0]
    : undefined

  return (
    <>
      <PageHeader title="Purchase Accounts" sub={isAdmin ? 'Every customer who bought AIGOAL and where they are in the onboarding flow.' : 'Your customers who bought AIGOAL and where they are in the onboarding flow.'}>
        {isAdmin && <button onClick={() => setSync({ token: '', busy: false, msg: '', unmatched: [] })}><CalendarSync size={16} />Sync AIGOAL calendar</button>}
        <button className="primary" onClick={() => { setEdit({ ...blank }); setErr('') }}><Plus size={16} />Add account</button>
      </PageHeader>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <Stat icon={CalendarClock} label="Onboarding 1" value={count('o1')} active={stage === 'o1'} onClick={() => tile('o1')} />
        <Stat icon={Hammer} tone="orange" label="Ready to develop" value={count('dev')} active={stage === 'dev'} onClick={() => tile('dev')} />
        <Stat icon={Wrench} tone="yellow" label="Developing" value={count('devdone')} active={stage === 'devdone'} onClick={() => tile('devdone')} />
        <Stat icon={CalendarClock} tone="gray" label="Onboarding 2 / 3" value={count('o2', 'o3')} active={stage === 'o23'} onClick={() => tile('o23')} />
        <Stat icon={BadgeCheck} tone="green" label="Completed" value={count('complete')} active={stage === 'complete'} onClick={() => tile('complete')} />
      </div>

      <div className="row" style={{ marginBottom: '1rem' }}>
        <SearchBox value={q} onChange={setQ} placeholder="Search customer, contact, phone, notes…" />
        <Select value={stage === 'o23' ? 'all' : stage} onChange={setStage} options={STAGES} />
        <Select value={issues} onChange={setIssues} options={[{ value: 'all', label: 'With or without issues' }, { value: 'yes', label: 'Only with open issues' }]} />
        {isAdmin && <Select value={who} onChange={setWho} options={[{ value: 'all', label: 'Everyone' }, ...opts(owners)]} />}
        <span className="muted sm-text">{shown.length} of {rows.length}</span>
        <Msg text={toast} />
      </div>

      <div className="card flush table-wrap">
        <table>
          <thead><tr><th>Customer</th><th>Contact</th><th>Onboarding flow</th>{isAdmin && <th>Assigned to</th>}<th>Issue / next action</th><th style={{ width: 150 }}></th></tr></thead>
          <tbody>
            {pageRows.map(({ r, p }) => (
              <tr key={r.id} className="click" onClick={() => { setEdit(r); setErr('') }}>
                <td style={{ minWidth: 190 }}>
                  <div className="cell-title">{r.account_name}</div>
                  <div className="muted sm-text">{[r.industry, r.purchase_date && new Date(r.purchase_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })].filter(Boolean).join(' · ')}</div>
                </td>
                <td style={{ minWidth: 200 }}>
                  <div className="stack-sm">
                    <span className="cell-title">{r.contact_person || <span className="muted">—</span>}</span>
                    {r.email && <a className="sm-text" href={`mailto:${r.email}`} onClick={(e) => e.stopPropagation()}>{r.email}</a>}
                    {r.phone && <a className="sm-text" href={`https://wa.me/${r.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{r.phone}</a>}
                  </div>
                </td>
                <td style={{ minWidth: 190 }}>
                  <PipelineDots p={p} />
                  <div className={'stage-label ' + p.stage}>{p.stageLabel}{p.stageSub && <span className="muted sm-text" style={{ fontWeight: 400 }}> · {p.stageSub}</span>}</div>
                </td>
                {isAdmin && <td>{r.owner_name ? <span className="tag">{r.owner_name}</span> : <span className="muted">Unassigned</span>}</td>}
                <td style={{ maxWidth: 300 }}>
                  {r.issues && <div className="cell-title clamp2">{r.issues}</div>}
                  {r.action_plan && <div className="muted sm-text clamp2">{r.action_plan}</div>}
                </td>
                <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                  {p.stage === 'dev' && <button className="sm primary" onClick={() => act(r.id, 'start')}><Hammer size={14} />Develop</button>}
                  {p.stage === 'devdone' && <button className="sm primary" onClick={() => act(r.id, 'done')}><Check size={14} />Develop Done</button>}
                  <button className="ghost icon sm" aria-label="Open" onClick={() => { setEdit(r); setErr('') }}><Pencil size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <Empty icon={Receipt} title="No accounts found">{isAdmin ? 'Try clearing the filters.' : 'No purchase accounts are assigned to you yet.'}</Empty>}
        <Pagination pager={pager} />
      </div>

      {edit && (
        <Modal wide title={edit.account_name || 'New account'} onClose={() => setEdit(null)}>
          {cur && (
            <>
              <Stepper p={cur.p} />
              <div className="card" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
                <div className="row between">
                  <div>
                    <b>{cur.p.stageLabel}</b>
                    <div className="muted sm-text">
                      {cur.p.stage === 'dev' && 'Onboarding 1 is done. Click Develop when you start building.'}
                      {cur.p.stage === 'devdone' && `Development started ${cur.r.develop_started_at ? dayTime(cur.r.develop_started_at) : ''}. Click Develop Done when it is ready.`}
                      {cur.p.stage === 'o1' && 'Waiting for Onboarding 1 (booked in the AIGOAL calendar).'}
                      {cur.p.stage === 'o2' && 'Development is done. Book Onboarding 2 in the AIGOAL calendar.'}
                      {cur.p.stage === 'o3' && 'Book Onboarding 3 in the AIGOAL calendar.'}
                      {cur.p.stage === 'complete' && 'All onboarding steps are complete.'}
                    </div>
                    {nextBooking && <div className="sm-text" style={{ marginTop: '.3rem' }}>Booked: <b>{dayTime(nextBooking.start_at)}</b>{nextBooking.host && ` with ${nextBooking.host}`} {nextBooking.zoom_url && <a href={nextBooking.zoom_url} target="_blank" rel="noreferrer"><Video size={13} className="i" /> Zoom</a>}</div>}
                  </div>
                  <div className="row">
                    {cur.p.stage === 'dev' && <button type="button" className="primary" onClick={() => act(cur.r.id, 'start')}><Hammer size={16} />Develop</button>}
                    {cur.p.stage === 'devdone' && <button type="button" className="primary" onClick={() => act(cur.r.id, 'done')}><Check size={16} />Develop Done</button>}
                    {isAdmin && cur.p.stage === 'o1' && <button type="button" onClick={() => act(cur.r.id, 'start')}><Hammer size={16} />Start develop anyway</button>}
                    {isAdmin && (cur.r.develop_started_at || cur.r.develop_done_at) && <button type="button" className="ghost" onClick={() => confirm('Undo the Develop steps for this account?') && act(cur.r.id, 'reset')}><Undo2 size={16} />Undo develop</button>}
                  </div>
                </div>
              </div>
              <Msg text={toast} />
            </>
          )}

          <form onSubmit={save}>
            <h2>Customer</h2>
            <div className="form-grid">
              <div className="field"><label>System / company name</label><input required value={edit.account_name ?? ''} onChange={(e) => set('account_name', e.target.value)} /></div>
              {txt('industry', 'Industry')}
              <div className="field"><label>Purchase date</label><DatePicker value={edit.purchase_date} onChange={(v) => set('purchase_date', v)} /></div>
              {isAdmin && <div className="field"><label>Assigned to (who sees this account)</label><Select block value={ownerValue(edit)} onChange={(v) => setEdit(applyOwner(edit, v, staff))} options={ownerOptions(staff, owners)} /></div>}
            </div>

            <h2>Contact</h2>
            <div className="form-grid">{txt('contact_person', 'Name')}{txt('email', 'Email')}{txt('phone', 'Phone')}{txt('whatsapp_group', 'WhatsApp group link')}</div>

            <h2>Follow-up</h2>
            <div className="form-grid">
              {txt('issues', 'Issues', true)}{txt('action_plan', 'Next action', true)}
              <div className="field"><label>Deadline</label><DatePicker value={edit.deadline} onChange={(v) => set('deadline', v)} /></div>
              {txt('remarks', 'Remarks', true)}
            </div>

            <details className="more">
              <summary>More details</summary>
              <div className="form-grid">
                {txt('category', 'Category')}{txt('closed_by', 'Closed via (成交)')}{txt('sales', 'Sales')}
                <div className="field"><label>In use</label><Select block value={edit.in_use ?? ''} onChange={(v) => set('in_use', v || null)} options={IN_USE} /></div>
                {txt('ai_builder', 'AI builder')}{txt('ai_builder_2', 'AI builder 2')}
              </div>
              <label className="check"><input type="checkbox" checked={edit.testimonial ?? false} onChange={(e) => set('testimonial', e.target.checked)} />Testimonial received</label>
            </details>

            {err && <Alert text={err} />}
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
