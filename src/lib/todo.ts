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

export function tally(list: Pick<Todo, 'done' | 'due_date' | 'created_at' | 'done_at' | 'delayed_days'>[]) {
  let done = 0, missed = 0, open = 0, delayed = 0, delayedDays = 0, points = 0
  list.forEach((t) => {
    const o = outcomeOf(t)
    if (t.delayed_days > 0) { delayed++; delayedDays += t.delayed_days }
    if (o === 'done') { done++; points += t.delayed_days > 0 ? 0.5 : 1 }   // a delayed task earns only half a mark
    else if (o === 'missed') missed++
    else open++
  })
  // mark = points ÷ total to-do: done on time = 1, done after a delay = 0.5, not done = 0
  return { done, missed, open, delayed, delayedDays, total: list.length, score: list.length ? Math.round((points / list.length) * 100) : null as number | null }
}
