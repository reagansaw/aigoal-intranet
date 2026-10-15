import { ShieldAlert } from 'lucide-react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import ForcePassword from './pages/ForcePassword'
import Home from './pages/Home'
import Profile from './pages/Profile'
import Todos from './pages/Todos'
import Kpi from './pages/Kpi'
import KpiTemplates from './pages/KpiTemplates'
import Accounts from './pages/Accounts'
import Customers from './pages/Customers'
import KnowledgeBase from './pages/KnowledgeBase'
import People from './pages/People'

export default function App() {
  const { session, profile, loading, isAdmin, isManager, signOut } = useAuth()
  if (loading) return <div className="center muted">Loading…</div>
  if (!session) return <Login />
  if (!profile || !profile.active)
    return (
      <div className="center">
        <div className="login">
          <div className="card">
            <ShieldAlert size={36} style={{ color: 'var(--warn)' }} />
            <h1 style={{ margin: '.6rem 0' }}>No access</h1>
            <p className="muted">Your account is inactive or has no profile. Please contact Admin or HR.</p>
            <button onClick={signOut}>Sign out</button>
          </div>
        </div>
      </div>
    )
  if (profile.must_change_password) return <ForcePassword />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="profile" element={<Profile />} />
        <Route path="todos" element={<Todos />} />
        <Route path="kpi" element={<Kpi />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="customers" element={<Customers />} />
        <Route path="kb" element={<KnowledgeBase />} />
        {isManager && <Route path="people" element={<People />} />}
        {isAdmin && <Route path="kpi-templates" element={<KpiTemplates />} />}
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
  )
}
