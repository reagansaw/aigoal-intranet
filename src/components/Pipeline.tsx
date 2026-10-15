import { Check } from 'lucide-react'
import type { Pipeline } from '../lib/pipeline'

/** Compact 5-dot progress for table rows. */
export function PipelineDots({ p }: { p: Pipeline }) {
  return (
    <div className="pipe" aria-label={p.stageLabel}>
      {p.steps.map((s, i) => (
        <span key={s.key} className="pipe-item">
          <i className={'pipe-dot ' + s.state} title={`${s.label}${s.sub ? ': ' + s.sub : ''}`}>{s.state === 'done' && <Check size={9} strokeWidth={3.5} />}</i>
          {i < p.steps.length - 1 && <b className={'pipe-line ' + (s.state === 'done' ? 'done' : '')} />}
        </span>
      ))}
    </div>
  )
}

/** Large labelled stepper for the account form. */
export function Stepper({ p }: { p: Pipeline }) {
  return (
    <div className="stepper">
      {p.steps.map((s, i) => (
        <div key={s.key} className={'step ' + s.state}>
          <div className="step-top">
            <span className="step-dot">{s.state === 'done' ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
            {i < p.steps.length - 1 && <span className="step-line" />}
          </div>
          <div className="step-label">{s.label}</div>
          <div className="step-sub">{s.sub ?? ' '}</div>
        </div>
      ))}
    </div>
  )
}
