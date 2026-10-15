import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, Funnel } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface P {
  leads: number; with_sales: number; no_sales: number; following_up: number; not_touched: number
  pending_management: number; pending_demo: number; pending_consultation: number; invite_webinar: number; potential: number
  purchased: number; followups_total: number; followups_week: number
}

/** Admin: marketing → sales team → following up → pipeline statuses → purchased. */
export default function LeadPipeline() {
  const [p, setP] = useState<P | null>(null)
  useEffect(() => { supabase.rpc('lead_pipeline').then(({ data }) => setP(data as P)) }, [])
  if (!p) return null
  const pct = (n: number) => (p.leads ? Math.round((n / p.leads) * 100) : 0)
  const steps = [
    { label: 'Leads from marketing', sub: 'All webinar leads so far', n: p.leads, to: '/customers', tone: 'brand' },
    { label: 'Given to the sales team', sub: p.no_sales ? `${p.no_sales} still unassigned` : 'Everyone has a sales person', n: p.with_sales, to: '/customers?owner=none', tone: 'brand' },
    { label: 'Being followed up', sub: `${p.followups_total} follow-ups logged · ${p.followups_week} this week · ${p.not_touched} not touched yet`, n: p.following_up, to: '/customers', tone: 'orange' },
    { label: 'Purchased', sub: 'Close Deal', n: p.purchased, to: '/customers?buy=yes', tone: 'green' },
  ]
  const statuses = [
    ['Pending Management', p.pending_management, 'pending_management'], ['Pending Demo', p.pending_demo, 'pending_demo'], ['Pending Consultation', p.pending_consultation, 'pending_consultation'],
    ['Invite Webinar', p.invite_webinar, 'invite_webinar'], ['Potential', p.potential, 'potential'],
  ] as const
  return (
    <div className="card">
      <div className="card-head"><h2><Funnel size={17} className="i" />Lead pipeline</h2><span className="muted sm-text">Webinars that have already taken place</span></div>
      <div className="funnel">
        {steps.map((s) => (
          <Link key={s.label} to={s.to} className={'funnel-row tone-' + s.tone}>
            <div className="funnel-top"><b>{s.label}</b><span><b className="funnel-n">{s.n}</b> <span className="muted">{pct(s.n)}%</span></span></div>
            <div className="bar"><i style={{ width: `${pct(s.n)}%` }} /></div>
            <small className="muted">{s.sub}</small>
          </Link>
        ))}
      </div>
      <div className="funnel-status">
        <b className="sm-text muted">Where the followed-up leads are</b>
        <div className="chips" style={{ marginTop: '.4rem' }}>
          {statuses.map(([label, n, key]) => <Link key={key} to={`/customers?status=${key}`} className="tag brand">{label} · {n}</Link>)}
          <Link to="/customers?buy=yes" className="tag good"><BadgeCheck size={12} />Purchased · {p.purchased}</Link>
        </div>
      </div>
    </div>
  )
}
