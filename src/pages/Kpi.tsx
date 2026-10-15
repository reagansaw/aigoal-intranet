import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useStaff } from '../lib/useStaff'
import { achievement, autoScore, calcPayout, itemScore } from '../lib/kpi'
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
  const num = (v: string) => (v === '' ? null : Number(v))

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
      <div className="row between">
        <h1>PDR / KPI</h1>
        {isManager && (
          <select style={{ width: 'auto' }} value={uid} onChange={(e) => setUid(e.target.value)}>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
          </select>
        )}
      </div>

      <div className="card row">
        <button onClick={() => setMonth(addMonths(month, -1))}>‹</button>
        <b>{monthLabel(month)}</b>
        <button onClick={() => setMonth(addMonths(month, 1))}>›</button>
        {review?.locked && <span className="tag">🔒 finalised</span>}
      </div>

      {!review && (
        <div className="card">
          <p className="muted">No scorecard for {monthLabel(month)}.</p>
          {isManager ? (
            <div className="row">
              <select style={{ width: 'auto' }} value={tplId} onChange={(e) => setTplId(e.target.value)}>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button className="primary" onClick={create} disabled={!tplId}>Create scorecard</button>
            </div>
          ) : <p className="muted">HR / Admin will set this up.</p>}
          {msg && <div className="err">{msg}</div>}
        </div>
      )}

      {review && tpl && payout && (
        <>
          <div className="grid">
            <div className="card"><div className="muted">Base score</div><div className="stat">{payout.baseScore} / {items.reduce((s, i) => s + Number(i.max_points), 0)}</div></div>
            <div className="card"><div className="muted">Base bonus</div><div className="stat">{money(payout.baseBonus, tpl.currency)}</div></div>
            <div className="card"><div className="muted">Over-achievement bonus {payout.qualified ? '' : `(needs ≥ ${tpl.qualify_score})`}</div><div className="stat">{money(payout.overBonus, tpl.currency)}</div></div>
            <div className="card"><div className="muted">Total incl. {money(tpl.base_fee, tpl.currency)} fixed + commission</div><div className="stat">{money(payout.grand, tpl.currency)}</div></div>
          </div>

          <div className="card table-wrap">
            <h2>{tpl.name}</h2>
            <table>
              <thead><tr><th>#</th><th>Responsibility</th><th>Standard</th><th>Max</th><th>Target</th><th>Actual</th><th>Achv.</th><th>Score</th><th>Reason</th><th>How to improve</th></tr></thead>
              <tbody>
                {items.map((it, i) => {
                  const s = scores[it.id]
                  const a = achievement(it, s?.actual)
                  const auto = autoScore(it, s?.actual)
                  return (
                    <tr key={it.id}>
                      <td>{i + 1}</td><td><b>{it.name}</b></td><td className="muted pre">{it.standard}</td>
                      <td>{it.max_points}</td><td>{it.target ?? '—'} {it.unit}</td>
                      <td>{editable ? <input type="number" step="any" value={s?.actual ?? ''} onChange={(e) => patchScore(it.id, { actual: num(e.target.value) })} /> : s?.actual ?? '—'}</td>
                      <td>{a != null ? `${a.toFixed(0)}%` : '—'}</td>
                      <td>
                        {editable ? (
                          <input type="number" step="any" placeholder={auto != null ? `auto ${auto}` : '0'} value={s?.score ?? ''} onChange={(e) => patchScore(it.id, { score: num(e.target.value) })} />
                        ) : <b>{itemScore(it, s)}</b>}
                      </td>
                      <td>{editable ? <input value={s?.reason ?? ''} onChange={(e) => patchScore(it.id, { reason: e.target.value })} /> : s?.reason}</td>
                      <td>{editable ? <input value={s?.improvement ?? ''} onChange={(e) => patchScore(it.id, { improvement: e.target.value })} /> : s?.improvement}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {editable && <p className="muted">Leave “Score” blank to use the automatic score from the actual figure; type a number to override.</p>}
          </div>

          {tpl.commission_rate > 0 && (
            <div className="card">
              <h2>Sales commission <span className="muted">({tpl.commission_rate * 100}% of net collected from deal #{tpl.commission_free_deals + 1}, separate from the 80-pt gate)</span></h2>
              <div className="form-grid">
                <div><label>Deals closed</label>{editable ? <input type="number" value={review.deals_count} onChange={(e) => setReview({ ...review, deals_count: Number(e.target.value) })} /> : review.deals_count}</div>
                <div><label>Net collected ({tpl.currency})</label>{editable ? <input type="number" step="any" value={review.net_collected} onChange={(e) => setReview({ ...review, net_collected: Number(e.target.value) })} /> : review.net_collected}</div>
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
              {editable && <button className="primary" onClick={save}>Save</button>}
              <label className="row" style={{ margin: 0 }}><input type="checkbox" checked={review.locked} onChange={async (e) => {
                const locked = e.target.checked
                setReview({ ...review, locked })
                await supabase.from('kpi_reviews').update({ locked }).eq('id', review.id)
              }} /> Finalise (lock for editing)</label>
              <button className="danger" onClick={del}>Delete</button>
              <span className={msg.includes('✓') ? 'ok' : 'err'}>{msg}</span>
            </div>
          )}
        </>
      )}

      {history.length > 0 && (
        <div className="card table-wrap" style={{ marginTop: '1rem' }}>
          <h2>总览 · Monthly overview</h2>
          <table>
            <thead><tr><th>Month</th><th>Base score</th><th>Total income</th></tr></thead>
            <tbody>{history.map((h) => <tr key={h.month} style={{ cursor: 'pointer' }} onClick={() => setMonth(h.month)}><td>{monthLabel(h.month)}</td><td>{h.score}</td><td>{money(h.grand, h.cur)}</td></tr>)}</tbody>
            <tfoot><tr><th>Average / Total</th><th>{(history.reduce((s, h) => s + h.score, 0) / history.length).toFixed(1)}</th><th>{money(history.reduce((s, h) => s + h.grand, 0), history[0].cur)}</th></tr></tfoot>
          </table>
        </div>
      )}
    </>
  )
}
