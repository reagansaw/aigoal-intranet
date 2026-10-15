import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BarChart3, ExternalLink, ListChecks, PhoneCall, Pin, Wallet } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { calcPayout } from '../lib/kpi'
import { money, monthLabel, monthStart, today } from '../lib/util'
import { Empty, PageHeader, Stat } from '../components/ui'
import type { KbArticle, KpiItem, KpiReview, KpiScore, KpiTemplate, Todo } from '../lib/types'

export default function Home() {
  const { profile } = useAuth()
  const [todos, setTodos] = useState<Todo[]>([])
  const [pinned, setPinned] = useState<KbArticle[]>([])
  const [hot, setHot] = useState(0)
  const [kpi, setKpi] = useState<{ score: number; max: number; total: number; cur: string; tpl: string } | null>(null)
  const month = monthStart(new Date())

  useEffect(() => {
    if (!profile) return
    supabase.from('todos').select('*').eq('user_id', profile.id).eq('due_date', today()).order('done').then(({ data }) => setTodos((data ?? []) as Todo[]))
    supabase.from('kb_articles').select('*').eq('pinned', true).then(({ data }) => setPinned((data ?? []) as KbArticle[]))
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('priority', 'P1').eq('owner_id', profile.id).then(({ count }) => setHot(count ?? 0))
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
      const items = (it ?? []) as KpiItem[]
      const p = calcPayout(tpl, items, map, review)
      setKpi({ score: p.baseScore, max: items.reduce((s, i) => s + Number(i.max_points), 0), total: p.grand, cur: tpl.currency, tpl: tpl.name })
    })()
  }, [profile?.id])

  const toggle = async (t: Todo) => {
    await supabase.from('todos').update({ done: !t.done, done_at: !t.done ? new Date().toISOString() : null }).eq('id', t.id)
    setTodos(todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))
  }
  const done = todos.filter((t) => t.done).length

  return (
    <>
      <PageHeader title={`Welcome back, ${profile?.full_name?.split(' ')[0] || 'there'}`} sub={new Date().toLocaleDateString('en-GB', { dateStyle: 'full' })} />
      <div className="grid">
        <Stat icon={ListChecks} label="Tasks done today" value={`${done} / ${todos.length}`} />
        <Stat icon={BarChart3} tone="green" label={`${monthLabel(month)} base score`} value={kpi ? `${kpi.score} / ${kpi.max}` : 'Not set'} />
        <Stat icon={Wallet} tone="orange" label="Estimated payout" value={kpi ? money(kpi.total, kpi.cur) : '—'} />
        <Stat icon={PhoneCall} tone="red" label="Hot customers (P1)" value={hot} />
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <div className="card">
          <div className="card-head"><h2>Today's to-do</h2><Link to="/todos" className="row" style={{ gap: '.25rem' }}>Open <ArrowRight size={15} /></Link></div>
          <div className="bar" style={{ marginBottom: '.5rem' }}><i style={{ width: todos.length ? `${(done / todos.length) * 100}%` : 0 }} /></div>
          {todos.slice(0, 7).map((t) => (
            <label key={t.id} className={'todo' + (t.done ? ' done' : '')} style={{ margin: 0, cursor: 'pointer', color: 'inherit', fontSize: 'inherit', fontWeight: 400 }}>
              <input type="checkbox" checked={t.done} onChange={() => toggle(t)} /><span className="t">{t.title}</span>
            </label>
          ))}
          {!todos.length && <Empty icon={ListChecks} title="Nothing planned today">Add tasks from the To-Do page.</Empty>}
        </div>
        <div className="card">
          <div className="card-head"><h2><Pin size={17} className="i" />Quick links</h2><Link to="/kb" className="row" style={{ gap: '.25rem' }}>All <ArrowRight size={15} /></Link></div>
          {pinned.map((a) => (
            <div key={a.id} className="link-row">
              <ExternalLink size={15} className="i" style={{ color: 'var(--muted)' }} />
              {a.url ? <a href={a.url} target="_blank" rel="noreferrer">{a.title}</a> : <Link to="/kb">{a.title}</Link>}
            </div>
          ))}
          {!pinned.length && <Empty icon={Pin} title="No pinned links">Admin can pin articles from the Knowledge Base.</Empty>}
        </div>
      </div>
      {kpi && <p className="muted sm-text">Scorecard: {kpi.tpl}</p>}
    </>
  )
}
