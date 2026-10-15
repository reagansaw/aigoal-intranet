import type { Band, KpiChecklistRow, KpiItem, KpiOrder, KpiReview, KpiScore, KpiTemplate, KpiWeekly } from './types'

/** Points from a figure using the row's bands (higher = bigger is better, lower = smaller is better). */
export function autoScore(item: Pick<KpiItem, 'direction' | 'bands' | 'pct_of_target' | 'target'>, actual: number | null | undefined, target?: number | null): number | null {
  if (item.direction === 'manual' || actual == null || Number.isNaN(actual)) return null
  const bands: Band[] = item.bands ?? []
  if (!bands.length) return null
  const tgt = target ?? item.target
  const value = item.pct_of_target ? (tgt ? (actual / Number(tgt)) * 100 : null) : actual
  if (value == null) return 0
  if (item.direction === 'higher') {
    const hit = [...bands].sort((a, b) => b.threshold - a.threshold).find((b) => value >= b.threshold)
    return hit ? hit.points : 0
  }
  const hit = [...bands].sort((a, b) => a.threshold - b.threshold).find((b) => value <= b.threshold)
  return hit ? hit.points : 0
}

export interface KpiData { weekly: KpiWeekly[]; checklist: KpiChecklistRow[]; orders: KpiOrder[] }
export interface RowResult { actual: number | null; target: number | null; score: number; auto: boolean; display: string; pct: number | null }
export interface BonusLine { label: string; ok: boolean; amount: number; why: string }
export interface Payout {
  rows: Record<string, RowResult>
  baseScore: number; maxScore: number
  baseBonus: number; qualified: boolean
  bonusLines: BonusLine[]; overBonus: number
  total: number
  orders: { id: string; seq: number | null; commission: number }[]
  commission: number; grand: number
  sums: { attendance: number; attendanceTarget: number; leadmagnet: number; adSpend: number; adBudget: number; leads: number; cpl: number | null }
}

const sum = (xs: (number | null | undefined)[]) => xs.reduce<number>((t, x) => t + (Number(x) || 0), 0)

/** Mirrors the Winson KPI sheet: weekly raw data -> row scores -> base bonus, over-achievement bonus and commission. */
export function calcPayout(
  tpl: KpiTemplate, items: KpiItem[], scores: Record<string, Partial<KpiScore>>, _review: Pick<KpiReview, 'id'> | null, data: KpiData,
): Payout {
  const w = data.weekly
  const sums = {
    attendance: sum(w.map((x) => x.attendance_actual)), attendanceTarget: sum(w.map((x) => x.attendance_target)),
    leadmagnet: sum(w.map((x) => x.leadmagnet_actual)), adSpend: sum(w.map((x) => x.ad_spend)),
    adBudget: sum(w.map((x) => x.ad_budget)), leads: sum(w.map((x) => x.leads_total)), cpl: null as number | null,
  }
  sums.cpl = sums.leads > 0 ? sums.adSpend / sums.leads : null
  const applicable = data.checklist.filter((c) => c.status !== '不适用')
  const doneCount = data.checklist.filter((c) => c.status === '完成').length

  const rows: Record<string, RowResult> = {}
  for (const it of items) {
    const manual = scores[it.id]
    let actual: number | null = manual?.actual ?? null
    let target: number | null = it.target != null ? Number(it.target) : null
    let auto: number | null = null
    let display = ''
    if (it.source === 'attendance') {
      actual = sums.attendance; target = sums.attendanceTarget > 0 ? sums.attendanceTarget : target
      auto = sums.attendanceTarget > 0 ? autoScore(it, actual, target) ?? 0 : 0
    } else if (it.source === 'leadmagnet') {
      actual = sums.leadmagnet; auto = autoScore(it, actual, target) ?? 0
    } else if (it.source === 'cpl') {
      actual = sums.cpl; auto = actual == null ? 0 : autoScore(it, actual, target) ?? 0
    } else if (it.source === 'checklist') {
      actual = doneCount; display = `${doneCount} / ${applicable.length}`
      auto = applicable.length > 0 && doneCount === applicable.length ? Number(it.max_points) : 0
    } else {
      auto = autoScore(it, actual, target)
    }
    const raw = manual?.score != null ? Number(manual.score) : auto ?? 0
    const score = Math.min(Math.max(raw, 0), Number(it.max_points))
    const pct = actual != null && target ? (Number(actual) / Number(target)) * 100 : null
    rows[it.id] = { actual, target, score, auto: it.source !== 'manual', display, pct }
  }

  const baseScore = Object.values(rows).reduce((t, r) => t + r.score, 0)
  const maxScore = items.reduce((t, i) => t + Number(i.max_points), 0)
  let baseBonus = baseScore * Number(tpl.rate_per_point)
  if (tpl.max_base_bonus != null) baseBonus = Math.min(baseBonus, Number(tpl.max_base_bonus))
  const qualified = baseScore >= Number(tpl.qualify_score)

  const bonusLines: BonusLine[] = items.filter((i) => i.bonus_threshold_pct != null).map((it) => {
    const r = rows[it.id]
    const needBudget = it.bonus_needs_budget
    const pct = r.pct
    const meets = pct != null && pct >= Number(it.bonus_threshold_pct)
    const withinBudget = !needBudget || sums.adSpend <= sums.adBudget
    const ok = qualified && meets && withinBudget
    return {
      label: `${it.name} ≥ ${it.bonus_threshold_pct}%${needBudget ? ' 且广告未超预算' : ''}`, ok, amount: ok ? Number(it.bonus_amount ?? 0) : 0,
      why: !qualified ? `Base score below ${tpl.qualify_score}` : !meets ? `${pct == null ? '—' : pct.toFixed(0) + '%'} of target` : !withinBudget ? 'Ad spend is over budget' : 'Qualified',
    }
  })
  let overBonus = bonusLines.reduce((t, b) => t + b.amount, 0)
  if (tpl.max_over_bonus != null) overBonus = Math.min(overBonus, Number(tpl.max_over_bonus))
  const total = Number(tpl.base_fee) + baseBonus + overBonus

  // Commission (附件C): count 是 orders in order; from order #(free+1) onward earn rate × net received
  let seq = 0
  const orders = [...data.orders].sort((a, b) => a.sort - b.sort).map((o) => {
    if (!o.is_commission_order) return { id: o.id, seq: null, commission: 0 }
    seq++
    return { id: o.id, seq, commission: seq > Number(tpl.commission_free_deals) ? Number(o.net_received || 0) * Number(tpl.commission_rate) : 0 }
  })
  const commission = orders.reduce((t, o) => t + o.commission, 0)
  return { rows, baseScore, maxScore, baseBonus, qualified, bonusLines, overBonus, total, orders, commission, grand: total + commission, sums }
}
