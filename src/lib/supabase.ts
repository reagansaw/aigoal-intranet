import { createClient } from '@supabase/supabase-js'

// With VITE_USE_PROXY=1 the browser talks to <this site>/api/... (Vercel forwards it to Supabase, see vercel.json), so the network tab shows our own domain
const url = import.meta.env.VITE_USE_PROXY === '1' ? `${window.location.origin}/api` : import.meta.env.VITE_SUPABASE_URL || 'https://aaonpprtgitydcgptnlh.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const hasKey = Boolean(key)
export const supabase = createClient(url, key || 'missing-anon-key')
