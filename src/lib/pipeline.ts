import type { OnboardingSession, PurchaseAccount } from './types'

export type StepKey = 'o1' | 'dev' | 'devdone' | 'o2' | 'o3'
export type StageKey = StepKey | 'complete' | 'frozen'
export interface Step { key: StepKey; label: string; state: 'done' | 'active' | 'pending'; sub?: string }
export interface Pipeline { steps: Step[]; stage: StageKey; stageLabel: string; stageSub?: string; o1Done: boolean; started: boolean; finished: boolean; realLabel: string }

const KL = 'Asia/Kuala_Lumpur'
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: KL })
export const dayTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: KL })

/**
 * Onboarding 1 > Develop > Develop Done > Onboarding 2 > Onboarding 3.
 * Onboarding rounds come from the AIGOAL calendar (or an older hand-typed sheet date); Develop / Develop Done are button clicks.
 * If Onboarding 2 already happened, the develop steps are treated as finished (older accounts).
 */
export function buildPipeline(a: PurchaseAccount, sessions: OnboardingSession[]): Pipeline {
  const latest = (round: number) => sessions.filter((s) => s.account_id === a.id && s.round === round && s.status !== 'cancelled').sort((x, y) => y.start_at.localeCompare(x.start_at))[0]
  const legacy = { 1: a.coaching_1, 2: a.coaching_2, 3: a.final_coaching } as Record<number, string | null>
  const round = (n: 1 | 2 | 3) => {
    const s = latest(n)
    if (s?.status === 'completed') return { done: true, sub: day(s.start_at) }
    if (s) return { done: false, sub: `Booked ${dayTime(s.start_at)}` }
    if (legacy[n]) return { done: true, sub: String(legacy[n]) }
    return { done: false, sub: 'Not booked' }
  }
  const r1 = round(1), r2 = round(2), r3 = round(3)
  // Older accounts have no button clicks: use the sheet's build records (chatbot / landing page / optimised) as develop progress.
  const builtBefore = !!(a.chatbot_done || a.landing_page_done || a.optimised || a.docs_provided)
  const builtDone = !!(a.optimised || (a.chatbot_done && a.landing_page_done))
  const started = !!a.develop_started_at || r2.done || builtBefore
  const devDone = !!a.develop_done_at || r2.done || builtDone
  const raw: [StepKey, string, boolean, string | undefined][] = [
    ['o1', 'Onboarding 1', r1.done, r1.sub],
    ['dev', 'Develop', started, a.develop_started_at ? dayTime(a.develop_started_at) : started ? 'From sheet' : undefined],
    ['devdone', 'Develop Done', devDone, a.develop_done_at ? dayTime(a.develop_done_at) : devDone ? 'From sheet' : undefined],
    ['o2', 'Onboarding 2', r2.done, r2.sub],
    ['o3', 'Onboarding 3', r3.done, r3.sub],
  ]
  let activeFound = false
  const steps: Step[] = raw.map(([key, label, done, sub]) => {
    if (done) return { key, label, state: 'done', sub }
    if (!activeFound) { activeFound = true; return { key, label, state: 'active', sub } }
    return { key, label, state: 'pending' }
  })
  const active = steps.find((s) => s.state === 'active')
  const stage: StageKey = a.frozen ? 'frozen' : active ? active.key : 'complete'
  const realStage: StageKey = active ? active.key : 'complete'
  const realLabel = { o1: 'Onboarding 1', dev: 'Ready to develop', devdone: 'Developing', o2: 'Onboarding 2', o3: 'Onboarding 3', complete: 'Completed', frozen: 'Frozen' }[realStage]
  const stageLabel = { o1: 'Onboarding 1', dev: 'Ready to develop', devdone: 'Developing', o2: 'Onboarding 2', o3: 'Onboarding 3', complete: 'Completed', frozen: 'Frozen' }[stage]
  return { steps, stage, stageLabel, stageSub: stage === 'frozen' ? a.frozen_reason ?? undefined : stage === 'o1' || stage === 'o2' || stage === 'o3' ? active?.sub : stage === 'devdone' && a.develop_started_at ? `since ${day(a.develop_started_at)}` : undefined, o1Done: r1.done, started, finished: !active, realLabel }
}
