import { useState, type FormEvent } from 'react'
import { BarChart3, BookOpen, ListChecks, LogIn } from 'lucide-react'
import { asset } from '../lib/asset'
import { hasKey, supabase } from '../lib/supabase'
import { Alert, PasswordInput } from '../components/ui'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setErr(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message)
    setBusy(false)
  }

  return (
    <div className="auth">
      <div className="auth-art">
        <img src={asset('logo-full.png')} alt="AIGOAL" className="auth-logo" />
        <div>
          <h2>Everything your team needs, in one place.</h2>
          <p>Daily tasks, monthly performance reviews, customer follow-ups and company know-how.</p>
          <ul>
            <li><ListChecks size={18} />Daily and monthly to-do planning</li>
            <li><BarChart3 size={18} />Transparent PDR scorecards and payouts</li>
            <li><BookOpen size={18} />Scripts, links and onboarding guides</li>
          </ul>
        </div>
        <span style={{ color: '#a5b4fc', fontSize: '.85rem' }}>Internal use only</span>
      </div>
      <div className="auth-form">
        <form onSubmit={submit}>
          <img src={asset('logo-mark.png')} alt="AIGOAL" className="auth-mark" width={56} height={56} />
          <h1>Sign in</h1>
          <p className="muted" style={{ marginBottom: '1.5rem' }}>Use your company email and password.</p>
          {!hasKey && <Alert text="VITE_SUPABASE_ANON_KEY is not set. See README." />}
          <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="username" /></div>
          <div className="field"><label>Password</label><PasswordInput value={password} onChange={setPassword} required autoComplete="current-password" /></div>
          <Alert text={err} />
          <button className="primary block" disabled={busy}><LogIn size={16} />{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="muted sm-text" style={{ marginTop: '1rem' }}>Forgot your password? Ask Admin or HR to reset it.</p>
        </form>
      </div>
    </div>
  )
}
