import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { BarChart3, BookOpen, CalendarDays, ListChecks, LayoutDashboard, LogOut, Menu, NotebookPen, PhoneCall, ReceiptText, ScrollText, SlidersHorizontal, Sparkles, UserRound, Users } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { initials } from './ui'

export default function Layout() {
  const { profile, isAdmin, isManager, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const link = (to: string, label: string, Ico: typeof Menu) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => 'nav' + (isActive ? ' active' : '')} onClick={() => setOpen(false)}>
      <Ico size={18} />{label}
    </NavLink>
  )
  return (
    <div className="shell">
      <div className="topbar">
        <button className="ghost icon" aria-label="Menu" onClick={() => setOpen(true)}><Menu size={20} /></button>
        AIGOAL Intranet
      </div>
      <div className={'scrim' + (open ? ' show' : '')} onClick={() => setOpen(false)} />
      <aside className={'side' + (open ? ' open' : '')}>
        <div className="brand"><span className="logo"><Sparkles size={18} /></span>AIGOAL Intranet</div>
        {link('/', 'Home', LayoutDashboard)}
        {link('/todos', 'To-Do', ListChecks)}
        {link('/calendar', 'Calendar & Leave', CalendarDays)}
        {link('/kpi', 'PDR / KPI', BarChart3)}
        {link('/meetings', 'Meeting Minutes', NotebookPen)}
        {link('/accounts', 'Purchase Accounts', ReceiptText)}
        {link('/customers', 'Follow-Up Customers', PhoneCall)}
        {link('/kb', 'Knowledge Base', BookOpen)}
        {isManager && <div className="nav-label">Manage</div>}
        {isManager && link('/people', 'People', Users)}
        {isAdmin && link('/audit', 'Audit Log', ScrollText)}
        {isAdmin && link('/kpi-templates', 'KPI Templates', SlidersHorizontal)}
        <div className="nav-label">Account</div>
        {link('/profile', 'My Profile', UserRound)}
        <div className="who">
          <div className="avatar">{initials(profile?.full_name || profile?.email)}</div>
          <div style={{ minWidth: 0 }}>
            <div className="name">{profile?.full_name || profile?.email}</div>
            <div className="role">{profile?.role}</div>
          </div>
          <button className="out icon" aria-label="Sign out" title="Sign out" onClick={signOut}><LogOut size={17} /></button>
        </div>
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  )
}
