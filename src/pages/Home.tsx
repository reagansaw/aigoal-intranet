import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { calcPayout } from '../lib/kpi'
import { money, monthLabel, monthStart, today } from '../lib/util'
import type { KbArticle, KpiItem, KpiReview, KpiScore, KpiTemplate, Todo } from '../lib/types'

export default function Home() {
  const { profile } = useAuth()
  const [todos, setTodos] = useState<Todo[]>([])
  const [pinned, setPinned] = useState<KbArticle[]>([])
  const [kpi, setKpi] = useState<{ score: number; total: number; cur: string; tpl: string } | null>(null)
  const month = monthStart(new Date())

  useEffect(() => {
    if (!profile) return
    supabase.from('todos').select('*').eq('user_id', profile.id).eq('due_date', today()).order('done').then(({ data }) => setTodos((data ?? []) as Todo[]))
    supabase.from('kb_articles').select('*').eq('pinned', true).then(({ data }) => setPinned((data ?? []) as KbArticle[]))
    ;(async () => {
      const { data: r } = await supabase.from('kpi_reviews').select('*').eq('user_id', profile.id).eq('month', month).maybeSingle()
      if (!r) return
      const review = r as KpiReview
      const [{ data: t }, { data: it }, { data: sc }] = await Promise.all([
        supabase.from('kpi_templates').select('*').eq('id', review.template_id).single(),
        supabase.from('kpi_items').select('*').eq('template_id', review.template_id).order('sort'),
        supabase.from('kpi_scores').select('*').eq('review_id', review.id),
      ])
      const map: Record<string, Partial<KpiScore>> = {}
      ;(sc ?? []).forEach((s: KpiScore) => (map[s.item_id] = s))
      const tpl = t as KpiTemplate
      const p = calcPayout(tpl, (it ?? []) as KpiItem[], map, review)
      setKpi({ score: p.baseScore, total: p.grand, cur: tpl.currency, tpl: tpl.name })
    })()
  }, [profile?.id])

  const toggle = async (t: Todo) => {
    await supabase.from('todos').update({ done: !t.done, done_at: !t.done ? new Date().toISOString() : null }).eq('id', t.id)
    setTodos(todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))
  }
  const done = todos.filter((t) => t.done).length

  return (
    <>
      <h1>Hi {profile?.full_name?.split(' ')[0] || 'there'} 👋</h1>
      <p className="muted">{new Date().toLocaleDateString('en-GB', { dateStyle: 'full' })}</p>
      <div className="grid">
        <div className="card">
          <div className="row between"><h2>Today's to-do</h2><Link to="/todos">Open</Link></div>
          <div className="stat">{done}/{todos.length}</div>
          <div className="bar"><i style={{ width: todos.length ? `${(done / todos.length) * 100}%` : 0 }} /></div>
          {todos.slice(0, 6).map((t) => (
            <label key={t.id} className={'todo' + (t.done ? ' done' : '')} style={{ color: 'inherit', fontSize: 'inherit', margin: 0 }}>
              <input type="checkbox" checked={t.done} onChange={() => toggle(t)} /><span className="t">{t.title}</span>
            </label>
          ))}
          {!todos.length && <p className="muted">Nothing planned today.</p>}
        </div>
        <div className="card">
          <div className="row between"><h2>{monthLabel(month)} PDR</h2><Link to="/kpi">Open</Link></div>
          {kpi ? (
            <>
              <div className="stat">{kpi.score} pts</div>
              <div className="muted">{kpi.tpl}</div>
              <div style={{ marginTop: '.5rem' }}>Estimated payout: <b>{money(kpi.total, kpi.cur)}</b></div>
            </>
          ) : <p className="muted">No scorecard set up for this month yet. HR/Admin will create it.</p>}
        </div>
        <div className="card">
          <h2>Quick links</h2>
          {pinned.map((a) => <div key={a.id}><a href={a.url ?? '#/kb'} target="_blank" rel="noreferrer">{a.title}</a></div>)}
          {!pinned.length && <p className="muted">Admin can pin links from the Knowledge Base.</p>}
        </div>
      </div>
    </>
  )
}
