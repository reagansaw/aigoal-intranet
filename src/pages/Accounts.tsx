import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BadgeCheck, Bell, CalendarClock, CalendarSync, Check, Eye, Hammer, History, Lock, MessageSquare, Pencil, Plus, Receipt, Save, Trash2, Undo2, UserCog, Video, Wrench } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useStaff } from '../lib/useStaff'
import { applyOwner, ownerOptions, ownerValue } from '../lib/owners'
import { buildPipeline, dayTime, type StageKey } from '../lib/pipeline'
import { ago } from '../lib/audit'
import Modal from '../components/Modal'
import AuditTrail from '../components/AuditTrail'
import AccountNotes from '../components/AccountNotes'
import { PipelineDots, Stepper } from '../components/Pipeline'
import { Alert, DatePicker, Empty, Menu, Msg, PageHeader, Pagination, SearchBox, Select, Stat, usePaged, type Option } from '../components/ui'
import type { AccountNote, OnboardingSession, PurchaseAccount } from '../lib/types'

const IN_USE = [{ value: '', label: 'Unknown' }, { value: 'Y', label: 'Yes, in use' }, { value: 'P', label: 'Partially' }, { value: 'N', label: 'Not using' }]
const STAGE_LABEL: Record<string, string> = { o1: 'Onboarding 1', dev: 'Ready to develop', devdone: 'Developing', o2: 'Onboarding 2', o3: 'Onboarding 3', complete: 'Completed' }
const blank: Partial<PurchaseAccount> = { product: 'AIGOAL', account_name: '', testimonial: false }

export default function Accounts() {
  const { profile, isAdmin } = useAuth()
  const staff = useStaff()
  const [params] = useSearchParams()
  const [rows, setRows] = useState<PurchaseAccount[]>([])
  const [sessions, setSessions] = useState<OnboardingSession[]>([])
  const [notes, setNotes] = useState<AccountNote[]>([])
  const [q, setQ] = useState('')
  const [stage, setStage] = useState(params.get('stage') ?? 'all')
  const [issues, setIssues] = useState(params.get('issues') ?? 'all')
  const [who, setWho] = useState(params.get('who') ?? 'all')
  const [pend, setPend] = useState(params.get('pending') ?? 'all')
  const [edit, setEdit] = useState<Partial<PurchaseAccount> | null>(null)
  const [tab, setTab] = useState<'details' | 'followup' | 'history'>('details')
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')
  const [remindNote, setRemindNote] = useState('')
  const [bump, setBump] = useState(0)
  const [sync, setSync] = useState<{ token: string; busy: boolean; msg: string; unmatched: string[] } | null>(null)
  const me = profile!.id

  const load = async () => {
    const { data } = await supabase.from('purchase_accounts').select('*').order('purchase_date', { ascending: false, nullsFirst: false }).limit(5000)
    setRows((data ?? []) as PurchaseAccount[])
    const { data: ss } = await supabase.from('onboarding_sessions').select('*').order('start_at')
    setSessions((ss ?? []) as OnboardingSession[])
    const { data: nn } = await supabase.from('account_notes').select('id,account_id,kind,body,next_action,deadline,resolved,resolved_by_name,resolved_at,author_name,created_at').order('created_at', { ascending: false }).limit(5000)
    setNotes((nn ?? []) as AccountNote[])
  }
  useEffect(() => { load() }, [])

  // ───── derived ─────
  const notesBy = useMemo(() => { const m = new Map<string, AccountNote[]>(); notes.forEach((n) => (m.get(n.account_id) ?? m.set(n.account_id, []).get(n.account_id)!).push(n)); return m }, [notes])
  const withP = useMemo(() => rows.map((r) => {
    const ns = notesBy.get(r.id) ?? []
    return { r, p: buildPipeline(r, sessions), last: ns.find((n) => n.kind !== 'reminder'), next: ns.find((n) => n.next_action && n.kind !== 'reminder'), openIssues: ns.filter((n) => n.kind === 'issue' && !n.resolved).length }
  }), [rows, sessions, notesBy])
  const count = (...k: StageKey[]) => withP.filter((x) => k.includes(x.p.stage)).length
  const canBuild = (r: Partial<PurchaseAccount>) => isAdmin || (r.builder_ids ?? []).includes(me)

  const salesPeople = staff.filter((s) => s.is_sales || s.role === 'admin')
  const builders = staff.filter((s) => s.is_ai_builder)
  const nameOpts = (list: typeof staff, current?: string | null, extra: string[] = []): Option[] => {
    const names = list.map((s) => s.full_name).filter(Boolean)
    const o: Option[] = [{ value: '', label: '— None —' }, ...extra.map((e) => ({ value: e, label: e })), ...names.map((n) => ({ value: n, label: n }))]
    if (current && !o.some((x) => x.value === current)) o.push({ value: current, label: `${current} (no login)` })
    return o
  }
  const ownerNames = useMemo(() => [...new Set(rows.map((r) => r.owner_name).filter(Boolean))] as string[], [rows])
  const pendingNames = useMemo(() => [...new Set(rows.map((r) => r.pending_on_name).filter(Boolean))] as string[], [rows])

  const shown = withP.filter(({ r, p, openIssues }) =>
    (stage === 'all' || (stage === 'o23' ? ['o2', 'o3'].includes(p.stage) : p.stage === stage)) &&
    (issues === 'all' || openIssues > 0) &&
    (who === 'all' || (who === 'me' ? r.owner_id === me || (r.builder_ids ?? []).includes(me) : who === 'none' ? !r.owner_id && !r.owner_name : r.owner_name === who)) &&
    (pend === 'all' || (pend === 'any' ? !!r.pending_on_id : pend === 'me' ? r.pending_on_id === me : r.pending_on_name === pend)) &&
    (!q || [r.account_name, r.contact_person, r.phone, r.email, r.industry, r.owner_name, r.ai_builder, r.pending_on_name].join(' ').toLowerCase().includes(q.toLowerCase())))
  const { rows: pageRows, pager } = usePaged(shown, JSON.stringify([q, stage, issues, who, pend]))
  const tile = (key: string) => setStage(stage === key ? 'all' : key)

  // ───── actions ─────
  const rpc = async (fn: string, args: object) => {
    const { error } = await supabase.rpc(fn, args)
    if (error) { setToast(error.message); return false }
    setToast(''); await load(); setBump((b) => b + 1); return true
  }
  const act = (id: string, action: 'start' | 'done' | 'reset') => rpc('set_develop', { account_id: id, action })
  const remind = (id: string, personId: string, note?: string) => rpc('remind_account', { account_id: id, person_id: personId, note: note || null })
  const clearRemind = (id: string) => rpc('clear_reminder', { account_id: id })
  const remindOptions: Option[] = builders.filter((b) => b.id !== me).map((b) => ({ value: b.id, label: b.full_name }))

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

  const open = (r: Partial<PurchaseAccount>, t: typeof tab = 'details') => { setEdit(r); setTab(t); setErr(''); setRemindNote('') }
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!edit) return
    const { id, develop_started_at, develop_done_at, builder_ids, pending_on_id, pending_on_name, pending_since, pending_by_name, issues: _i, action_plan: _a, remarks: _r, deadline: _d, ...rest } = edit as PurchaseAccount
    const payload = { ...rest, purchase_date: rest.purchase_date || null, updated_at: new Date().toISOString() }
    const { error } = id ? await supabase.from('purchase_accounts').update(payload).eq('id', id) : await supabase.from('purchase_accounts').insert(payload)
    if (error) return setErr(error.message)
    setEdit(null); setErr(''); load()
  }
  const del = async () => { if (edit?.id && confirm('Delete this account?')) { await supabase.from('purchase_accounts').delete().eq('id', edit.id); setEdit(null); load() } }
  const set = (k: keyof PurchaseAccount, v: any) => setEdit({ ...edit, [k]: v })

  // ───── modal pieces ─────
  const cur = edit?.id ? withP.find((x) => x.r.id === edit.id) : undefined
  const editable = !edit?.id || canBuild(edit)
  const identityEditable = !edit?.id || isAdmin || (edit.builder_ids ?? []).includes(me)
  const nextBooking = cur && ['o1', 'o2', 'o3'].includes(cur.p.stage)
    ? sessions.filter((s) => s.account_id === cur.r.id && s.round === Number(cur.p.stage[1]) && s.status !== 'cancelled' && s.status !== 'completed').sort((a, b) => b.start_at.localeCompare(a.start_at))[0] : undefined
  const field = (k: keyof PurchaseAccount, label: string, locked = false, type?: 'date') => (
    <div className="field">
      <label>{label} {locked && !identityEditable && <Lock size={11} className="i" />}</label>
      {type === 'date'
        ? <DatePicker value={edit?.[k] as string} onChange={(v) => set(k, v)} disabled={locked ? !identityEditable : !editable} />
        : <input value={(edit?.[k] as string) ?? ''} disabled={locked ? !identityEditable : !editable} onChange={(e) => set(k, e.target.value)} />}
    </div>
  )
  const people = (k: 'ai_builder' | 'ai_builder_2' | 'sales' | 'closed_by', label: string, list: typeof staff, extra: string[] = []) => (
    <div className="field"><label>{label} {!isAdmin && <Lock size={11} className="i" />}</label>
      <Select block disabled={!isAdmin} value={(edit?.[k] as string) ?? ''} onChange={(v) => set(k, v || null)} options={nameOpts(list, edit?.[k] as string, extra)} /></div>
  )
  const builderNames = [edit?.ai_builder, edit?.ai_builder_2].filter(Boolean).join(' / ')

  return (
    <>
      <PageHeader title="Purchase Accounts" sub="Every customer who bought AIGOAL and where they are in the onboarding flow. Only the AI Builder of an account can edit it.">
        {isAdmin && <button onClick={() => setSync({ token: '', busy: false, msg: '', unmatched: [] })}><CalendarSync size={16} />Sync AIGOAL calendar</button>}
        {isAdmin && <button className="primary" onClick={() => open({ ...blank })}><Plus size={16} />Add account</button>}
      </PageHeader>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <Stat icon={CalendarClock} label="Onboarding 1" value={count('o1')} active={stage === 'o1'} onClick={() => tile('o1')} />
        <Stat icon={Hammer} tone="orange" label="Ready to develop" value={count('dev')} active={stage === 'dev'} onClick={() => tile('dev')} />
        <Stat icon={Wrench} tone="yellow" label="Developing" value={count('devdone')} active={stage === 'devdone'} onClick={() => tile('devdone')} />
        <Stat icon={CalendarClock} tone="gray" label="Onboarding 2 / 3" value={count('o2', 'o3')} active={stage === 'o23'} onClick={() => tile('o23')} />
        <Stat icon={BadgeCheck} tone="green" label="Completed" value={count('complete')} active={stage === 'complete'} onClick={() => tile('complete')} />
      </div>

      <div className="row" style={{ marginBottom: '1rem' }}>
        <SearchBox value={q} onChange={setQ} placeholder="Search customer, contact, phone, builder…" />
        <Select value={stage === 'o23' ? 'all' : stage} onChange={setStage} options={[{ value: 'all', label: 'All steps', hint: String(rows.length) }, ...Object.entries(STAGE_LABEL).map(([v, l]) => ({ value: v, label: l, hint: String(count(v as StageKey)) }))]} />
        <Select value={who} onChange={setWho} options={[{ value: 'all', label: 'All accounts' }, { value: 'me', label: 'Mine (assigned or AI Builder)' }, { value: 'none', label: 'No owner yet' }, ...ownerNames.map((n) => ({ value: n, label: n, hint: String(rows.filter((r) => r.owner_name === n).length) }))]} />
        <Select value={pend} onChange={setPend} options={[{ value: 'all', label: 'Any status' }, { value: 'any', label: 'Waiting on someone', hint: String(rows.filter((r) => r.pending_on_id).length) }, { value: 'me', label: 'Waiting on me', hint: String(rows.filter((r) => r.pending_on_id === me).length) }, ...pendingNames.map((n) => ({ value: n, label: 'Pending ' + n }))]} />
        <Select value={issues} onChange={setIssues} options={[{ value: 'all', label: 'With or without issues' }, { value: 'yes', label: 'Only open issues', hint: String(withP.filter((x) => x.openIssues).length) }]} />
        <span className="muted sm-text">{shown.length} of {rows.length}</span>
        <Msg text={toast} />
      </div>

      <div className="card flush table-wrap">
        <table>
          <thead><tr><th>Customer</th><th>Contact</th><th>Onboarding flow</th><th>Status</th><th>Latest follow-up</th><th style={{ width: 210 }}></th></tr></thead>
          <tbody>
            {pageRows.map(({ r, p, last, next, openIssues }) => {
              const mine = canBuild(r)
              return (
                <tr key={r.id} className="click" onClick={() => open(r)}>
                  <td style={{ minWidth: 190 }}>
                    <div className="cell-title">{r.account_name}</div>
                    <div className="muted sm-text">{[r.industry, r.purchase_date && new Date(r.purchase_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })].filter(Boolean).join(' · ')}</div>
                    <div className="muted sm-text">{r.owner_name ? `Sales: ${r.owner_name}` : 'No sales owner'}{r.ai_builder && ` · Builder: ${r.ai_builder}`}</div>
                  </td>
                  <td style={{ minWidth: 190 }}>
                    <div className="stack-sm">
                      <span className="cell-title">{r.contact_person || <span className="muted">—</span>}</span>
                      {r.email && <a className="sm-text" href={`mailto:${r.email}`} onClick={(e) => e.stopPropagation()}>{r.email}</a>}
                      {r.phone && <a className="sm-text" href={`https://wa.me/${r.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{r.phone}</a>}
                    </div>
                  </td>
                  <td style={{ minWidth: 180 }}>
                    <PipelineDots p={p} />
                    <div className={'stage-label ' + p.stage}>{p.stageLabel}{p.stageSub && <span className="muted sm-text" style={{ fontWeight: 400 }}> · {p.stageSub}</span>}</div>
                  </td>
                  <td style={{ minWidth: 150 }} onClick={(e) => e.stopPropagation()}>
                    {r.pending_on_id ? (
                      <div className="stack-sm">
                        <span className="tag warn" style={{ width: 'fit-content' }}><Bell size={12} />Pending {r.pending_on_name}</span>
                        <span className="muted sm-text">{r.pending_since && ago(r.pending_since)}{r.pending_by_name && ` · by ${r.pending_by_name}`}</span>
                        {(r.pending_on_id === me || mine) && <button className="sm" style={{ width: 'fit-content' }} onClick={() => clearRemind(r.id)}><Check size={13} />Mark done</button>}
                      </div>
                    ) : <span className="muted sm-text">—</span>}
                  </td>
                  <td style={{ maxWidth: 280 }}>
                    {last ? <>
                      <div className="clamp2 sm-text">{last.body}</div>
                      <div className="muted sm-text">{last.author_name} · {ago(last.created_at)}</div>
                    </> : <span className="muted sm-text">No follow-up yet</span>}
                    <div className="row" style={{ gap: '.3rem', marginTop: 3 }}>
                      {openIssues > 0 && <span className="tag warn">{openIssues} issue{openIssues > 1 ? 's' : ''}</span>}
                      {next?.next_action && <span className={'tag' + (next.deadline && next.deadline < new Date().toISOString().slice(0, 10) ? ' warn' : '')} title={next.next_action}>Next: {next.next_action.length > 24 ? next.next_action.slice(0, 24) + '…' : next.next_action}</span>}
                    </div>
                  </td>
                  <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="row" style={{ gap: '.35rem', flexWrap: 'nowrap' }}>
                      {mine && p.stage === 'dev' && <button className="sm primary" onClick={() => act(r.id, 'start')}><Hammer size={14} />Develop</button>}
                      {mine && p.stage === 'devdone' && <button className="sm primary" onClick={() => act(r.id, 'done')}><Check size={14} />Develop Done</button>}
                      <Menu label="Remind" icon={Bell} options={remindOptions} onPick={(pid) => remind(r.id, pid)} />
                      <button className="ghost icon sm" aria-label={mine ? 'Edit' : 'View'} onClick={() => open(r)}>{mine ? <Pencil size={15} /> : <Eye size={15} />}</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!shown.length && <Empty icon={Receipt} title="No accounts found">Try clearing the filters.</Empty>}
        <Pagination pager={pager} />
      </div>

      {edit && (
        <Modal wide title={edit.account_name || 'New account'}
          sub={edit.id ? <>
            {[edit.industry, edit.contact_person].filter(Boolean).join(' · ')}
            {cur && <span className="tag brand">{cur.p.stageLabel}</span>}
            {edit.pending_on_name && <span className="tag warn"><Bell size={11} />Pending {edit.pending_on_name}</span>}
            {!editable && <span className="tag"><Eye size={11} />View only</span>}
          </> : undefined}
          onClose={() => setEdit(null)}>
          {cur && (
            <>
              <Stepper p={cur.p} />
              <div className="card" style={{ background: 'var(--surface-2)', boxShadow: 'none', padding: '.8rem 1rem' }}>
                <div className="row between">
                  <div style={{ minWidth: 0 }}>
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
                    {canBuild(edit) && cur.p.stage === 'dev' && <button type="button" className="primary" onClick={() => act(cur.r.id, 'start')}><Hammer size={16} />Develop</button>}
                    {canBuild(edit) && cur.p.stage === 'devdone' && <button type="button" className="primary" onClick={() => act(cur.r.id, 'done')}><Check size={16} />Develop Done</button>}
                    {isAdmin && cur.p.stage === 'o1' && <button type="button" onClick={() => act(cur.r.id, 'start')}><Hammer size={16} />Start develop anyway</button>}
                    {isAdmin && (cur.r.develop_started_at || cur.r.develop_done_at) && <button type="button" className="ghost" onClick={() => confirm('Undo the Develop steps for this account?') && act(cur.r.id, 'reset')}><Undo2 size={16} />Undo develop</button>}
                  </div>
                </div>
              </div>
              <Msg text={toast} />
            </>
          )}

          {edit.id && (
            <div className="modal-tabs">
              <button className={tab === 'details' ? 'on' : ''} onClick={() => setTab('details')}><UserCog size={15} className="i" /> Details</button>
              <button className={tab === 'followup' ? 'on' : ''} onClick={() => setTab('followup')}><MessageSquare size={15} className="i" /> Follow-up{(notesBy.get(edit.id)?.filter((n) => n.kind !== 'reminder').length ?? 0) > 0 && <span className="tag" style={{ marginLeft: 6 }}>{notesBy.get(edit.id)!.filter((n) => n.kind !== 'reminder').length}</span>}</button>
              <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}><History size={15} className="i" /> History</button>
            </div>
          )}

          {tab === 'details' && (
            <form onSubmit={save}>
              {edit.id && !editable && <div className="lockbar"><Lock size={14} /> View only. Only {builderNames || 'the AI Builder'} (or Admin) can edit this account.</div>}
              <div className="sect">
                <h3>Customer {edit.id && !identityEditable ? <Lock size={12} className="i" /> : null}</h3>
                {edit.id && <div className="lockbar"><Lock size={13} /> From AIGOAL. Only Admin or this account's AI Builder can change these.</div>}
                <div className="form-grid">
                  <div className="field"><label>Company name {!identityEditable && <Lock size={11} className="i" />}</label><input required disabled={!identityEditable} value={edit.account_name ?? ''} onChange={(e) => set('account_name', e.target.value)} /></div>
                  {field('contact_person', 'Person name', true)}{field('phone', 'Phone', true)}{field('email', 'Register email', true)}{field('industry', 'Industry', true)}{field('category', 'Category', true)}
                  {field('purchase_date', 'Purchase date', true, 'date')}
                </div>
              </div>

              <div className="sect">
                <h3>Team {!isAdmin && <Lock size={12} className="i" />}</h3>
                <div className="form-grid">
                  <div className="field"><label>Assigned sales {!isAdmin && <Lock size={11} className="i" />}</label><Select block disabled={!isAdmin} value={ownerValue(edit)} onChange={(v) => setEdit(applyOwner(edit, v, staff))} options={ownerOptions(salesPeople, ownerNames)} /></div>
                  {people('ai_builder', 'AI Builder 1', builders)}{people('ai_builder_2', 'AI Builder 2', builders)}
                  {people('sales', 'Sales', salesPeople)}{people('closed_by', 'Closed via (成交)', salesPeople, ['Webinar'])}
                </div>
              </div>

              <div className="sect">
                <h3>Usage</h3>
                <div className="form-grid">
                  <div className="field"><label>In use</label><Select block disabled={!editable} value={edit.in_use ?? ''} onChange={(v) => set('in_use', v || null)} options={IN_USE} /></div>
                  {field('whatsapp_group', 'WhatsApp group link')}
                </div>
                <label className="check" style={{ marginBottom: '.9rem' }}><input type="checkbox" disabled={!editable} checked={edit.testimonial ?? false} onChange={(e) => set('testimonial', e.target.checked)} />Testimonial received</label>
              </div>

              {err && <Alert text={err} />}
              <div className="modal-foot">
                {editable && <button className="primary"><Save size={16} />Save</button>}
                {edit.id && isAdmin && <button type="button" className="danger" onClick={del}><Trash2 size={16} />Delete</button>}
                {!editable && <span className="muted sm-text">You can still add follow-ups and remind someone.</span>}
              </div>
            </form>
          )}

          {tab === 'followup' && edit.id && (
            <>
              {edit.pending_on_id ? (
                <div className="pend">
                  <div><b><Bell size={14} className="i" /> Pending {edit.pending_on_name}</b><div className="muted sm-text">{edit.pending_since && ago(edit.pending_since)}{edit.pending_by_name && ` · asked by ${edit.pending_by_name}`}</div></div>
                  {(edit.pending_on_id === me || canBuild(edit)) && <button className="primary" onClick={async () => { if (await clearRemind(edit.id!)) setEdit({ ...edit, pending_on_id: null, pending_on_name: null, pending_since: null, pending_by_name: null }) }}><Check size={16} />Mark done</button>}
                </div>
              ) : (
                <div className="pend none">
                  <div style={{ flex: 1, minWidth: 220 }}><b><Bell size={14} className="i" /> Remind someone</b><div className="muted sm-text">Marks this account “Pending &lt;person&gt;” so it shows up on their dashboard.</div>
                    <input style={{ marginTop: '.5rem' }} placeholder="Add a note (optional)" value={remindNote} onChange={(e) => setRemindNote(e.target.value)} /></div>
                  <Menu label="Remind…" icon={Bell} primary options={remindOptions} onPick={async (pid) => { if (await remind(edit.id!, pid, remindNote)) { setRemindNote(''); const t = remindOptions.find((o) => o.value === pid)?.label ?? null; setEdit({ ...edit, pending_on_id: pid, pending_on_name: t, pending_since: new Date().toISOString(), pending_by_name: profile?.full_name ?? null }) } }} />
                </div>
              )}
              <AccountNotes accountId={edit.id} refreshKey={bump} onChange={load} />
            </>
          )}

          {tab === 'history' && edit.id && <AuditTrail table="purchase_accounts" recordId={edit.id} />}
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
