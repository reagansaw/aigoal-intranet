import { useEffect, useMemo, useState } from 'react'
import { BadgeDollarSign, ChevronLeft, ChevronRight, Coins, Lock, LockOpen, Save, Target, Trash2, TrendingUp } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useStaff } from '../lib/useStaff'
import { achievement, autoScore, calcPayout, itemScore } from '../lib/kpi'
import { Empty, Msg, NumberInput, PageHeader, Select, Stat } from '../components/ui'
import { addMonths, money, monthLabel, monthStart } from '../lib/util'
import type { KpiItem, KpiReview, KpiScore, KpiTemplate } from '../lib/types'

type ScoreMap = Record<string, Partial<KpiScore>>

export default function Kpi() {
  const { profile, isManager } = useAuth()
  const staff = useStaff()
  const [uid, setUid] = useState(profile!.id)
  const [month, setMonth] = useState(monthStart(new Date()))
  const [templates, setTemplates] = useState<KpiTemplate[]>([])
  const [review, setReview] = useState<KpiReview | null>(null)
  const [items, setItems] = useState<KpiItem[]>([])
  const [scores, setScores] = useState<ScoreMap>({})
  const [tplId, setTplId] = useState('')
  const [msg, setMsg] = useState('')
  const [history, setHistory] = useState<{ month: string; score: number; grand: number; cur: string }[]>([])

  const tpl = templates.find((t) => t.id === review?.template_id)
  const editable = isManager && !review?.locked

  useEffect(() => {
    supabase.from('kpi_templates').select('*').eq('active', true).order('name').then(({ data }) => {
      setTemplates((data ?? []) as KpiTemplate[])
      if (data?.length) setTplId(data[0].id)
    })
  }, [])

  const load = async () => {
    setMsg('')
    const { data: r } = await supabase.from('kpi_reviews').select('*').eq('user_id', uid).eq('month', month).maybeSingle()
    setReview((r as KpiReview) ?? null)
    if (!r) { setItems([]); setScores({}); return }
    const [{ data: it }, { data: sc }] = await Promise.all([
      supabase.from('kpi_items').select('*').eq('template_id', r.template_id).order('sort'),
      supabase.from('kpi_scores').select('*').eq('review_id', r.id),
    ])
    setItems((it ?? []) as KpiItem[])
    const m: ScoreMap = {}
    ;(sc ?? []).forEach((s: KpiScore) => (m[s.item_id] = s))
    setScores(m)
  }
  useEffect(() => { load() }, [uid, month])

  // Month-by-month overview (总览)
  useEffect(() => {
    ;(async () => {
      const { data: rs } = await supabase.from('kpi_reviews').select('*').eq('user_id', uid).order('month')
      const reviews = (rs ?? []) as KpiReview[]
      if (!reviews.length) return setHistory([])
      const [{ data: ts }, { data: its }, { data: scs }] = await Promise.all([
        supabase.from('kpi_templates').select('*'),
        supabase.from('kpi_items').select('*').in('template_id', [...new Set(reviews.map((r) => r.template_id))]),
        supabase.from('kpi_scores').select('*').in('review_id', reviews.map((r) => r.id)),
      ])
      setHistory(reviews.map((r) => {
        const t = (ts as KpiTemplate[]).find((x) => x.id === r.template_id)!
        const m: ScoreMap = {}
        ;(scs as KpiScore[]).filter((s) => s.review_id === r.id).forEach((s) => (m[s.item_id] = s))
        const p = calcPayout(t, (its as KpiItem[]).filter((i) => i.template_id === t.id), m, r)
        return { month: r.month, score: p.baseScore, grand: p.grand, cur: t.currency }
      }))
    })()
  }, [uid, review?.id, msg])

  const payout = useMemo(() => (tpl && review ? calcPayout(tpl, items, scores, review) : null), [tpl, items, scores, review])

  const create = async () => {
    const { error } = await supabase.from('kpi_reviews').insert({ user_id: uid, template_id: tplId, month })
    if (error) setMsg(error.message); else load()
  }
  const patchScore = (id: string, p: Partial<KpiScore>) => setScores({ ...scores, [id]: { ...scores[id], ...p } })

  const save = async () => {
    if (!review) return
    const { error: e1 } = await supabase.from('kpi_reviews').update({
      deals_count: review.deals_count, net_collected: review.net_collected, summary: review.summary, locked: review.locked,
    }).eq('id', review.id)
    const rows = items.map((it) => ({
      review_id: review.id, item_id: it.id,
      actual: scores[it.id]?.actual ?? null, score: scores[it.id]?.score ?? null,
      reason: scores[it.id]?.reason ?? null, improvement: scores[it.id]?.improvement ?? null,
    }))
    const { error: e2 } = await supabase.from('kpi_scores').upsert(rows)
    setMsg(e1?.message || e2?.message || 'Saved ✓')
  }
  const del = async () => {
    if (review && confirm('Delete this month\'s scorecard?')) { await supabase.from('kpi_reviews').delete().eq('id', review.id); load() }
  }

  return (
    <>
      <PageHeader title="PDR / KPI" sub="Monthly performance review and payout.">
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
          <div className="grid">
            <Stat icon={Target} label="Base score" value={`${payout.baseScore} / ${items.reduce((n, i) => n + Number(i.max_points), 0)}`} />
            <Stat icon={Coins} tone="green" label="Base bonus" value={money(payout.baseBonus, tpl.currency)} />
            <Stat icon={TrendingUp} tone="orange" label={payout.qualified ? 'Over-achievement bonus' : `Over-achievement (needs ${tpl.qualify_score}+)`} value={money(payout.overBonus, tpl.currency)} />
            <Stat icon={BadgeDollarSign} tone="red" label={`Total incl. ${money(tpl.base_fee, tpl.currency)} fixed + commission`} value={money(payout.grand, tpl.currency)} />
          </div>

          <div className="card flush table-wrap">
            <div className="card-head"><h2>{tpl.name}</h2></div>
            <table>
              <thead><tr><th>#</th><th>Responsibility</th><th>Standard</th><th>Max</th><th>Target</th><th>Actual</th><th>Achv.</th><th>Score</th><th>Reason</th><th>How to improve</th></tr></thead>
              <tbody>
                {items.map((it, i) => {
                  const s = scores[it.id]
                  const a = achievement(it, s?.actual)
                  const auto = autoScore(it, s?.actual)
                  return (
                    <tr key={it.id}>
                      <td>{i + 1}</td><td><b>{it.name}</b></td><td className="muted pre sm-text" style={{ minWidth: 220 }}>{it.standard}</td>
                      <td>{it.max_points}</td><td>{it.target ?? '—'} {it.unit}</td>
                      <td>{editable ? <NumberInput value={s?.actual} onChange={(n) => patchScore(it.id, { actual: n })} /> : s?.actual ?? '—'}</td>
                      <td>{a != null ? `${a.toFixed(0)}%` : '—'}</td>
                      <td>
                        {editable ? (
                          <NumberInput placeholder={auto != null ? `auto ${auto}` : '0'} value={s?.score} onChange={(n) => patchScore(it.id, { score: n })} />
                        ) : <b>{itemScore(it, s)}</b>}
                      </td>
                      <td>{editable ? <input value={s?.reason ?? ''} onChange={(e) => patchScore(it.id, { reason: e.target.value })} /> : s?.reason}</td>
                      <td>{editable ? <input value={s?.improvement ?? ''} onChange={(e) => patchScore(it.id, { improvement: e.target.value })} /> : s?.improvement}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {editable && <p className="muted sm-text" style={{ padding: '.8rem 1.25rem' }}>Leave “Score” blank to use the automatic score from the actual figure; type a number to override.</p>}
          </div>

          {tpl.commission_rate > 0 && (
            <div className="card">
              <h2 style={{ marginBottom: '.2rem' }}>Sales commission</h2>
              <p className="muted sm-text" style={{ marginTop: 0 }}><span>({tpl.commission_rate * 100}% of net collected from deal #{tpl.commission_free_deals + 1}, separate from the 80-pt gate)</span></p>
              <div className="form-grid">
                <div><label>Deals closed</label>{editable ? <NumberInput value={review.deals_count} onChange={(n) => setReview({ ...review, deals_count: n ?? 0 })} /> : review.deals_count}</div>
                <div><label>Net collected ({tpl.currency})</label>{editable ? <NumberInput value={review.net_collected} onChange={(n) => setReview({ ...review, net_collected: n ?? 0 })} /> : review.net_collected}</div>
                <div><label>Commission</label><b>{money(payout.commission, tpl.currency)}</b></div>
              </div>
            </div>
          )}

          <div className="card">
            <h2>Reviewer summary</h2>
            {editable ? <textarea value={review.summary ?? ''} onChange={(e) => setReview({ ...review, summary: e.target.value })} /> : <div className="pre">{review.summary || <span className="muted">—</span>}</div>}
          </div>

          {isManager && (
            <div className="row">
              {editable && <button className="primary" onClick={save}><Save size={16} />Save</button>}
              <button onClick={async () => {
                const locked = !review.locked
                setReview({ ...review, locked })
                await supabase.from('kpi_reviews').update({ locked }).eq('id', review.id)
              }}>{review.locked ? <LockOpen size={16} /> : <Lock size={16} />}{review.locked ? 'Reopen for editing' : 'Finalise month'}</button>
              <button className="danger" onClick={del}><Trash2 size={16} />Delete</button>
              <Msg text={msg} />
            </div>
          )}
        </>
      )}

      {history.length > 0 && (
        <div className="card flush table-wrap" style={{ marginTop: '1rem' }}>
          <div className="card-head"><h2>总览 · Monthly overview</h2></div>
          <table>
            <thead><tr><th>Month</th><th>Base score</th><th>Total income</th></tr></thead>
            <tbody>{history.map((h) => <tr key={h.month} className="click" onClick={() => setMonth(h.month)}><td>{monthLabel(h.month)}</td><td>{h.score}</td><td>{money(h.grand, h.cur)}</td></tr>)}</tbody>
            <tfoot><tr><th>Average / Total</th><th>{(history.reduce((s, h) => s + h.score, 0) / history.length).toFixed(1)}</th><th>{money(history.reduce((s, h) => s + h.grand, 0), history[0].cur)}</th></tr></tfoot>
          </table>
        </div>
      )}
    </>
  )
}
