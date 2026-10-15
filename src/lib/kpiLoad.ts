import { supabase } from './supabase'
import { calcPayout, type KpiData, type Payout } from './kpi'
import type { KpiChecklistRow, KpiItem, KpiOrder, KpiReview, KpiScore, KpiTemplate, KpiWeekly } from './types'

export interface UserPayout { review: KpiReview; tpl: KpiTemplate; payout: Payout }

/** Every monthly scorecard of one person with its computed payout (used by Home and the overview table). */
export async function loadUserPayouts(userId: string): Promise<UserPayout[]> {
  const { data: rs } = await supabase.from('kpi_reviews').select('*').eq('user_id', userId).order('month')
  const reviews = (rs ?? []) as KpiReview[]
  if (!reviews.length) return []
  const ids = reviews.map((r) => r.id)
  const tplIds = [...new Set(reviews.map((r) => r.template_id))]
  const [t, it, sc, wk, cl, od] = await Promise.all([
    supabase.from('kpi_templates').select('*').in('id', tplIds),
    supabase.from('kpi_items').select('*').in('template_id', tplIds).order('sort'),
    supabase.from('kpi_scores').select('*').in('review_id', ids),
    supabase.from('kpi_weekly').select('*').in('review_id', ids).order('sort'),
    supabase.from('kpi_checklist').select('*').in('review_id', ids).order('sort'),
    supabase.from('kpi_orders').select('*').in('review_id', ids).order('sort'),
  ])
  return reviews.map((review) => {
    const tpl = (t.data as KpiTemplate[]).find((x) => x.id === review.template_id)!
    const items = (it.data as KpiItem[]).filter((i) => i.template_id === tpl.id)
    const scores: Record<string, Partial<KpiScore>> = {}
    ;(sc.data as KpiScore[]).filter((s) => s.review_id === review.id).forEach((s) => (scores[s.item_id] = s))
    const data: KpiData = {
      weekly: (wk.data as KpiWeekly[]).filter((x) => x.review_id === review.id),
      checklist: (cl.data as KpiChecklistRow[]).filter((x) => x.review_id === review.id),
      orders: (od.data as KpiOrder[]).filter((x) => x.review_id === review.id),
    }
    return { review, tpl, payout: calcPayout(tpl, items, scores, review, data) }
  })
}
