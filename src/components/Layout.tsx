import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Layout() {
  const { profile, isAdmin, isManager, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const link = (to: string, label: string) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => 'nav' + (isActive ? ' active' : '')} onClick={() => setOpen(false)}>
      {label}
    </NavLink>
  )
  return (
    <div className="shell">
      <button className="menu-btn" onClick={() => setOpen(!open)}>☰</button>
      <aside className={'side' + (open ? ' open' : '')}>
        <div className="brand">AIGOAL Intranet</div>
        {link('/', '🏠 Home')}
        {link('/todos', '✅ To-Do')}
        {link('/kpi', '📊 PDR / KPI')}
        {link('/accounts', '🧾 Purchase Accounts')}
        {link('/customers', '📞 Follow-Up Customers')}
        {link('/kb', '📚 Knowledge Base')}
        {link('/profile', '👤 My Profile')}
        {isManager && <div className="muted" style={{ padding: '.8rem .7rem .2rem' }}>MANAGE</div>}
        {isManager && link('/people', '👥 People')}
        {isAdmin && link('/kpi-templates', '🛠 KPI Templates')}
        <div className="who">
          <div><b>{profile?.full_name || profile?.email}</b></div>
          <div className="muted">{profile?.role?.toUpperCase()}</div>
          <button className="sm" style={{ marginTop: '.4rem' }} onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  )
}
