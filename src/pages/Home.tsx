import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, BarChart3, CalendarClock, CalendarDays, Check, ClipboardCheck, ExternalLink, Hammer, KeyRound, ListChecks, MessageSquareWarning, NotebookPen, PhoneCall, Pin, Plane, ShieldCheck, UserX, Users, Wallet, Wrench, type LucideIcon } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { loadUserPayouts } from '../lib/kpiLoad'
import { buildPipeline, dayTime } from '../lib/pipeline'
import { addDays, addMonths, dayLabel, money, monthLabel, monthStart, today } from '../lib/util'
import { outcomeOf, tally, weekStart } from '../lib/todo'
import TodayTodo from '../components/TodayTodo'
import LeadPipeline from '../components/LeadPipeline'
import AigoalToken from '../components/AigoalToken'
import { Empty, initials, PageHeader, Stat } from '../components/ui'
import type { KbArticle, OnboardingSession, PurchaseAccount, Todo } from '../lib/types'

interface StaffRow {
  id: string; name: string; title: string | null; role: string; last_seen_at: string | null; must_change_password: boolean
  away_today: 'leave' | 'travel' | null; leave_remaining: number | null
  todos_today: number; todos_done: number; todos_overdue: number; todos_unscheduled: number; meeting_overdue: number
  accounts: number; accounts_waiting_on: number; open_issues: number
  leads: number; leads_pending_mgmt: number; leads_pending_demo: number; leads_invite_webinar: number
}
interface Overview {
  staff: StaffRow[]; leave_pending: number; password_not_set: number; unassigned_accounts: number; unassigned_leads: number; open_issues: number
  overdue_followups: number; meeting_overdue: number; leads_pending_mgmt: number; leads_pending_demo: number; leads_invite_webinar: number
  pending_mgmt_list: { id: string; name: string; owner_name: string | null; status_remark: string | null; status_updated_by: string | null; status_updated_at: string | null }[]
  accounts_pending_on: { name: string; n: number }[]
  upcoming_demos: { name: string; owner_name: string | null; demo_by_name: string; demo_date: string; demo_time: string }[]
  upcoming_invites: { date: string; n: number }[]
  upcoming_onboarding: { account_name: string; round: number; start_at: string; host: string | null; status: string | null }[]
}
type Item = { key: string; label: string; n: number; to: string; tone: 'red' | 'orange' | 'yellow' | 'gray' | ''; icon: LucideIcon }

const ago = (iso: string | null) => {
  if (!iso) return 'Never'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 2) return 'Online now'
  if (m < 60) return `${m} min ago`
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`
  return `${Math.round(m / 1440)} d ago`
}

const syncAgo = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 2 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago` }

type SyncRow = { ran_at: string; ok: boolean; error: string | null; onboarding: number | null; bookings: number | null; token_expires_at: string | null }
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kuala_Lumpur' })
const mins = (ms: number) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min` }

/** Admin: is the AIGOAL calendar connection live or down, what it covers, and when the token must be renewed */
function SyncStatus() {
  const [rows, setRows] = useState<SyncRow[] | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const reload = () => supabase.from('sync_log').select('ran_at, ok, error, onboarding, bookings, token_expires_at').order('ran_at', { ascending: false }).limit(30).then(({ data }) => setRows((data ?? []) as SyncRow[]))
  useEffect(() => { reload() }, [])
  if (rows === undefined) return null
  const last = rows[0]
  const lastOk = rows.find((r) => r.ok)
  const stale = !!last && Date.now() - new Date(last.ran_at).getTime() > 2 * 3600e3
  const live = !!last && last.ok && !stale
  const left = lastOk?.token_expires_at ? new Date(lastOk.token_expires_at).getTime() - Date.now() : null
  const soon = live && left !== null && left < 15 * 60000
  return (
    <div className={'sync-bar ' + (live ? (soon ? 'warn' : 'live') : 'down')}>
      {open && <AigoalToken onClose={() => setOpen(false)} onDone={reload} />}
      <span className="sync-dot" />
      <div className="sync-text">
        <b>AIGOAL calendar is {live ? 'live' : 'down'}</b>
        <span className="sync-sub">{live ? `Last synced ${syncAgo(last.ran_at)} · runs automatically every 30 minutes` : !last ? 'The automatic sync has not run yet.' : last.error?.includes('rejected') || last.error?.includes('No AIGOAL token') ? 'The AIGOAL token has expired. Paste a new one to bring it back.' : last.error ?? 'The last sync failed.'}</span>
        <div className="sync-chips">
          <span className="sync-chip" title="Read only: nothing is written to AIGOAL"><b>{lastOk?.onboarding ?? '—'}</b> onboarding → Purchase Accounts</span>
          <span className="sync-chip"><b>{lastOk?.bookings ?? '—'}</b> demo / consultation → Follow-Up Customers</span>
          <span className={'sync-chip' + (soon || !live ? ' hot' : '')}>Token: <b>{!live || (left !== null && left <= 0) ? 'renew now' : left === null ? 'renew when down' : `until ${clock(lastOk!.token_expires_at!)} (${mins(left)})`}</b></span>
        </div>
      </div>
      <button className={live && !soon ? '' : 'primary'} onClick={() => setOpen(true)}><KeyRound size={15} />{live && !soon ? 'Update token' : 'Paste new token'}</button>
    </div>
  )
}

const hello = () => { const h = Number(new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kuala_Lumpur' })); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' }

/** Admin: one card per person (Admin accounts left out), tick who to show. */
function TeamStatus({ team, hidden, setHidden }: { team: StaffRow[]; hidden: string[]; setHidden: (v: string[]) => void }) {
  const shown = team.filter((s) => !hidden.includes(s.id))
  // everyone's to-dos around today: used for the Day / Week / Month marks and the 7-day graph on each card
  const [range, setRange] = useState<'day' | 'week' | 'month'>('day')
  const [all, setAll] = useState<Record<string, Pick<Todo, 'due_date' | 'done' | 'created_at' | 'done_at' | 'delayed_days'>[]>>({})
  useEffect(() => {
    const t = today()
    supabase.from('todos').select('user_id, due_date, done, created_at, done_at, delayed_days').gte('due_date', addDays(t, -45)).lte('due_date', addDays(t, 45)).limit(10000).then(({ data }) => {
      const m: Record<string, Pick<Todo, 'due_date' | 'done' | 'created_at' | 'done_at' | 'delayed_days'>[]> = {}
      ;(data ?? []).forEach((x: any) => (m[x.user_id] ||= []).push(x))
      setAll(m)
    })
  }, [])
  const t0 = today()
  const [rf, rt] = range === 'day' ? [t0, t0] : range === 'week' ? [weekStart(t0), addDays(weekStart(t0), 6)] : [monthStart(new Date(t0 + 'T12:00:00')), addDays(addMonths(monthStart(new Date(t0 + 'T12:00:00')), 1), -1)]
  const days7 = Array.from({ length: 7 }, (_, i) => addDays(t0, i - 6))
  const week: Record<string, { done: number; total: number }[]> = {}
  Object.entries(all).forEach(([uid, list]) => { week[uid] = days7.map((d) => { const l = list.filter((x) => x.due_date === d); return { done: l.filter((x) => outcomeOf(x) === 'done').length, total: l.length } }) })
  return (
    <div className="card">
      <div className="card-head">
        <h2><Users size={17} className="i" />Team status</h2>
        <div className="tabs" style={{ margin: 0 }} role="tablist" aria-label="Marks period">
          {(['day', 'week', 'month'] as const).map((r) => <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{r === 'day' ? 'Day' : r === 'week' ? 'Week' : 'Month'}</button>)}
        </div>
        <div className="chips">
          {team.map((s) => { const on = !hidden.includes(s.id); return (
            <button key={s.id} type="button" className={'chip' + (on ? ' on' : '')} aria-pressed={on} title={on ? 'Click to hide' : 'Click to show'} onClick={() => setHidden(on ? [...hidden, s.id] : hidden.filter((x) => x !== s.id))}>{on && <Check size={13} />}{(s.name || '').split(' ')[0]}</button>
          ) })}
        </div>
      </div>
      {!shown.length && <Empty icon={Users} title="Nobody selected">Tick a name above to show them.</Empty>}
      <div className="team-grid">
        {shown.map((s) => {
          const online = ago(s.last_seen_at) === 'Online now'
          const pct = s.todos_today ? Math.round((s.todos_done / s.todos_today) * 100) : 0
          return (
            <div key={s.id} className="team-card">
              <div className="team-head">
                <div className="avatar-wrap"><div className="avatar">{initials(s.name)}</div><i className={'presence' + (online ? ' on' : '')} /></div>
                <div style={{ minWidth: 0, flex: 1 }}><div className="cell-title">{s.name}</div><div className="muted sm-text">{s.title || s.role}</div></div>
                {s.must_change_password ? <span className="tag">Not signed in yet</span> : s.away_today === 'leave' ? <span className="tag warn">On leave</span> : s.away_today === 'travel' ? <span className="tag brand">Travelling</span> : <span className={'sm-text ' + (online ? 'ok' : 'muted')}>{online ? 'Online' : ago(s.last_seen_at)}</span>}
              </div>
              {(() => { const inR = (all[s.id] ?? []).filter((x) => x.due_date && x.due_date >= rf && x.due_date <= rt); const mk = tally(inR); const dl = inR.filter((x) => x.delayed_days > 0); const dlDays = dl.reduce((n, x) => n + x.delayed_days, 0); return (
                <div className="team-block">
                  <div className="team-label"><span>Marks · {range === 'day' ? 'today' : range === 'week' ? 'this week' : 'this month'}</span><b>{mk.total ? `${mk.done}/${mk.total} = ${mk.score}%` : 'No to-do'}</b></div>
                  <div className="bar"><i style={{ width: `${mk.score ?? 0}%` }} /></div>
                  <div className="row" style={{ gap: '.3rem', marginTop: '.4rem' }}>
                    {mk.total > 0 && <span className="tag good">{mk.done} done</span>}
                    {mk.missed > 0 && <span className="tag warn">{mk.missed} not done</span>}
                    {mk.open > 0 && <span className="tag">{mk.open} open</span>}
                    {dl.length > 0 && <span className="tag bad" title="Tasks moved to a later day (recorded, cannot be edited)">{dl.length} delayed · {dlDays} day{dlDays > 1 ? 's' : ''}</span>}
                    {s.todos_unscheduled > 0 && <span className="tag">{s.todos_unscheduled} waiting for a day</span>}
                    {s.meeting_overdue > 0 && <span className="tag warn">{s.meeting_overdue} meeting actions late</span>}
                  </div>
                </div>) })()}
              {(() => { const w = week[s.id]; const tot = w?.reduce((a, d) => a + d.total, 0) ?? 0; const dn = w?.reduce((a, d) => a + d.done, 0) ?? 0; return (
                <div className="team-block">
                  <div className="team-label"><span>Last 7 days</span><b>{tot ? `${dn}/${tot} done · ${Math.round((dn / tot) * 100)}%` : 'No tasks'}</b></div>
                  <div className="spark" aria-hidden>{(w ?? Array.from({ length: 7 }, () => ({ done: 0, total: 0 }))).map((d, i) => <i key={i} className={d.total ? 'some' : ''} title={`${d.done}/${d.total}`}><b style={{ height: d.total ? `${Math.max(12, (d.done / d.total) * 100)}%` : 0, opacity: d.done ? 1 : 0 }} /></i>)}</div>
                </div>) })()}
              <div className="team-split">
                <Link to="/accounts" className="team-metric"><small>Accounts</small><b>{s.accounts}</b>
                  <span className="row" style={{ gap: '.3rem' }}>{s.accounts_waiting_on > 0 && <span className="tag warn">{s.accounts_waiting_on} waiting</span>}{s.open_issues > 0 && <span className="tag warn">{s.open_issues} issues</span>}</span></Link>
                <Link to="/customers" className="team-metric"><small>Leads</small><b>{s.leads}</b>
                  <span className="row" style={{ gap: '.3rem' }}>{s.leads_pending_mgmt > 0 && <span className="tag warn">{s.leads_pending_mgmt} mgmt</span>}{s.leads_pending_demo > 0 && <span className="tag brand">{s.leads_pending_demo} demo</span>}{s.leads_invite_webinar > 0 && <span className="tag good">{s.leads_invite_webinar} invite</span>}</span></Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Attention({ items }: { items: Item[] }) {
  const rank = { red: 0, orange: 1, yellow: 2, '': 3, gray: 4 }
  const shown = items.filter((i) => i.n > 0).sort((x, y) => rank[x.tone] - rank[y.tone] || y.n - x.n)
  return (
    <div className="card">
      <div className="card-head"><h2><ClipboardCheck size={17} className="i" />Needs your attention</h2><span className="muted sm-text">{shown.length ? `${shown.length} item${shown.length > 1 ? 's' : ''}` : ''}</span></div>
      {!shown.length && <Empty icon={ShieldCheck} title="All clear">Nothing is waiting on you right now.</Empty>}
      <div className="attn">
        {shown.map((i) => (
          <Link key={i.key} to={i.to} className={'attn-item tone-' + (i.tone || 'brand')}>
            <span className={'stat-ico ' + i.tone}><i.icon size={18} /></span>
            <span className="attn-n">{i.n}</span>
            <span className="attn-l">{i.label}</span>
            <ArrowRight size={15} className="i" />
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function Home() {
  const { profile, isAdmin } = useAuth()
  const [todos, setTodos] = useState<Todo[]>([])
  // Team status: Admin accounts are left out; tick who to show (remembered in this browser)
  const [hidden, setHiddenRaw] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('team-hidden') ?? '[]') } catch { return [] } })
  const setHidden = (v: string[]) => { setHiddenRaw(v); try { localStorage.setItem('team-hidden', JSON.stringify(v)) } catch { /* private mode */ } }
  const [pinned, setPinned] = useState<KbArticle[]>([])
  const [hot, setHot] = useState(0)
  const [kpi, setKpi] = useState<{ score: number; max: number; total: number; cur: string; tpl: string } | null>(null)
  const [ov, setOv] = useState<Overview | null>(null)
  const team = (ov?.staff ?? []).filter((s) => s.role !== 'admin')
  const [accounts, setAccounts] = useState<PurchaseAccount[]>([])
  const [sessions, setSessions] = useState<OnboardingSession[]>([])
  const [mine, setMine] = useState({ waiting: 0, overdue: 0, unscheduled: 0, meeting: 0, pm: 0 })
  const month = monthStart(new Date())

  useEffect(() => {
    if (!profile) return
    const me = profile.id
    supabase.from('todos').select('*').eq('user_id', me).eq('due_date', today()).order('done').then(({ data }) => setTodos((data ?? []) as Todo[]))
    supabase.from('kb_articles').select('*').eq('pinned', true).then(({ data }) => setPinned((data ?? []) as KbArticle[]))
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('priority', 'P1').eq('owner_id', me).then(({ count }) => setHot(count ?? 0))
    ;(async () => {
      const c = (q: any) => q.then((r: any) => r.count ?? 0)
      const [waiting, overdue, unscheduled, meeting, pm] = await Promise.all([
        c(supabase.from('purchase_accounts').select('id', { count: 'exact', head: true }).eq('pending_on_id', me)),
        c(supabase.from('todos').select('id', { count: 'exact', head: true }).eq('user_id', me).eq('done', false).lt('due_date', today())),
        c(supabase.from('todos').select('id', { count: 'exact', head: true }).eq('user_id', me).eq('done', false).is('due_date', null)),
        c(supabase.from('meeting_tasks').select('id', { count: 'exact', head: true }).eq('assignee_id', me).eq('status', 'open').lt('deadline', today())),
        c(supabase.from('customers').select('id', { count: 'exact', head: true }).eq('owner_id', me).eq('lead_status', 'pending_management')),
      ])
      setMine({ waiting, overdue, unscheduled, meeting, pm })
    })()
    loadUserPayouts(me).then((list) => {
      const x = list.find((u) => u.review.month === month)
      if (x) setKpi({ score: x.payout.baseScore, max: x.payout.maxScore, total: x.payout.grand, cur: x.tpl.currency, tpl: x.tpl.name })
    })
    if (isAdmin) {
      supabase.rpc('admin_overview').then(({ data }) => setOv(data as Overview))
      supabase.from('purchase_accounts').select('*').then(({ data }) => setAccounts((data ?? []) as PurchaseAccount[]))
      supabase.from('onboarding_sessions').select('*').then(({ data }) => setSessions((data ?? []) as OnboardingSession[]))
    }
  }, [profile?.id, isAdmin])

  const toggle = async (t: Todo) => {
    await supabase.from('todos').update({ done: !t.done, done_at: !t.done ? new Date().toISOString() : null }).eq('id', t.id)
    setTodos(todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))
  }
  const done = todos.filter((t) => t.done).length

  const stages = useMemo(() => {
    const c: Record<string, number> = { o1: 0, dev: 0, devdone: 0, o2: 0, o3: 0, complete: 0 }
    accounts.forEach((a) => { const st = buildPipeline(a, sessions).stage; if (st in c) c[st]++ })
    return c
  }, [accounts, sessions])

  const adminItems: Item[] = ov ? [
    { key: 'leave', label: 'Leave requests to approve', n: ov.leave_pending, to: '/calendar?tab=approve', tone: 'orange', icon: Plane },
    { key: 'pm', label: 'Leads waiting on Management', n: ov.leads_pending_mgmt, to: '/customers?status=pending_management', tone: 'red', icon: MessageSquareWarning },
    { key: 'pend', label: 'Accounts waiting on a person', n: ov.accounts_pending_on.reduce((s, x) => s + x.n, 0), to: '/accounts?pending=any', tone: 'orange', icon: UserX },
    { key: 'dev', label: 'Accounts ready to develop', n: stages.dev, to: '/accounts?stage=dev', tone: 'orange', icon: Hammer },
    { key: 'devd', label: 'Accounts being developed', n: stages.devdone, to: '/accounts?stage=devdone', tone: 'yellow', icon: Wrench },
    { key: 'issues', label: 'Open customer issues', n: ov.open_issues, to: '/accounts?issues=yes', tone: 'red', icon: AlertTriangle },
    { key: 'fu', label: 'Follow-ups past their deadline', n: ov.overdue_followups, to: '/accounts', tone: 'red', icon: CalendarClock },
    { key: 'ua', label: 'Accounts with no owner', n: ov.unassigned_accounts, to: '/accounts?who=none', tone: 'yellow', icon: Users },
    { key: 'ul', label: 'Leads with no sales person', n: ov.unassigned_leads, to: '/customers?owner=none', tone: 'yellow', icon: PhoneCall },
    { key: 'mt', label: 'Meeting action items overdue', n: ov.meeting_overdue, to: '/meetings', tone: 'red', icon: NotebookPen },
    { key: 'pw', label: "Staff who haven't set their password yet", n: ov.password_not_set, to: '/people', tone: 'gray', icon: KeyRound },
    { key: 'pd', label: 'Leads pending a demo', n: ov.leads_pending_demo, to: '/customers?status=pending_demo', tone: '', icon: PhoneCall },
    { key: 'iw', label: 'Leads to invite to the webinar', n: ov.leads_invite_webinar, to: '/customers?status=invite_webinar', tone: '', icon: CalendarDays },
  ] : []
  const myItems: Item[] = [
    { key: 'w', label: 'Accounts waiting on you', n: mine.waiting, to: '/accounts?pending=me', tone: 'red', icon: UserX },
    { key: 'o', label: 'Overdue to-dos', n: mine.overdue, to: '/todos', tone: 'red', icon: ListChecks },
    { key: 'u', label: 'Tasks to schedule', n: mine.unscheduled, to: '/todos', tone: 'orange', icon: CalendarClock },
    { key: 'm', label: 'Meeting actions overdue', n: mine.meeting, to: '/meetings', tone: 'red', icon: NotebookPen },
    { key: 'p', label: 'Your leads waiting on Management', n: mine.pm, to: '/customers?status=pending_management', tone: 'orange', icon: MessageSquareWarning },
  ]

  return (
    <>
      <PageHeader title={`${hello()}, ${profile?.full_name?.split(' ')[0] || 'there'}`} sub={new Date().toLocaleDateString('en-GB', { dateStyle: 'full' })} />

      {isAdmin && <SyncStatus />}
      <Attention items={isAdmin ? adminItems : myItems} />
      {isAdmin && <LeadPipeline />}

      {isAdmin && ov && (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            <div className="card">
              <div className="card-head"><h2><MessageSquareWarning size={17} className="i" />Pending Management</h2><Link to="/customers?status=pending_management" className="row" style={{ gap: '.25rem' }}>All <ArrowRight size={15} /></Link></div>
              {ov.pending_mgmt_list.map((l) => (
                <div key={l.id} className="day-row" style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{l.name}</b> <span className="muted sm-text">· {l.owner_name ?? 'unassigned'}</span>
                    <div className="sm-text clamp2">{l.status_remark}</div>
                  </div>
                  <span className="muted sm-text nowrap">{l.status_updated_at ? dayLabel(l.status_updated_at.slice(0, 10)) : ''}</span>
                </div>
              ))}
              {!ov.pending_mgmt_list.length && <p className="muted" style={{ margin: 0 }}>No leads are waiting on Management.</p>}
            </div>
            <div className="card">
              <div className="card-head"><h2><CalendarClock size={17} className="i" />Onboarding in the next 7 days</h2><Link to="/accounts" className="row" style={{ gap: '.25rem' }}>Accounts <ArrowRight size={15} /></Link></div>
              {ov.upcoming_onboarding.map((u, i) => (
                <div key={i} className="day-row"><span className="tag brand">O{u.round}</span><b style={{ flex: 1 }}>{u.account_name}</b><span className="muted sm-text">{dayTime(u.start_at)}{u.host && ` · ${u.host}`}</span></div>
              ))}
              {!ov.upcoming_onboarding.length && <p className="muted" style={{ margin: 0 }}>No onboarding sessions booked.</p>}
              {(ov.upcoming_demos?.length ?? 0) > 0 && (
                <div style={{ marginTop: '.8rem', paddingTop: '.8rem', borderTop: '1px solid var(--line)' }}>
                  <div className="muted sm-text" style={{ marginBottom: '.3rem' }}>Demos coming up</div>
                  {ov.upcoming_demos.map((d, i) => <div key={i} className="day-row"><b style={{ flex: 1 }}>{d.name}</b><span className="muted sm-text">{d.demo_by_name} · {dayLabel(d.demo_date)} {d.demo_time}</span></div>)}
                </div>
              )}
              {(ov.upcoming_invites?.length ?? 0) > 0 && (
                <div style={{ marginTop: '.8rem', paddingTop: '.8rem', borderTop: '1px solid var(--line)' }}>
                  <div className="muted sm-text" style={{ marginBottom: '.3rem' }}>Invited to webinars</div>
                  <div className="chips">{ov.upcoming_invites.map((i) => <Link key={i.date} to="/customers?status=invite_webinar" className="tag good">{dayLabel(i.date)} · {i.n}</Link>)}</div>
                </div>
              )}
              {ov.accounts_pending_on.length > 0 && (
                <div style={{ marginTop: '.8rem', paddingTop: '.8rem', borderTop: '1px solid var(--line)' }}>
                  <div className="muted sm-text" style={{ marginBottom: '.3rem' }}>Accounts waiting on</div>
                  <div className="chips">{ov.accounts_pending_on.map((g) => <Link key={g.name} to={`/accounts?pending=${encodeURIComponent(g.name)}`} className="tag warn">{g.name} · {g.n}</Link>)}</div>
                </div>
              )}
            </div>
          </div>

          <TeamStatus team={team} hidden={hidden} setHidden={setHidden} />
        </>
      )}

      {!isAdmin && (
        <>
      <div className="grid">
        <Stat icon={ListChecks} label="Your tasks done today" value={`${done} / ${todos.length}`} />
        <Stat icon={BarChart3} tone="green" label={`${monthLabel(month)} base score`} value={kpi ? `${kpi.score} / ${kpi.max}` : 'Not set'} />
        <Stat icon={Wallet} tone="orange" label="Estimated payout" value={kpi ? money(kpi.total, kpi.cur) : '—'} />
        <Stat icon={PhoneCall} tone="red" label="Your hot customers (P1)" value={hot} />
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <TodayTodo me={profile!.id} todos={todos} setTodos={setTodos} />
        <div className="card">
          <div className="card-head"><h2><Pin size={17} className="i" />Quick links</h2>{isAdmin && <Link to="/kb" className="row" style={{ gap: '.25rem' }}>All <ArrowRight size={15} /></Link>}</div>
          {pinned.map((a) => (
            <div key={a.id} className="link-row">
              <ExternalLink size={15} className="i" style={{ color: 'var(--muted)' }} />
              {a.url ? <a href={a.url} target="_blank" rel="noreferrer">{a.title}</a> : <span>{a.title}</span>}
            </div>
          ))}
          {!pinned.length && <Empty icon={Pin} title="No pinned links">Admin can pin articles from the Knowledge Base.</Empty>}
        </div>
      </div>
        </>
      )}
      {!isAdmin && kpi && <p className="muted sm-text">Scorecard: {kpi.tpl}</p>}
    </>
  )
}
