import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, BookOpen, CalendarDays, ListChecks, LayoutDashboard, LogOut, Menu, NotebookPen, PhoneCall, ReceiptText, ScrollText, SlidersHorizontal, Users } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { asset } from '../lib/asset'
import { initials } from './ui'

/**
 * Menu by access level:
 *  everyone      Home, To-Do, PDR/KPI, Meeting Minutes, Purchase Accounts, Follow-Up Customers
 *  HR (extra)    Calendar & Leave, People
 *  Admin (all)   + Knowledge Base, Audit Log, KPI Templates
 */
export default function Layout() {
  const { profile, isAdmin, isHr, isManager, isExternal, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [waiting, setWaiting] = useState(0)
  const loc = useLocation()

  useEffect(() => {
    if (!profile) return
    const run = () => supabase.from('purchase_accounts').select('id', { count: 'exact', head: true }).eq('pending_on_id', profile.id).then(({ count }) => setWaiting(count ?? 0))
    run()
    const t = setInterval(run, 60000)
    return () => clearInterval(t)
  }, [profile?.id, loc.pathname])

  const link = (to: string, label: string, Ico: typeof Menu, badge = 0) => (
    <NavLink to={to} className={({ isActive }) => 'nav' + (isActive ? ' active' : '')} onClick={() => setOpen(false)}>
      <Ico size={18} />{label}{badge > 0 && <span className="nav-badge">{badge}</span>}
    </NavLink>
  )
  return (
    <div className="shell">
      <div className="topbar">
        <button className="ghost icon" aria-label="Menu" onClick={() => setOpen(true)}><Menu size={20} /></button>
        <img src={asset('logo-mark.png')} alt="" className="logo-img" width={28} height={28} />AIGOAL Intranet
      </div>
      <div className={'scrim' + (open ? ' show' : '')} onClick={() => setOpen(false)} />
      <aside className={'side' + (open ? ' open' : '')}>
        <div className="brand"><img src={asset('logo-mark.png')} alt="AIGOAL" className="logo-img" width={36} height={36} />AIGOAL Intranet</div>
        {link('/home', 'Home', LayoutDashboard)}
        {!isExternal && link('/todos', 'To-Do', ListChecks)}
        {(isAdmin || isHr) && link('/calendar', 'Calendar & Leave', CalendarDays)}
        {isManager && link('/kpi', 'PDR / KPI', BarChart3)}
        {isManager && link('/meetings', 'Meeting Minutes', NotebookPen)}
        {link('/accounts', 'Purchase Accounts', ReceiptText, waiting)}
        {link('/customers', 'Follow-Up Customers', PhoneCall)}
        {!isExternal && link('/kb', 'Knowledge Base', BookOpen)}
        {isManager && <div className="nav-label">Manage</div>}
        {isManager && link('/people', 'People', Users)}
        {isAdmin && link('/audit', 'Audit Log', ScrollText)}
        {isAdmin && link('/kpi-templates', 'KPI Templates', SlidersHorizontal)}
        <div className="who">
          <NavLink to="/profile" className="who-link" title="My profile and password" onClick={() => setOpen(false)}>
            <div className="avatar">{initials(profile?.full_name || profile?.email)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="name">{profile?.full_name || profile?.email}</div>
              <div className="role">{[profile?.role, profile?.is_sales && 'sales', profile?.is_ai_builder && 'ai builder'].filter(Boolean).join(' · ')}</div>
            </div>
          </NavLink>
          <button className="out icon" aria-label="Sign out" title="Sign out" onClick={signOut}><LogOut size={17} /></button>
        </div>
      </aside>
      <main className="main"><Outlet /></main>
      {/* phone-only bottom bar (WhatsApp style): Home, To-Do, Knowledge Base */}
      <nav className="tabbar" aria-label="Quick navigation">
        <NavLink to="/home" className={({ isActive }) => 'tab' + (isActive ? ' on' : '')}><LayoutDashboard size={22} /><span>Home</span></NavLink>
        {!isExternal && <NavLink to="/todos" className={({ isActive }) => 'tab' + (isActive ? ' on' : '')}><ListChecks size={22} /><span>To-Do</span></NavLink>}
        {!isExternal && <NavLink to="/kb" className={({ isActive }) => 'tab' + (isActive ? ' on' : '')}><BookOpen size={22} /><span>Knowledge Base</span></NavLink>}
      </nav>
    </div>
  )
}
