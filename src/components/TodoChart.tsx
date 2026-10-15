import { dayLabel } from '../lib/util'

export interface DayCount { day: string; done: number; total: number }

/** Done vs still-to-do per day, with a summary row. Inline SVG, follows the theme. */
export default function TodoChart({ data, selected, title }: { data: DayCount[]; selected?: string; title: string }) {
  const max = Math.max(4, ...data.map((d) => d.total))
  const n = data.length
  const W = Math.max(340, n * 36), H = 196, L = 28, B = 26, T = 30
  const slot = (W - L) / n
  const bw = Math.min(26, slot * 0.6)
  const x = (i: number) => L + slot * (i + 0.5)
  const y = (v: number) => T + (H - T - B) * (1 - v / max)
  const ticks = [...new Set([0, Math.ceil(max / 2), max])]
  const sum = data.reduce((a, d) => ({ done: a.done + d.done, total: a.total + d.total }), { done: 0, total: 0 })
  const pct = sum.total ? Math.round((sum.done / sum.total) * 100) : 0
  const active = data.filter((d) => d.total > 0)
  const best = active.length ? [...active].sort((a, b) => b.done / b.total - a.done / a.total || b.total - a.total)[0] : null
  const avgDone = active.length ? sum.done / active.length : 0
  const tiles = [
    { label: 'Done', value: sum.done, tone: 'var(--ok)' },
    { label: 'Still to do', value: sum.total - sum.done, tone: 'var(--warn)' },
    { label: 'Completion', value: `${pct}%`, tone: 'var(--brand)' },
    { label: 'Best day', value: best ? `${dayLabel(best.day).split(',')[0]} · ${Math.round((best.done / best.total) * 100)}%` : '—', tone: 'var(--ink)' },
  ]
  return (
    <div className="card">
      <div className="card-head"><h2>{title}</h2></div>
      <div className="chart-tiles">
        {tiles.map((t) => <div key={t.label}><small>{t.label}</small><b style={{ color: t.tone }}>{t.value}</b></div>)}
      </div>
      <div className="chart-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: Math.min(W, 560), height: 'auto', display: 'block' }} role="img" aria-label={title}>
          <defs>
            <linearGradient id="gDone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--ok)" /><stop offset="1" stopColor="var(--ok)" stopOpacity=".72" /></linearGradient>
            <linearGradient id="gLeft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--warn)" stopOpacity=".5" /><stop offset="1" stopColor="var(--warn)" stopOpacity=".28" /></linearGradient>
          </defs>
          {ticks.map((t) => <g key={t}><line x1={L} x2={W} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t ? '3 4' : undefined} /><text x={L - 7} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--muted)">{t}</text></g>)}
          {data.map((d, i) => {
            const wk = [0, 6].includes(new Date(d.day + 'T12:00:00').getDay())
            const isSel = selected === d.day
            const full = d.total > 0 && d.done === d.total
            return (
              <g key={d.day}>
                <title>{`${dayLabel(d.day)}: ${d.done} done, ${d.total - d.done} to do`}</title>
                {wk && <rect x={L + slot * i} y={T - 6} width={slot} height={H - T - B + 6} fill="var(--surface-2)" opacity=".7" />}
                {isSel && <rect x={L + slot * i + 2} y={T - 6} width={slot - 4} height={H - T - B + 6} rx="6" fill="var(--brand-soft)" />}
                {d.total === 0 && <line x1={x(i) - bw / 3} x2={x(i) + bw / 3} y1={y(0) - 1} y2={y(0) - 1} stroke="var(--line-strong, var(--line))" strokeWidth="2" strokeLinecap="round" />}
                {d.total > 0 && <>
                  <rect x={x(i) - bw / 2} y={y(d.total)} width={bw} height={Math.max(0, y(0) - y(d.total))} rx="4" fill="url(#gLeft)" />
                  {d.done > 0 && <rect x={x(i) - bw / 2} y={y(d.done)} width={bw} height={Math.max(0, y(0) - y(d.done))} rx="4" fill="url(#gDone)" />}
                  {n <= 14 && <text x={x(i)} y={y(d.total) - 5} textAnchor="middle" fontSize="10" fontWeight="600" fill={full ? 'var(--ok)' : 'var(--muted)'}>{full ? '✓' : `${Math.round((d.done / d.total) * 100)}%`}</text>}
                </>}
                <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill={isSel ? 'var(--brand)' : 'var(--muted)'} fontWeight={isSel ? 700 : 400}>{Number(d.day.slice(8))}</text>
              </g>
            )
          })}
          {avgDone > 0 && <g><line x1={L} x2={W} y1={y(avgDone)} y2={y(avgDone)} stroke="var(--brand)" strokeWidth="1.2" strokeDasharray="5 4" opacity=".7" /></g>}
        </svg>
      </div>
      <div className="row sm-text muted" style={{ gap: '1rem', marginTop: '.4rem' }}>
        <span><i className="dot" style={{ background: 'var(--ok)' }} /> Done</span>
        <span><i className="dot" style={{ background: 'var(--warn)', opacity: .5 }} /> Still to do</span>
        <span><i className="dot" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }} /> Weekend</span>
        {avgDone > 0 && <span style={{ color: 'var(--brand)' }}>- - - average {avgDone.toFixed(1)} done per day</span>}
      </div>
    </div>
  )
}
