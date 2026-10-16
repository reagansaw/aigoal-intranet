import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BadgeCheck, Bell, Mic, Snowflake, MessageCircle, CalendarClock, Check, Eye, Hammer, History, Lock, MessageSquare, Pencil, Plus, Receipt, Save, Trash2, Undo2, UserCog, Video, Wrench } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useStaff } from '../lib/useStaff'
import { applyOwner, ownerOptions, ownerValue } from '../lib/owners'
import { buildPipeline, dayTime, type StageKey } from '../lib/pipeline'
import { ago } from '../lib/audit'
import Modal from '../components/Modal'
import VoiceUpdate from '../components/VoiceUpdate'
import AuditTrail from '../components/AuditTrail'
import AccountNotes from '../components/AccountNotes'
import { PipelineDots, Stepper } from '../components/Pipeline'
import { Alert, ColumnFilter, DatePicker, Empty, Menu, Msg, PageHeader, Pagination, SearchBox, Select, Stat, usePaged, type Option } from '../components/ui'
import type { AccountNote, OnboardingSession, PurchaseAccount } from '../lib/types'

const IN_USE = [{ value: '', label: 'Unknown' }, { value: 'Y', label: 'Yes, in use' }, { value: 'P', label: 'Partially' }, { value: 'N', label: 'Not using' }]
const STAGE_LABEL: Record<string, string> = { o1: 'Onboarding 1', dev: 'Ready to develop', devdone: 'Developing', o2: 'Onboarding 2', o3: 'Onboarding 3', complete: 'Completed', frozen: 'Frozen' }
const CATEGORIES = [{ value: '', label: '— None —' }, ...['AIGOAL Conversion', 'Both', 'AI Studio', 'Marketing Services'].map((v) => ({ value: v, label: v }))]
const driveOk = (u: string) => /^https:\/\/(drive|docs)\.google\.com\//i.test(u.trim())
const waUrl = (u?: string | null) => { const v = (u ?? '').trim(); if (!v) return null; const full = /^https?:\/\//i.test(v) ? v : /whatsapp\.com/i.test(v) ? 'https://' + v : null; return full }
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
  const [remindFor, setRemindFor] = useState<{ id: string; pid: string; name: string } | null>(null)
  const [remindText, setRemindText] = useState('')
  const [voice, setVoice] = useState(false)
  const [freezeFor, setFreezeFor] = useState<{ id: string; name: string; frozen: boolean } | null>(null)
  const [freezeText, setFreezeText] = useState('')
  const remindWhat = (id: string) => { const n = (notesBy.get(id) ?? []).find((x) => x.kind === 'reminder' && x.body.startsWith('Reminder sent to')); const i = n ? n.body.indexOf(': ') : -1; return i > 0 ? n!.body.slice(i + 2) : '' }
  const [bump, setBump] = useState(0)
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

  // header / toolbar filters (tick lists); they add to the tiles and dropdowns above
  const [cf, setCf] = useState<Record<string, string[]>>({})
  const setCol = (k: string) => (v: string[]) => setCf((x) => ({ ...x, [k]: v }))
  const fuState = (x: { r: PurchaseAccount; last?: AccountNote; next?: AccountNote; openIssues: number }) => x.openIssues > 0 ? 'issue' : x.r.pending_on_id ? 'pending' : x.next?.next_action ? 'next' : x.last ? 'done' : 'none'
  const colOk = (x: (typeof withP)[number]) =>
    (!cf.category?.length || cf.category.includes(x.r.category || '—')) && (!cf.industry?.length || cf.industry.includes(x.r.industry || '—')) &&
    (!cf.sales?.length || cf.sales.includes(x.r.owner_name || '—')) && (!cf.builder?.length || cf.builder.includes(x.r.ai_builder || '—')) &&
    (!cf.stage?.length || cf.stage.includes(x.p.stage)) && (!cf.followup?.length || cf.followup.includes(fuState(x)))
  const opts = (get: (x: (typeof withP)[number]) => string, label?: (v: string) => string, order?: string[]) => {
    const m = new Map<string, number>(); withP.forEach((x) => m.set(get(x), (m.get(get(x)) ?? 0) + 1))
    const keys = order ? order.filter((k) => m.has(k)) : [...m.keys()].sort((a, b) => (m.get(b)! - m.get(a)!) || a.localeCompare(b))
    return keys.map((k) => ({ value: k, label: label ? label(k) : k, count: m.get(k) }))
  }
  const activeCols = Object.values(cf).reduce((n, v) => n + (v.length ? 1 : 0), 0)
  const shown = withP.filter((x) => colOk(x) && ((({ r, p, openIssues }) =>
    (stage === 'all' || (stage === 'o23' ? ['o2', 'o3'].includes(p.stage) : p.stage === stage)) &&
    (issues === 'all' || openIssues > 0) &&
    (who === 'all' || (who === 'me' ? r.owner_id === me || (r.builder_ids ?? []).includes(me) : who === 'none' ? !r.owner_id && !r.owner_name : r.owner_name === who)) &&
    (pend === 'all' || (pend === 'any' ? !!r.pending_on_id : pend === 'me' ? r.pending_on_id === me : r.pending_on_name === pend)) &&
    (!q || [r.account_name, r.contact_person, r.phone, r.email, r.industry, r.owner_name, r.ai_builder, r.pending_on_name].join(' ').toLowerCase().includes(q.toLowerCase())))(x)))
  const { rows: pageRows, pager } = usePaged(shown, JSON.stringify([q, stage, issues, who, pend, cf]))
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

  const open = (r: Partial<PurchaseAccount>, t: typeof tab = 'details') => { setEdit(r); setTab(t); setErr(''); setRemindNote('') }
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!edit) return
    if (edit.testimonial_url?.trim() && !driveOk(edit.testimonial_url)) return setErr('The testimonial needs a Google Drive video link.')
    const { id, develop_started_at, develop_done_at, builder_ids, testimonial: _t, pending_on_id, pending_on_name, pending_since, pending_by_name, issues: _i, action_plan: _a, remarks: _r, deadline: _d, ...rest } = edit as PurchaseAccount
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
  const identityEditable = !edit?.id || isAdmin                                   // contact details, industry, category, purchase date
  const nameEditable = !edit?.id || isAdmin || (edit.builder_ids ?? []).includes(me)  // company name
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
        <button onClick={() => setVoice(true)}><Mic size={16} />Voice update</button>
        {isAdmin && <button className="primary" onClick={() => open({ ...blank })}><Plus size={16} />Add account</button>}
      </PageHeader>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <Stat icon={CalendarClock} label="Onboarding 1" value={count('o1')} active={stage === 'o1'} onClick={() => tile('o1')} />
        <Stat icon={Hammer} tone="orange" label="Ready to develop" value={count('dev')} active={stage === 'dev'} onClick={() => tile('dev')} />
        <Stat icon={Wrench} tone="yellow" label="Developing" value={count('devdone')} active={stage === 'devdone'} onClick={() => tile('devdone')} />
        <Stat icon={CalendarClock} tone="gray" label="Onboarding 2 / 3" value={count('o2', 'o3')} active={stage === 'o23'} onClick={() => tile('o23')} />
        <Stat icon={BadgeCheck} tone="green" label="Completed" value={count('complete')} active={stage === 'complete'} onClick={() => tile('complete')} />
        <Stat icon={Snowflake} tone="gray" label="Frozen" value={count('frozen')} active={stage === 'frozen'} onClick={() => tile('frozen')} />
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

      <div className="row" style={{ gap: '.5rem', margin: '0 0 .6rem', alignItems: 'center' }}>
        <span className="muted sm-text">Filter:</span>
        <ColumnFilter chip label="Sales" options={opts((x) => x.r.owner_name || '—', (v) => (v === '—' ? 'No sales owner' : v))} selected={cf.sales ?? []} onChange={setCol('sales')} />
        <ColumnFilter chip label="AI Builder" options={opts((x) => x.r.ai_builder || '—', (v) => (v === '—' ? 'No builder' : v))} selected={cf.builder ?? []} onChange={setCol('builder')} />
        <ColumnFilter chip label="Industry" options={opts((x) => x.r.industry || '—')} selected={cf.industry ?? []} onChange={setCol('industry')} />
        {activeCols > 0 && <><span className="muted sm-text">{activeCols} filter{activeCols > 1 ? 's' : ''} on · {shown.length} shown</span><button type="button" className="ghost sm" onClick={() => setCf({})}>Clear filters</button></>}
      </div>
      <div className="card flush table-wrap">
        <table>
          <thead><tr><th><ColumnFilter label="Category" text="Customer" options={opts((x) => x.r.category || '—')} selected={cf.category ?? []} onChange={setCol('category')} /></th><th>Contact</th><th><ColumnFilter label="Onboarding flow" options={opts((x) => x.p.stage, (v) => STAGE_LABEL[v] ?? v, ['o1', 'dev', 'devdone', 'o2', 'o3', 'complete', 'frozen'])} selected={cf.stage ?? []} onChange={setCol('stage')} /></th><th><ColumnFilter label="Latest follow-up" options={opts(fuState, (v) => ({ issue: 'Open issue', pending: 'Waiting on someone', next: 'Has a next action', done: 'Followed up', none: 'No follow-up yet' } as Record<string, string>)[v], ['issue', 'pending', 'next', 'done', 'none'])} selected={cf.followup ?? []} onChange={setCol('followup')} /></th><th className="sticky-end" style={{ width: 168 }}></th></tr></thead>
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
                    <div className={'stage-label ' + p.stage}>{p.stage === 'frozen' ? p.realLabel : p.stageLabel}{p.stage !== 'frozen' && p.stageSub && <span className="muted sm-text" style={{ fontWeight: 400 }}> · {p.stageSub}</span>}</div>
                    {p.stage === 'frozen' && <div className="stack-sm" style={{ marginTop: '.35rem' }}><span className="tag frozen-tag" title={r.frozen_reason ?? ''}><Snowflake size={12} />Frozen</span>{r.frozen_reason && <span className="muted sm-text clamp2" style={{ maxWidth: 220 }}>{r.frozen_reason}</span>}</div>}
                    {r.pending_on_id && (
                      <div className="stack-sm" style={{ marginTop: '.45rem' }} onClick={(e) => e.stopPropagation()}>
                        <span className="tag warn" style={{ width: 'fit-content' }}><Bell size={12} />Pending {r.pending_on_name}</span>
                        {remindWhat(r.id) && <span className="sm-text" style={{ maxWidth: 260 }}>{remindWhat(r.id)}</span>}
                        <span className="muted sm-text">{r.pending_since && ago(r.pending_since)}{r.pending_by_name && ` · by ${r.pending_by_name}`}</span>
                        {(r.pending_on_id === me || mine) && <button className="sm" style={{ width: 'fit-content' }} onClick={() => clearRemind(r.id)}><Check size={13} />Mark done</button>}
                      </div>
                    )}
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
                  <td className="sticky-end" onClick={(e) => e.stopPropagation()}>
                    <div className="act-col">
                      {mine && p.stage === 'dev' && <button className="sm primary" onClick={() => act(r.id, 'start')}><Hammer size={14} />Develop</button>}
                      {mine && p.stage === 'devdone' && <button className="sm primary" onClick={() => act(r.id, 'done')}><Check size={14} />Develop Done</button>}
                      <div className="row" style={{ gap: '.3rem', flexWrap: 'nowrap' }}>
                        {!r.frozen && <Menu label="Remind" icon={Bell} options={remindOptions} onPick={(pid) => { setRemindText(''); setRemindFor({ id: r.id, pid, name: remindOptions.find((o) => o.value === pid)?.label ?? '' }) }} />}
                        {isAdmin && <button className="ghost icon sm" title={r.frozen ? 'Unfreeze' : 'Freeze account'} aria-label={r.frozen ? 'Unfreeze' : 'Freeze account'} onClick={() => { setFreezeText(''); setFreezeFor({ id: r.id, name: r.account_name, frozen: !!r.frozen }) }}><Snowflake size={15} style={r.frozen ? { color: 'var(--brand)' } : undefined} /></button>}
                        <button className="ghost icon sm" aria-label={mine ? 'Edit' : 'View'} onClick={() => open(r)}>{mine ? <Pencil size={15} /> : <Eye size={15} />}</button>
                      </div>
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
            {cur && <span className="tag brand">{cur.p.stage === 'frozen' ? cur.p.realLabel : cur.p.stageLabel}</span>}{cur?.p.stage === 'frozen' && <span className="tag frozen-tag" title={cur.r.frozen_reason ?? ''}><Snowflake size={12} />Frozen</span>}
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
                    <b>{cur.p.stage === 'frozen' ? cur.p.realLabel : cur.p.stageLabel}</b>{cur.p.stage === 'frozen' && <span className="tag frozen-tag" style={{ marginLeft: 8 }}><Snowflake size={12} />Frozen{cur.r.frozen_reason ? ` · ${cur.r.frozen_reason}` : ''}</span>}
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
                    {isAdmin && <button type="button" onClick={() => { setFreezeText(''); setFreezeFor({ id: cur.r.id, name: cur.r.account_name, frozen: !!cur.r.frozen }) }}><Snowflake size={16} />{cur.r.frozen ? 'Unfreeze account' : 'Freeze account'}</button>}
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
                <h3>Customer</h3>
                {edit.id && <div className="lockbar"><Lock size={13} /> From AIGOAL. Only Admin can change these. The AI Builder can change the company name.</div>}
                <div className="form-grid">
                  <div className="field"><label>Company name {!nameEditable && <Lock size={11} className="i" />}</label><input required disabled={!nameEditable} value={edit.account_name ?? ''} onChange={(e) => set('account_name', e.target.value)} /></div>
                  {field('contact_person', 'Person name', true)}{field('phone', 'Phone', true)}{field('email', 'Register email', true)}{field('industry', 'Industry', true)}
                  <div className="field"><label>Category {!identityEditable && <Lock size={11} className="i" />}</label><Select block disabled={!identityEditable} value={edit.category ?? ''} onChange={(v) => set('category', v || null)} options={CATEGORIES} /></div>
                  {field('purchase_date', 'Purchase date', true, 'date')}
                </div>
              </div>

              <div className="sect">
                <h3>Team {!isAdmin && <Lock size={12} className="i" />}</h3>
                <div className="form-grid">
                  <div className="field"><label>Assigned sales {!isAdmin && <Lock size={11} className="i" />}</label><Select block disabled={!isAdmin} value={ownerValue(edit)} onChange={(v) => setEdit(applyOwner(edit, v, staff))} options={ownerOptions(salesPeople, ownerNames)} /></div>
                  {people('ai_builder', 'AI Builder 1', builders)}{people('ai_builder_2', 'AI Builder 2', builders)}
                  {people('closed_by', 'Closed via (成交)', salesPeople, ['Webinar'])}
                </div>
              </div>

              <div className="sect">
                <h3>Usage</h3>
                <div className="form-grid">
                  <div className="field"><label>In use</label><Select block disabled={!editable} value={edit.in_use ?? ''} onChange={(v) => set('in_use', v || null)} options={IN_USE} /></div>
                  <div className="field"><label>WhatsApp group link</label>
                    <div className="row" style={{ flexWrap: 'nowrap', gap: '.4rem' }}>
                      <input style={{ flex: 1 }} disabled={!editable} value={edit.whatsapp_group ?? ''} placeholder="https://chat.whatsapp.com/…" onChange={(e) => set('whatsapp_group', e.target.value)} />
                      {waUrl(edit.whatsapp_group) && <a className="btn" href={waUrl(edit.whatsapp_group)!} target="_blank" rel="noreferrer"><MessageCircle size={15} />Open chat</a>}
                    </div></div>
                </div>
                <div className="field"><label>Testimonial video (Google Drive link) {edit.testimonial_url && driveOk(edit.testimonial_url) ? <span className="tag good" style={{ marginLeft: 6 }}><BadgeCheck size={11} />Received</span> : <span className="tag" style={{ marginLeft: 6 }}>Not received</span>}</label>
                  <div className="row" style={{ flexWrap: 'nowrap', gap: '.4rem' }}>
                    <input style={{ flex: 1 }} disabled={!editable} value={edit.testimonial_url ?? ''} placeholder="https://drive.google.com/file/d/…" onChange={(e) => set('testimonial_url', e.target.value)} />
                    {edit.testimonial_url && driveOk(edit.testimonial_url) && <a className="btn" href={edit.testimonial_url} target="_blank" rel="noreferrer"><Video size={15} />Watch</a>}
                  </div>
                  {edit.testimonial_url && !driveOk(edit.testimonial_url) && <div className="err sm-text" style={{ marginTop: 4 }}>Paste a Google Drive link (drive.google.com…). The testimonial only counts once the video link is saved.</div>}
                </div>
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
                    <input style={{ marginTop: '.5rem' }} placeholder="Remind about what? (required)" value={remindNote} onChange={(e) => setRemindNote(e.target.value)} /></div>
                  <Menu label="Remind…" icon={Bell} primary options={remindOptions} onPick={async (pid) => { if (!remindNote.trim()) return setErr('Write what the reminder is about first.'); setErr(''); if (await remind(edit.id!, pid, remindNote.trim())) { setRemindNote(''); const t = remindOptions.find((o) => o.value === pid)?.label ?? null; setEdit({ ...edit, pending_on_id: pid, pending_on_name: t, pending_since: new Date().toISOString(), pending_by_name: profile?.full_name ?? null }) } }} />
                </div>
              )}
              <AccountNotes accountId={edit.id} refreshKey={bump} onChange={load} />
            </>
          )}

          {tab === 'history' && edit.id && <AuditTrail table="purchase_accounts" recordId={edit.id} />}
        </Modal>
      )}

      {voice && <VoiceUpdate page="account" onClose={() => setVoice(false)} onDone={load} />}
      {freezeFor && (
        <Modal title={freezeFor.frozen ? `Unfreeze ${freezeFor.name}` : `Freeze ${freezeFor.name}`} onClose={() => setFreezeFor(null)}>
          {freezeFor.frozen ? <p className="muted" style={{ marginTop: 0 }}>The account goes back into the onboarding flow where it left off.</p> : (<>
            <p className="muted" style={{ marginTop: 0 }}>A frozen account stops showing in the onboarding queues (ready to develop, developing, reminders). Nothing is deleted, and you can unfreeze it any time.</p>
            <div className="field"><label>Why is it frozen? (required)</label><textarea autoFocus value={freezeText} onChange={(e) => setFreezeText(e.target.value)} placeholder="e.g. Customer asked to stop AIGOAL / on hold until December" /></div>
          </>)}
          <div className="modal-foot"><button className="primary" disabled={!freezeFor.frozen && !freezeText.trim()} onClick={async () => { if (await rpc('set_account_frozen', { account_id: freezeFor.id, do_freeze: !freezeFor.frozen, reason: freezeText.trim() || null })) { setFreezeFor(null); setEdit(null) } }}><Snowflake size={16} />{freezeFor.frozen ? 'Unfreeze' : 'Freeze account'}</button></div>
        </Modal>
      )}
      {remindFor && (
        <Modal title={`Remind ${remindFor.name}`} onClose={() => setRemindFor(null)}>
          <p className="muted" style={{ marginTop: 0 }}>This account becomes “Pending {remindFor.name}” and shows on their dashboard. Say what you need from them.</p>
          <div className="field"><label>Remind about what? (required)</label><textarea autoFocus value={remindText} onChange={(e) => setRemindText(e.target.value)} placeholder="e.g. Please send the landing page link to the customer today" /></div>
          <div className="modal-foot"><button className="primary" disabled={!remindText.trim()} onClick={async () => { if (await remind(remindFor.id, remindFor.pid, remindText.trim())) setRemindFor(null) }}><Bell size={16} />Send reminder</button></div>
        </Modal>
      )}
    </>
  )
}
