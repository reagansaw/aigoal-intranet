import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Profile } from './types'

export function useStaff() {
  const [staff, setStaff] = useState<Profile[]>([])
  useEffect(() => {
    supabase.from('profiles').select('*').eq('active', true).order('full_name').then(({ data }) => setStaff((data ?? []) as Profile[]))
  }, [])
  return staff
}
