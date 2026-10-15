import type { Option } from '../components/ui'
import type { Profile } from './types'

/** Owner picker options: real logins, plus names that already have records but no login yet. Values are "id:<uuid>" / "name:<text>". */
export function ownerOptions(staff: Profile[], names: string[]): Option[] {
  return [
    { value: '', label: 'Unassigned' },
    ...staff.map((s) => ({ value: 'id:' + s.id, label: s.full_name || s.email || '' })),
    ...[...new Set(names)].filter((n) => n && !staff.some((s) => s.full_name === n)).map((n) => ({ value: 'name:' + n, label: `${n} (no login yet)` })),
  ]
}
export const ownerValue = (o: { owner_id?: string | null; owner_name?: string | null }) => (o.owner_id ? 'id:' + o.owner_id : o.owner_name ? 'name:' + o.owner_name : '')
export function applyOwner<T extends { owner_id?: string | null; owner_name?: string | null }>(rec: T, v: string, staff: Profile[]): T {
  if (v.startsWith('id:')) return { ...rec, owner_id: v.slice(3), owner_name: staff.find((s) => s.id === v.slice(3))?.full_name ?? null }
  if (v.startsWith('name:')) return { ...rec, owner_id: null, owner_name: v.slice(5) }
  return { ...rec, owner_id: null, owner_name: null }
}
