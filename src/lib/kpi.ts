import type { Band, KpiItem, KpiReview, KpiScore, KpiTemplate } from './types'

/** Points an item earns automatically from the actual figure, or null if it needs a manual score. */
export function autoScore(item: KpiItem, actual: number | null | undefined): number | null {
  if (item.direction === 'manual' || actual == null || Number.isNaN(actual)) return null
  const bands: Band[] = item.bands ?? []
  if (!bands.length) return null
  const value = item.pct_of_target && item.target ? (actual / item.target) * 100 : actual
  if (item.direction === 'higher') {
    const hit = [...bands].sort((a, b) => b.threshold - a.threshold).find((b) => value >= b.threshold)
    return hit ? hit.points : 0
  }
  const hit = [...bands].sort((a, b) => a.threshold - b.threshold).find((b) => value <= b.threshold)
  return hit ? hit.points : 0
}

/** Final score: manual override wins, otherwise auto, capped at max points. */
export function itemScore(item: KpiItem, s?: Partial<KpiScore>): number {
  const raw = s?.score != null ? Number(s.score) : autoScore(item, s?.actual) ?? 0
  return Math.min(Math.max(raw, 0), Number(item.max_points))
}

export function achievement(item: KpiItem, actual: number | null | undefined): number | null {
  if (actual == null || !item.target) return null
  return (Number(actual) / Number(item.target)) * 100
}

export interface Payout {
  baseScore: number
  baseBonus: number
  qualified: boolean
  overBonus: number
  total: number
  commission: number
  grand: number
}

export function calcPayout(
  tpl: KpiTemplate,
  items: KpiItem[],
  scores: Record<string, Partial<KpiScore>>,
  review: Pick<KpiReview, 'deals_count' | 'net_collected'>,
): Payout {
  const baseScore = items.reduce((sum, it) => sum + itemScore(it, scores[it.id]), 0)
  let baseBonus = baseScore * Number(tpl.rate_per_point)
  if (tpl.max_base_bonus != null) baseBonus = Math.min(baseBonus, Number(tpl.max_base_bonus))
  const qualified = baseScore >= Number(tpl.qualify_score)
  const overBonus = qualified
    ? items.reduce((sum, it) => {
        const a = achievement(it, scores[it.id]?.actual)
        return it.bonus_threshold_pct != null && a != null && a >= Number(it.bonus_threshold_pct)
          ? sum + Number(it.bonus_amount ?? 0)
          : sum
      }, 0)
    : 0
  const total = Number(tpl.base_fee) + baseBonus + overBonus
  // Commission: deals beyond the free quota earn rate × net collected, pro-rated per deal
  const paying = Math.max(review.deals_count - tpl.commission_free_deals, 0)
  const commission =
    review.deals_count > 0 ? (Number(review.net_collected) * paying * Number(tpl.commission_rate)) / review.deals_count : 0
  return { baseScore, baseBonus, qualified, overBonus, total, commission, grand: total + commission }
}
