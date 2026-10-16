import type { Todo } from './types'
import { addDays, today } from './util'

const KL = 'Asia/Kuala_Lumpur'
export const klDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: KL })
/** Monday of the week that contains `day` (YYYY-MM-DD). */
export const weekStart = (day: string) => { const d = new Date(day + 'T12:00:00'); const dow = (d.getDay() + 6) % 7; return addDays(day, -dow) }

export type Outcome = 'done' | 'open' | 'missed'
/**
 * done   = ticked in time
 * missed = not done: past its due day and unticked, OR a task created and due on the same day that was not ticked by the end of that day
 *          (ticking it the next day does not turn it into "done")
 * open   = still has time (due today or later, or no day yet)
 */
export function outcomeOf(t: Pick<Todo, 'done' | 'due_date' | 'created_at' | 'done_at'>): Outcome {
  const created = t.created_at ? klDay(t.created_at) : null
  if (t.done) {
    const doneDay = t.done_at ? klDay(t.done_at) : null
    if (t.due_date && created === t.due_date && doneDay && doneDay > t.due_date) return 'missed'
    return 'done'
  }
  if (t.due_date && t.due_date < today()) return 'missed'
  return 'open'
}
export const isLate = (t: Pick<Todo, 'done' | 'due_date' | 'created_at' | 'done_at'>) => outcomeOf(t) === 'done' && !!t.due_date && !!t.done_at && klDay(t.done_at) > t.due_date

export function tally(list: Pick<Todo, 'done' | 'due_date' | 'created_at' | 'done_at'>[]) {
  let done = 0, missed = 0, open = 0
  list.forEach((t) => { const o = outcomeOf(t); if (o === 'done') done++; else if (o === 'missed') missed++; else open++ })
  // mark = done out of ALL the to-dos in the period (5 done of 10 = 50%)
  return { done, missed, open, total: list.length, score: list.length ? Math.round((done / list.length) * 100) : null as number | null }
}
