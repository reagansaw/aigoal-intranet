import { useEffect, useMemo, useState } from 'react'
import { BadgeDollarSign, Banknote, ChevronLeft, ChevronRight, Coins, Lock, LockOpen, Plus, Save, Target, Trash2, TrendingUp, Wallet, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useStaff } from '../lib/useStaff'
import { calcPayout } from '../lib/kpi'
import { loadUserPayouts, type UserPayout } from '../lib/kpiLoad'
import { addMonths, iso, money, monthLabel, monthStart } from '../lib/util'
import { DatePicker, Empty, Msg, NumberInput, PageHeader, Select, Stat } from '../components/ui'
import type { KpiChecklistRow, KpiItem, KpiOrder, KpiReview, KpiScore, KpiTemplate, KpiWeekly } from '../lib/types'

type ScoreMap = Record<string, Partial<KpiScore>>
const tmp = () => 'new-' + Math.random().toString(36).slice(2)
const isNew = (id: string) => id.startsWith('new-')
const STATUS = [{ value: '', label: '—' }, { value: '完成', label: '完成 · Done' }, { value: '未完成', label: '未完成 · Not done' }, { value: '不适用', label: '不适用 · N/A' }]
const YESNO = [{ value: 'no', label: '否' }, { value: 'yes', label: '是' }]
const WEEK_ROWS: { k: keyof KpiWeekly; label: string; money?: boolean }[] = [
  { k: 'ad_budget', label: '广告预算 (RM)', money: true },
  { k: 'attendance_target', label: '有效出席目标（人）' },
  { k: 'leadmagnet_target', label: 'Lead Magnet 目标（人）' },
  { k: 'attendance_actual', label: '实际有效出席人数' },
  { k: 'leadmagnet_actual', label: '实际自然流量 Lead Magnet 有效领取人数' },
  { k: 'ad_spend', label: '纳入考核的广告实际花费 (RM)', money: true },
  { k: 'leads_total', label: '广告有效 Lead 总数（去重）' },
]
const wednesdays = (month: string) => {
  const d = new Date(month + 'T00:00:00'); const out: string[] = []
  for (let x = new Date(d.getFullYear(), d.getMonth(), 1); x.getMonth() === d.getMonth(); x.setDate(x.getDate() + 1)) if (x.getDay() === 3) out.push(iso(x))
  return out
}

export default function Kpi() {
  const { profile, isManager } = useAuth()
  const staff = useStaff()
  const [uid, setUid] = useState(profile!.id)
  const [month, setMonth] = useState(monthStart(new Date()))
  const [templates, setTemplates] = useState<KpiTemplate[]>([])
  const [review, setReview] = useState<KpiReview | null>(null)
  const [items, setItems] = useState<KpiItem[]>([])
  const [scores, setScores] = useState<ScoreMap>({})
  const [weekly, setWeekly] = useState<KpiWeekly[]>([])
  const [checklist, setChecklist] = useState<KpiChecklistRow[]>([])
  const [orders, setOrders] = useState<KpiOrder[]>([])
  const [tplId, setTplId] = useState('')
  const [msg, setMsg] = useState('')
  const [history, setHistory] = useState<UserPayout[]>([])

  const tpl = templates.find((t) => t.id === review?.template_id)
  const editable = isManager && !review?.locked
  const person = staff.find((s) => s.id === uid)

  useEffect(() => {
    supabase.from('kpi_templates').select('*').eq('active', true).order('name').then(({ data }) => {
      setTemplates((data ?? []) as KpiTemplate[]); if (data?.length) setTplId(data[0].id)
    })
  }, [])

  const load = async () => {
    setMsg('')
    const { data: r } = await supabase.from('kpi_reviews').select('*').eq('user_id', uid).eq('month', month).maybeSingle()
    setReview((r as KpiReview) ?? null)
    if (!r) { setItems([]); setScores({}); setWeekly([]); setChecklist([]); setOrders([]); return }
    const [it, sc, wk, cl, od] = await Promise.all([
      supabase.from('kpi_items').select('*').eq('template_id', r.template_id).order('sort'),
      supabase.from('kpi_scores').select('*').eq('review_id', r.id),
      supabase.from('kpi_weekly').select('*').eq('review_id', r.id).order('sort'),
      supabase.from('kpi_checklist').select('*').eq('review_id', r.id).order('sort'),
      supabase.from('kpi_orders').select('*').eq('review_id', r.id).order('sort'),
    ])
    setItems((it.data ?? []) as KpiItem[])
    const m: ScoreMap = {}; ;(sc.data ?? []).forEach((s: KpiScore) => (m[s.item_id] = s)); setScores(m)
    setWeekly((wk.data ?? []) as KpiWeekly[]); setChecklist((cl.data ?? []) as KpiChecklistRow[]); setOrders((od.data ?? []) as KpiOrder[])
  }
  const loadHistory = () => loadUserPayouts(uid).then(setHistory)
  useEffect(() => { load() }, [uid, month])
  useEffect(() => { loadHistory() }, [uid])

  const payout = useMemo(() => (tpl && review ? calcPayout(tpl, items, scores, review, { weekly, checklist, orders }) : null), [tpl, review, items, scores, weekly, checklist, orders])

  const create = async () => {
    const t = templates.find((x) => x.id === tplId); if (!t) return
    const days = new Date(new Date(month + 'T00:00:00').getFullYear(), new Date(month + 'T00:00:00').getMonth() + 1, 0).getDate()
    const labels = t.daily_tasks?.length ? t.daily_tasks : Array(17).fill('')
    const { data: r, error } = await supabase.from('kpi_reviews').insert({
      user_id: uid, template_id: t.id, month,
      indicators: (t.indicators ?? []).map((i) => ({ indicator: i, reason: '', improvement: '' })),
      daily: labels.map((label) => ({ label, days: Array(days).fill(false) })),
    }).select('id').single()
    if (error) return setMsg(error.message)
    await supabase.from('kpi_weekly').insert(wednesdays(month).map((d, i) => ({ review_id: r.id, sort: i, week_date: d })))
    if (t.checklist?.length) await supabase.from('kpi_checklist').insert(t.checklist.map((c, i) => ({ review_id: r.id, sort: i, item: c.item, requirement: c.requirement, evidence: c.evidence })))
    await load(); loadHistory()
  }

  const save = async () => {
    if (!review) return
    const rid = review.id
    const e0 = (await supabase.from('kpi_reviews').update({ locked: review.locked, extra_note: review.extra_note, indicators: review.indicators, daily: review.daily }).eq('id', rid)).error
    const manualRows = items.filter((i) => i.source === 'manual').map((it) => ({ review_id: rid, item_id: it.id, actual: scores[it.id]?.actual ?? null, score: scores[it.id]?.score ?? null, reason: scores[it.id]?.reason ?? null, improvement: scores[it.id]?.improvement ?? null }))
    const e1 = manualRows.length ? (await supabase.from('kpi_scores').upsert(manualRows)).error : null
    await Promise.all([supabase.from('kpi_weekly').delete().eq('review_id', rid), supabase.from('kpi_checklist').delete().eq('review_id', rid), supabase.from('kpi_orders').delete().eq('review_id', rid)])
    const e2 = weekly.length ? (await supabase.from('kpi_weekly').insert(weekly.map(({ id, ...w }, i) => ({ ...w, review_id: rid, sort: i })))).error : null
    const e3 = checklist.length ? (await supabase.from('kpi_checklist').insert(checklist.map(({ id, ...c }, i) => ({ ...c, review_id: rid, sort: i })))).error : null
    const e4 = orders.length ? (await supabase.from('kpi_orders').insert(orders.map(({ id, ...o }, i) => ({ ...o, review_id: rid, sort: i, net_received: o.net_received || 0 })))).error : null
    const err = e0 || e1 || e2 || e3 || e4
    setMsg(err ? err.message : 'Saved ✓')
    if (!err) { await load(); loadHistory() }
  }
  const del = async () => { if (review && confirm("Delete this month's scorecard?")) { await supabase.from('kpi_reviews').delete().eq('id', review.id); await load(); loadHistory() } }
  const setLock = async (locked: boolean) => { if (!review) return; setReview({ ...review, locked }); await supabase.from('kpi_reviews').update({ locked }).eq('id', review.id) }

  const patchScore = (id: string, p: Partial<KpiScore>) => setScores({ ...scores, [id]: { ...scores[id], ...p } })
  const patchWeek = (id: string, p: Partial<KpiWeekly>) => setWeekly(weekly.map((w) => (w.id === id ? { ...w, ...p } : w)))
  const patchCheck = (id: string, p: Partial<KpiChecklistRow>) => setChecklist(checklist.map((c) => (c.id === id ? { ...c, ...p } : c)))
  const patchOrder = (id: string, p: Partial<KpiOrder>) => setOrders(orders.map((o) => (o.id === id ? { ...o, ...p } : o)))
  const cur = tpl?.currency ?? 'RM'
  const daysInMonth = new Date(new Date(month + 'T00:00:00').getFullYear(), new Date(month + 'T00:00:00').getMonth() + 1, 0).getDate()

  // overview (总览): every month of the cooperation period
  const overviewMonths = useMemo(() => {
    const set = new Set(history.map((h) => h.review.month))
    if (person?.start_date) {
      const end = person.end_date ? monthStart(person.end_date) : addMonths(monthStart(person.start_date), 11)
      for (let m = monthStart(person.start_date); m <= end && set.size < 36; m = addMonths(m, 1)) set.add(m)
    }
    return [...set].sort()
  }, [history, person])
  const hist = (m: string) => history.find((h) => h.review.month === m)
  const have = overviewMonths.map(hist).filter(Boolean) as UserPayout[]
  const th = (t: string, num = false) => <th className={num ? 'num' : ''}>{t}</th>

  return (
    <>
      <PageHeader title="PDR / KPI" sub={person?.start_date ? `AIGOAL 合作期 ${monthLabel(monthStart(person.start_date))}${person.end_date ? ` – ${monthLabel(monthStart(person.end_date))}` : ''}` : 'Monthly performance review and payout.'}>
        {isManager && <Select value={uid} onChange={setUid} options={staff.map((s) => ({ value: s.id, label: s.full_name || s.email || '' }))} />}
      </PageHeader>

      <div className="row between" style={{ marginBottom: '1rem' }}>
        <div className="date-nav">
          <button className="icon" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft size={17} /></button>
          <b>{monthLabel(month)}</b>
          <button className="icon" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={17} /></button>
        </div>
        {review?.locked && <span className="tag good"><Lock size={13} />Finalised</span>}
      </div>

      {!review && (
        <div className="card">
          <Empty icon={Target} title={`No scorecard for ${monthLabel(month)}`}>{isManager ? 'Pick a template to start this month.' : 'HR / Admin will set this up.'}</Empty>
          {isManager && (
            <div className="row" style={{ justifyContent: 'center' }}>
              <Select value={tplId} onChange={setTplId} options={templates.map((t) => ({ value: t.id, label: t.name }))} />
              <button className="primary" onClick={create} disabled={!tplId}>Create scorecard</button>
            </div>
          )}
          <div style={{ textAlign: 'center', marginTop: '.6rem' }}><Msg text={msg} /></div>
        </div>
      )}

      {review && tpl && payout && (
        <>
          {/* header summary */}
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <Stat icon={Banknote} label="固定服务费" value={money(Number(tpl.base_fee), cur)} />
            <Stat icon={Coins} tone="green" label="基础绩效奖金" value={money(payout.baseBonus, cur)} />
            <Stat icon={TrendingUp} tone="orange" label="营销超额奖励" value={money(payout.overBonus, cur)} />
            <Stat icon={Wallet} tone="gray" label="总计（不含佣金）" value={money(payout.total, cur)} />
            <Stat icon={BadgeDollarSign} tone="yellow" label="销售佣金（另计）" value={money(payout.commission, cur)} />
            <Stat icon={BadgeDollarSign} tone="red" label="含佣金总收入" value={money(payout.grand, cur)} />
          </div>

          {/* A. scorecard */}
          <div className="card flush table-wrap">
            <div className="card-head" style={{ padding: '1rem 1.25rem 0' }}>
              <h2>{person?.full_name} ｜ {tpl.name}（基础满分 {payout.maxScore} 分，每分 {cur}{tpl.rate_per_point}，最高 {cur}{Number(tpl.max_base_bonus ?? 0).toLocaleString()}）</h2>
            </div>
            <table>
              <thead><tr>{th('#')}{th('岗位责任')}{th('标准')}{th('分数', true)}{th('得分', true)}{th('实际数据')}{th('达成率 / 目标')}</tr></thead>
              <tbody>
                {items.map((it, i) => {
                  const r = payout.rows[it.id]
                  const status = it.source === 'checklist' ? (r.display && payout.rows[it.id].score === Number(it.max_points) ? '全部完成' : '未全部完成') : null
                  return (
                    <tr key={it.id}>
                      <td>{i + 1}</td>
                      <td style={{ minWidth: 200 }}><b>{it.name}</b>{it.note && <div className="muted sm-text">{it.note}</div>}</td>
                      <td className="muted pre sm-text" style={{ minWidth: 230 }}>{it.standard}</td>
                      <td className="num">{it.max_points}</td>
                      <td className="num" style={{ minWidth: 90 }}>
                        {it.source === 'manual' && editable ? <NumberInput value={scores[it.id]?.score} placeholder="0" onChange={(n) => patchScore(it.id, { score: n })} /> : <b>{r.score}</b>}
                      </td>
                      <td style={{ minWidth: 110 }}>
                        {it.source === 'manual' ? (editable ? <NumberInput value={scores[it.id]?.actual} onChange={(n) => patchScore(it.id, { actual: n })} /> : r.actual ?? '—')
                          : it.source === 'checklist' ? r.display
                          : it.source === 'cpl' ? (r.actual == null ? '—' : money(r.actual, cur)) : r.actual ?? '—'}
                      </td>
                      <td className="nowrap">{status ?? (r.pct != null ? `${r.pct.toFixed(0)}%` : it.source === 'cpl' ? `目标 ≤ ${cur}${it.target}` : it.source === 'manual' && it.target ? `目标 ${it.target}` : '—')}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot><tr><th></th><th>Achievement</th><th></th><th className="num">{payout.maxScore}</th><th className="num">{payout.baseScore}</th><th colSpan={2}></th></tr></tfoot>
            </table>
          </div>

          {/* B. review indicators */}
          <div className="card flush table-wrap">
            <div className="card-head" style={{ padding: '1rem 1.25rem 0' }}><h2>审核指标</h2></div>
            <table>
              <thead><tr>{th('审核指标')}{th('得分原因')}{th('如何改进')}<th style={{ width: 40 }}></th></tr></thead>
              <tbody>
                {review.indicators.map((x, i) => (
                  <tr key={i}>
                    <td style={{ minWidth: 240 }}>{editable ? <input value={x.indicator} onChange={(e) => setReview({ ...review, indicators: review.indicators.map((y, j) => (j === i ? { ...y, indicator: e.target.value } : y)) })} /> : `${i + 1}. ${x.indicator}`}</td>
                    <td>{editable ? <input value={x.reason} onChange={(e) => setReview({ ...review, indicators: review.indicators.map((y, j) => (j === i ? { ...y, reason: e.target.value } : y)) })} /> : x.reason}</td>
                    <td>{editable ? <input value={x.improvement} onChange={(e) => setReview({ ...review, indicators: review.indicators.map((y, j) => (j === i ? { ...y, improvement: e.target.value } : y)) })} /> : x.improvement}</td>
                    <td>{editable && <button className="ghost icon sm danger" aria-label="Remove" onClick={() => setReview({ ...review, indicators: review.indicators.filter((_, j) => j !== i) })}><X size={14} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {editable && <div style={{ padding: '.7rem 1.25rem' }}><button className="sm" onClick={() => setReview({ ...review, indicators: [...review.indicators, { indicator: '', reason: '', improvement: '' }] })}><Plus size={14} />Add indicator</button></div>}
          </div>

          {/* C. over-achievement bonus */}
          <div className="card flush table-wrap">
            <div className="card-head" style={{ padding: '1rem 1.25rem 0' }}><h2>营销超额奖励（附件B）</h2><span className="muted sm-text">基础分≥{tpl.qualify_score} 才有资格；每项一个 130% 门槛；合计最高 {cur}{tpl.max_over_bonus ?? '—'}</span></div>
            <table>
              <tbody>
                <tr><td>基础分是否≥{tpl.qualify_score}（领取资格）</td><td className="num"><span className={'tag ' + (payout.qualified ? 'good' : 'warn')}>{payout.qualified ? '符合' : '不符合'}</span></td></tr>
                {payout.bonusLines.map((b) => <tr key={b.label}><td>{b.label}<div className="muted sm-text">{b.why}</div></td><td className="num"><b>{money(b.amount, cur)}</b></td></tr>)}
                <tr><td><b>超额奖励合计</b></td><td className="num"><b>{money(payout.overBonus, cur)}</b></td></tr>
              </tbody>
            </table>
          </div>

          {/* D. monthly raw data */}
          <div className="card flush table-wrap">
            <div className="card-head" style={{ padding: '1rem 1.25rem 0' }}><h2>月度计划 / 原始数据输入（附件D）</h2>{editable && <button className="sm" onClick={() => setWeekly([...weekly, { id: tmp(), review_id: review.id, sort: weekly.length, week_date: null, ad_budget: null, attendance_target: null, leadmagnet_target: null, attendance_actual: null, leadmagnet_actual: null, ad_spend: null, leads_total: null }])}><Plus size={14} />Add date</button>}</div>
            <table>
              <thead><tr><th>考核日期</th>{weekly.map((w) => (
                <th key={w.id} style={{ minWidth: 150 }}>
                  <div className="row" style={{ flexWrap: 'nowrap', gap: '.2rem' }}><DatePicker value={w.week_date} clearable={false} disabled={!editable} onChange={(v) => patchWeek(w.id, { week_date: v })} />
                    {editable && <button className="ghost icon sm danger" aria-label="Remove date" onClick={() => setWeekly(weekly.filter((x) => x.id !== w.id))}><X size={14} /></button>}</div>
                </th>))}<th className="num">合计</th></tr></thead>
              <tbody>
                {WEEK_ROWS.map((row) => (
                  <tr key={row.k}>
                    <td style={{ minWidth: 220 }}>{row.label}</td>
                    {weekly.map((w) => <td key={w.id}>{editable ? <NumberInput value={w[row.k] as number | null} onChange={(n) => patchWeek(w.id, { [row.k]: n } as Partial<KpiWeekly>)} /> : (w[row.k] as number | null) ?? ''}</td>)}
                    <td className="num"><b>{weekly.reduce((t, w) => t + (Number(w[row.k]) || 0), 0).toLocaleString()}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted sm-text" style={{ padding: '.7rem 1.25rem', margin: 0 }}>CPL = 广告实际花费 ÷ 广告有效 Lead 总数 = {payout.sums.cpl == null ? '—' : money(payout.sums.cpl, cur)}　·　出席达成率 = 实际 ÷ 目标 = {payout.sums.attendanceTarget ? ((payout.sums.attendance / payout.sums.attendanceTarget) * 100).toFixed(0) + '%' : '—'}</p>
          </div>

          {/* E. checklist */}
          <div className="card flush table-wrap">
            <div className="card-head" style={{ padding: '1rem 1.25rem 0' }}><h2>Marketing Strategy Checklist（附件D）</h2><span className="muted sm-text">月初填明要求及截止日期，月底选择状态</span></div>
            <table>
              <thead><tr>{th('项目')}{th('当月要求及截止日期')}{th('状态')}{th('完成证据（链接 / 记录）')}</tr></thead>
              <tbody>
                {checklist.map((c) => (
                  <tr key={c.id}>
                    <td style={{ minWidth: 150 }}><b>{c.item}</b></td>
                    <td style={{ minWidth: 240 }}>{editable ? <input value={c.requirement ?? ''} onChange={(e) => patchCheck(c.id, { requirement: e.target.value })} /> : c.requirement}</td>
                    <td style={{ minWidth: 150 }}><Select block disabled={!editable} value={c.status ?? ''} onChange={(v) => patchCheck(c.id, { status: (v || null) as KpiChecklistRow['status'] })} options={STATUS} /></td>
                    <td style={{ minWidth: 220 }}>{editable ? <input value={c.evidence ?? ''} onChange={(e) => patchCheck(c.id, { evidence: e.target.value })} /> : c.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '.9rem 1.25rem' }}><label>额外约定或获授权调整</label>
              <textarea disabled={!editable} value={review.extra_note ?? ''} onChange={(e) => setReview({ ...review, extra_note: e.target.value })} /></div>
          </div>

          {/* F. commission */}
          <div className="card flush table-wrap">
            <div className="card-head" style={{ padding: '1rem 1.25rem 0' }}><h2>销售佣金（附件C，独立另计）</h2><span className="muted sm-text">第1–{tpl.commission_free_deals}单不计，第{tpl.commission_free_deals + 1}单起按实际净收款{tpl.commission_rate * 100}%；无{tpl.qualify_score}分门槛</span></div>
            <table>
              <thead><tr>{th('客户 / 订单编号')}{th('来源分享会')}{th('首笔有效收款日期')}{th('实际净收款累计 (RM)', true)}{th('佣金订单？')}{th('当月订单序号', true)}{th('佣金 (RM)', true)}<th style={{ width: 40 }}></th></tr></thead>
              <tbody>
                {orders.map((o) => {
                  const calc = payout.orders.find((x) => x.id === o.id)
                  return (
                    <tr key={o.id}>
                      <td style={{ minWidth: 170 }}>{editable ? <input value={o.customer_ref ?? ''} onChange={(e) => patchOrder(o.id, { customer_ref: e.target.value })} /> : o.customer_ref}</td>
                      <td style={{ minWidth: 120 }}>{editable ? <input value={o.source_webinar ?? ''} onChange={(e) => patchOrder(o.id, { source_webinar: e.target.value })} /> : o.source_webinar}</td>
                      <td style={{ minWidth: 160 }}><DatePicker value={o.first_payment_date} disabled={!editable} onChange={(v) => patchOrder(o.id, { first_payment_date: v || null })} /></td>
                      <td style={{ minWidth: 130 }}>{editable ? <NumberInput value={o.net_received} onChange={(n) => patchOrder(o.id, { net_received: n ?? 0 })} /> : o.net_received}</td>
                      <td style={{ minWidth: 90 }}><Select block disabled={!editable} value={o.is_commission_order ? 'yes' : 'no'} onChange={(v) => patchOrder(o.id, { is_commission_order: v === 'yes' })} options={YESNO} /></td>
                      <td className="num">{calc?.seq ?? ''}</td>
                      <td className="num">{calc?.seq ? money(calc.commission, cur) : ''}</td>
                      <td>{editable && <button className="ghost icon sm danger" aria-label="Remove" onClick={() => setOrders(orders.filter((x) => x.id !== o.id))}><X size={14} /></button>}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot><tr><th colSpan={6}>佣金合计</th><th className="num">{money(payout.commission, cur)}</th><th></th></tr></tfoot>
            </table>
            {editable && <div style={{ padding: '.7rem 1.25rem 0' }}><button className="sm" onClick={() => setOrders([...orders, { id: tmp(), review_id: review.id, sort: orders.length, customer_ref: '', source_webinar: '', first_payment_date: null, net_received: 0, is_commission_order: false }])}><Plus size={14} />Add order</button></div>}
            <p className="muted sm-text" style={{ padding: '.7rem 1.25rem', margin: 0 }}>按首笔有效收款时间顺序逐行填写；分期请填累计实际净收款（扣退款及SST）。第1/2天已成交的订单不属于佣金订单。每月重新计数，不追补前三单。</p>
          </div>

          {/* G. daily task */}
          <div className="card flush table-wrap">
            <div className="card-head" style={{ padding: '1rem 1.25rem 0' }}><h2>DAILY TASK</h2></div>
            <table className="daily">
              <thead><tr><th style={{ minWidth: 200 }}>Task</th>{Array.from({ length: daysInMonth }, (_, d) => <th key={d} className="num" style={{ padding: '.5rem .3rem', textAlign: 'center' }}>{d + 1}</th>)}</tr></thead>
              <tbody>
                {review.daily.map((row, ri) => (
                  <tr key={ri}>
                    <td><input disabled={!editable} placeholder={`Task ${ri + 1}`} value={row.label} onChange={(e) => setReview({ ...review, daily: review.daily.map((r, j) => (j === ri ? { ...r, label: e.target.value } : r)) })} /></td>
                    {Array.from({ length: daysInMonth }, (_, d) => (
                      <td key={d} style={{ textAlign: 'center', padding: '.4rem .3rem' }}>
                        <input type="checkbox" disabled={!editable} checked={!!row.days[d]} onChange={(e) => setReview({ ...review, daily: review.daily.map((r, j) => (j === ri ? { ...r, days: Array.from({ length: daysInMonth }, (_, k) => (k === d ? e.target.checked : !!r.days[k])) } : r)) })} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isManager && (
            <div className="row" style={{ marginBottom: '1rem' }}>
              {editable && <button className="primary" onClick={save}><Save size={16} />Save</button>}
              <button onClick={() => setLock(!review.locked)}>{review.locked ? <LockOpen size={16} /> : <Lock size={16} />}{review.locked ? 'Reopen for editing' : 'Finalise month'}</button>
              <button className="danger" onClick={del}><Trash2 size={16} />Delete</button>
              <Msg text={msg} />
            </div>
          )}
        </>
      )}

      {/* 总览 */}
      {overviewMonths.length > 0 && (
        <div className="card flush table-wrap" style={{ marginTop: '1rem' }}>
          <div className="card-head" style={{ padding: '1rem 1.25rem 0' }}><h2>{person?.full_name} KPI 总览{person?.start_date ? ` ｜ AIGOAL 合作期 ${monthLabel(monthStart(person.start_date))}${person.end_date ? ` – ${monthLabel(monthStart(person.end_date))}` : ''}` : ''}</h2></div>
          <table>
            <thead><tr>{th('月份')}{th('基础得分', true)}{th('固定服务费', true)}{th('基础绩效奖金', true)}{th('营销超额奖励', true)}{th('总计（不含佣金）', true)}{th('销售佣金', true)}{th('含佣金总收入', true)}</tr></thead>
            <tbody>
              {overviewMonths.map((m) => {
                const h = hist(m)
                return (
                  <tr key={m} className="click" onClick={() => setMonth(m)} style={m === month ? { background: 'var(--brand-soft)' } : undefined}>
                    <td>{monthLabel(m)}</td>
                    <td className="num">{h ? h.payout.baseScore : '—'}</td>
                    <td className="num">{h ? money(Number(h.tpl.base_fee), h.tpl.currency) : '—'}</td>
                    <td className="num">{h ? money(h.payout.baseBonus, h.tpl.currency) : '—'}</td>
                    <td className="num">{h ? money(h.payout.overBonus, h.tpl.currency) : '—'}</td>
                    <td className="num">{h ? money(h.payout.total, h.tpl.currency) : '—'}</td>
                    <td className="num">{h ? money(h.payout.commission, h.tpl.currency) : '—'}</td>
                    <td className="num"><b>{h ? money(h.payout.grand, h.tpl.currency) : '—'}</b></td>
                  </tr>
                )
              })}
            </tbody>
            {have.length > 0 && (
              <tfoot><tr>
                <th>合计 / 平均分</th>
                <th className="num">{(have.reduce((t, h) => t + h.payout.baseScore, 0) / have.length).toFixed(1)}</th>
                <th className="num">{money(have.reduce((t, h) => t + Number(h.tpl.base_fee), 0), have[0].tpl.currency)}</th>
                <th className="num">{money(have.reduce((t, h) => t + h.payout.baseBonus, 0), have[0].tpl.currency)}</th>
                <th className="num">{money(have.reduce((t, h) => t + h.payout.overBonus, 0), have[0].tpl.currency)}</th>
                <th className="num">{money(have.reduce((t, h) => t + h.payout.total, 0), have[0].tpl.currency)}</th>
                <th className="num">{money(have.reduce((t, h) => t + h.payout.commission, 0), have[0].tpl.currency)}</th>
                <th className="num">{money(have.reduce((t, h) => t + h.payout.grand, 0), have[0].tpl.currency)}</th>
              </tr></tfoot>
            )}
          </table>
          {(tpl ?? have[0]?.tpl)?.description && (
            <div style={{ padding: '1rem 1.25rem' }}><b>规则摘要</b><div className="pre muted sm-text" style={{ marginTop: '.4rem' }}>{(tpl ?? have[0]?.tpl)!.description}</div></div>
          )}
        </div>
      )}
    </>
  )
}
