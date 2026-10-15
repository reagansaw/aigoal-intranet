import { useState, type FormEvent } from 'react'
import { KeyRound, LogOut, ShieldCheck } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { Alert, PasswordInput } from '../components/ui'

/** Shown instead of the app until a new / reset user has chosen their own password. */
export default function ForcePassword() {
  const { profile, refresh, signOut } = useAuth()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (pw.length < 8) return setErr('Use at least 8 characters.')
    if (pw !== pw2) return setErr('The two passwords do not match.')
    setBusy(true); setErr('')
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) { setBusy(false); return setErr(error.message.includes('different') ? 'Choose a password different from the temporary one.' : error.message) }
    const { error: e2 } = await supabase.rpc('password_changed')
    if (e2) { setBusy(false); return setErr(e2.message) }
    await refresh()
  }

  return (
    <div className="center">
      <form className="login card" onSubmit={submit} style={{ textAlign: 'left' }}>
        <div className="stat-ico" style={{ marginBottom: '.9rem' }}><ShieldCheck size={22} /></div>
        <h1>Set your new password</h1>
        <p className="muted" style={{ margin: '.4rem 0 1.4rem' }}>
          Welcome{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}. For security, please replace the temporary password you were given with one only you know.
        </p>
        <div className="field"><label>New password</label><PasswordInput autoFocus autoComplete="new-password" placeholder="At least 8 characters" value={pw} onChange={setPw} /></div>
        <div className="field"><label>Confirm new password</label><PasswordInput autoComplete="new-password" value={pw2} onChange={setPw2} /></div>
        <Alert text={err} />
        <button className="primary block" disabled={busy}><KeyRound size={16} />{busy ? 'Saving…' : 'Save and continue'}</button>
        <button type="button" className="ghost block" style={{ marginTop: '.5rem' }} onClick={signOut}><LogOut size={16} />Sign out</button>
      </form>
    </div>
  )
}
