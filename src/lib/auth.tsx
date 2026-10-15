import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Profile } from './types'

interface Ctx {
  session: Session | null
  profile: Profile | null
  loading: boolean
  isAdmin: boolean
  isHr: boolean
  isManager: boolean // admin or HR
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}
const AuthCtx = createContext<Ctx>(null!)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = async (s: Session | null) => {
    if (!s) { setProfile(null); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).single()
    setProfile(data as Profile | null)
    if (data) supabase.rpc('touch_seen').then(() => {})
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadProfile(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setTimeout(() => loadProfile(s), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const role = profile?.role
  return (
    <AuthCtx.Provider
      value={{
        session, profile, loading,
        isAdmin: role === 'admin',
        isHr: role === 'hr',
        isManager: role === 'admin' || role === 'hr',
        refresh: () => loadProfile(session),
        signOut: async () => { await supabase.auth.signOut() },
      }}
    >
      {children}
    </AuthCtx.Provider>
  )
}
