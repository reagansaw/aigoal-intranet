import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || 'https://aaonpprtgitydcgptnlh.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const hasKey = Boolean(key)
export const supabase = createClient(url, key || 'missing-anon-key')
