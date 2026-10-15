import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, BarChart3, CalendarClock, CalendarDays, ClipboardCheck, ExternalLink, Hammer, KeyRound, ListChecks, MessageSquareWarning, NotebookPen, PhoneCall, Pin, Plane, ShieldCheck, UserX, Users, Wallet, Wrench, type LucideIcon } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { loadUserPayouts } from '../lib/kpiLoad'
import { buildPipeline, dayTime } from '../lib/pipeline'
import { dayLabel, money, monthLabel, monthStart, today } from '../lib/util'
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

/** Admin: is the automatic AIGOAL calendar sync healthy? */
function SyncStatus() {
  const [last, setLast] = useState<{ ran_at: string; ok: boolean; error: string | null } | null | undefined>(undefined)
  useEffect(() => { supabase.from('sync_log').select('ran_at, ok, error').order('ran_at', { ascending: false }).limit(1).then(({ data }) => setLast(data?.[0] ?? null)) }, [])
  if (last === undefined) return null
  const stale = last && Date.now() - new Date(last.ran_at).getTime() > 3 * 3600e3
  const bad = !last || !last.ok || stale
  return (
    <div className={'alert' + (bad ? '' : ' ok')} style={{ marginBottom: '1rem' }}>
      <b>AIGOAL calendar sync:</b>{' '}
      {!last ? 'has not run yet.' : last.ok && !stale ? `automatic, last ran ${ago(last.ran_at)}.` : `last run ${ago(last.ran_at)} ${last.ok ? 'is out of date' : 'failed'}${last.error ? ` — ${last.error}` : ''}.`}
    </div>
  )
}

function Attention({ items }: { items: Item[] }) {
  const shown = items.filter((i) => i.n > 0)
  return (
    <div className="card">
      <div className="card-head"><h2><ClipboardCheck size={17} className="i" />Needs your attention</h2><span className="muted sm-text">{shown.length ? `${shown.length} item${shown.length > 1 ? 's' : ''}` : ''}</span></div>
      {!shown.length && <Empty icon={ShieldCheck} title="All clear">Nothing is waiting on you right now.</Empty>}
      <div className="attn">
        {shown.map((i) => (
          <Link key={i.key} to={i.to} className="attn-item">
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
  const [pinned, setPinned] = useState<KbArticle[]>([])
  const [hot, setHot] = useState(0)
  const [kpi, setKpi] = useState<{ score: number; max: number; total: number; cur: string; tpl: string } | null>(null)
  const [ov, setOv] = useState<Overview | null>(null)
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
    accounts.forEach((a) => { c[buildPipeline(a, sessions).stage]++ })
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
      <PageHeader title={`Welcome back, ${profile?.full_name?.split(' ')[0] || 'there'}`} sub={new Date().toLocaleDateString('en-GB', { dateStyle: 'full' })} />

      {isAdmin && <SyncStatus />}
      <Attention items={isAdmin ? adminItems : myItems} />

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

          <div className="card flush table-wrap">
            <div className="card-head" style={{ padding: '1rem 1.25rem 0' }}><h2><Users size={17} className="i" />Team status</h2><span className="muted sm-text">Today, {dayLabel(today())}</span></div>
            <table>
              <thead><tr><th>Person</th><th>To-do</th><th>Accounts</th><th>Leads</th><th>Last seen</th></tr></thead>
              <tbody>
                {ov.staff.map((s) => (
                  <tr key={s.id}>
                    <td style={{ minWidth: 180 }}>
                      <div className="row" style={{ flexWrap: 'nowrap', gap: '.6rem' }}>
                        <div className="avatar">{initials(s.name)}</div>
                        <div><div className="cell-title">{s.name}</div><div className="muted sm-text">{s.title || s.role}</div></div>
                      </div>
                    </td>
                    <td style={{ minWidth: 160 }}>
                      <div className="sm-text">{s.todos_done}/{s.todos_today} done today</div>
                      <div className="bar" style={{ margin: '.2rem 0' }}><i style={{ width: s.todos_today ? `${(s.todos_done / s.todos_today) * 100}%` : 0 }} /></div>
                      <div className="row" style={{ gap: '.3rem' }}>
                        {s.todos_overdue > 0 && <span className="tag warn">{s.todos_overdue} overdue</span>}
                        {s.todos_unscheduled > 0 && <span className="tag">{s.todos_unscheduled} to schedule</span>}
                        {s.meeting_overdue > 0 && <span className="tag warn">{s.meeting_overdue} meeting actions late</span>}
                      </div>
                    </td>
                    <td style={{ minWidth: 150 }}>
                      <b>{s.accounts}</b> <span className="muted sm-text">owned</span>
                      <div className="row" style={{ gap: '.3rem', marginTop: 2 }}>
                        {s.accounts_waiting_on > 0 && <span className="tag warn">{s.accounts_waiting_on} waiting on them</span>}
                        {s.open_issues > 0 && <span className="tag warn">{s.open_issues} issues</span>}
                      </div>
                    </td>
                    <td style={{ minWidth: 170 }}>
                      <b>{s.leads}</b> <span className="muted sm-text">leads</span>
                      <div className="row" style={{ gap: '.3rem', marginTop: 2 }}>
                        {s.leads_pending_mgmt > 0 && <span className="tag warn">{s.leads_pending_mgmt} mgmt</span>}
                        {s.leads_pending_demo > 0 && <span className="tag brand">{s.leads_pending_demo} demo</span>}
                        {s.leads_invite_webinar > 0 && <span className="tag good">{s.leads_invite_webinar} invite</span>}
                      </div>
                    </td>
                    <td className="nowrap"><span className={ago(s.last_seen_at) === 'Online now' ? 'ok' : 'muted'}>{ago(s.last_seen_at)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
        <div className="card">
          <div className="card-head"><h2>Today's to-do</h2><Link to="/todos" className="row" style={{ gap: '.25rem' }}>Open <ArrowRight size={15} /></Link></div>
          <div className="bar" style={{ marginBottom: '.5rem' }}><i style={{ width: todos.length ? `${(done / todos.length) * 100}%` : 0 }} /></div>
          {todos.slice(0, 7).map((t) => (
            <label key={t.id} className={'todo' + (t.done ? ' done' : '')} style={{ margin: 0, cursor: 'pointer', color: 'inherit', fontSize: 'inherit', fontWeight: 400 }}>
              <input type="checkbox" checked={t.done} onChange={() => toggle(t)} /><span className="t">{t.title}</span>
            </label>
          ))}
          {!todos.length && <Empty icon={ListChecks} title="Nothing planned today">Add tasks from the To-Do page.</Empty>}
        </div>
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
