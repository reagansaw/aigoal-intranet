import { dayLabel } from '../lib/util'

export interface DayCount { day: string; done: number; total: number }

/** Bars of done vs still-to-do tasks per day (inline SVG, follows the theme). */
export default function TodoChart({ data, selected, title }: { data: DayCount[]; selected?: string; title: string }) {
  const max = Math.max(4, ...data.map((d) => d.total))
  const W = Math.max(320, data.length * 34), H = 170, L = 26, B = 24, T = 8
  const bw = Math.min(26, ((W - L) / data.length) * 0.62)
  const x = (i: number) => L + ((W - L) / data.length) * (i + 0.5)
  const y = (v: number) => T + (H - T - B) * (1 - v / max)
  const ticks = [0, Math.ceil(max / 2), max]
  const sum = data.reduce((a, d) => ({ done: a.done + d.done, total: a.total + d.total }), { done: 0, total: 0 })
  const pct = sum.total ? Math.round((sum.done / sum.total) * 100) : 0
  return (
    <div className="card">
      <div className="card-head"><h2>{title}</h2><span className="muted sm-text"><b style={{ color: 'var(--ink)' }}>{sum.done}</b> of {sum.total} done · <b style={{ color: 'var(--ink)' }}>{pct}%</b></span></div>
      <div className="chart-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: Math.min(W, 560), height: 'auto', display: 'block' }} role="img" aria-label={title}>
          {ticks.map((t) => <g key={t}><line x1={L} x2={W} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t ? '3 4' : undefined} /><text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{t}</text></g>)}
          {data.map((d, i) => {
            const left = d.total - d.done
            return (
              <g key={d.day}>
                <title>{`${dayLabel(d.day)}: ${d.done} done, ${left} to do`}</title>
                {selected === d.day && <rect x={x(i) - bw / 2 - 4} y={T} width={bw + 8} height={H - T - B} rx="5" fill="var(--brand-soft)" />}
                <rect x={x(i) - bw / 2} y={y(d.done)} width={bw} height={Math.max(0, y(0) - y(d.done))} rx="3" fill="var(--ok)" />
                <rect x={x(i) - bw / 2} y={y(d.total)} width={bw} height={Math.max(0, y(d.done) - y(d.total))} rx="3" fill="var(--warn)" opacity=".55" />
                <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill={selected === d.day ? 'var(--brand)' : 'var(--muted)'} fontWeight={selected === d.day ? 700 : 400}>{Number(d.day.slice(8))}</text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="row sm-text muted" style={{ gap: '1rem', marginTop: '.3rem' }}>
        <span><i className="dot" style={{ background: 'var(--ok)' }} /> Done</span>
        <span><i className="dot" style={{ background: 'var(--warn)', opacity: .55 }} /> Still to do</span>
      </div>
    </div>
  )
}
