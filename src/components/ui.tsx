import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Calendar, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, X, type LucideIcon } from 'lucide-react'

export function PageHeader({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>
      {children && <div className="actions">{children}</div>}
    </div>
  )
}

/** Status text: anything ending in "✓" is shown as success, anything else as an error. */
export function Msg({ text }: { text?: string }) {
  if (!text) return null
  const ok = text.includes('✓')
  const Ico = ok ? CheckCircle2 : AlertCircle
  return <span className={'msg ' + (ok ? 'ok' : 'err')}><Ico size={16} className="i" />{text.replace('✓', '').trim()}</span>
}

export function Alert({ text }: { text?: string }) {
  if (!text) return null
  return <div className="alert"><AlertCircle size={18} className="i" />{text}</div>
}

export function Stat({ icon: Ico, label, value, tone = '', onClick, active }: {
  icon: LucideIcon; label: string; value: ReactNode; tone?: string; onClick?: () => void; active?: boolean
}) {
  return (
    <div className={'card stat-tile' + (onClick ? ' clickable' : '') + (active ? ' on' : '')} onClick={onClick}>
      <div className={'stat-ico ' + tone}><Ico size={20} /></div>
      <div><div className="stat-label">{label}</div><div className="stat">{value}</div></div>
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div className="search"><Search size={16} /><input placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} /></div>
}

export function Empty({ icon: Ico, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return <div className="empty"><Ico size={36} /><div style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{title}</div>{children && <p>{children}</p>}</div>
}

export const initials = (n?: string | null) =>
  (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('')

export function PriorityBadge({ p }: { p: string }) {
  return <span className={'pri ' + p}><i />{p}</span>
}

export interface Option { value: string; label: string; hint?: string }
export const opts = (arr: string[]): Option[] => arr.map((v) => ({ value: v, label: v }))

/** The one dropdown used across the whole app (replaces native <select>). Search appears automatically for long lists; `hint` shows a count/detail on the right. */
export function Select({ value, onChange, options, placeholder = 'Select…', block, disabled, searchable }: {
  value: string; onChange: (v: string) => void; options: Option[]; placeholder?: string; block?: boolean; disabled?: boolean; searchable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ left: 0, top: 0, bottom: 0, width: 0, up: false })
  const [hi, setHi] = useState(-1)
  const [q, setQ] = useState('')
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const typed = useRef({ text: '', t: 0 })
  const sel = options.find((o) => o.value === value)
  const withSearch = searchable ?? options.length > 8
  const list = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options

  const show = () => {
    const r = btn.current!.getBoundingClientRect()
    const below = window.innerHeight - r.bottom
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 248)), top: r.bottom + 6, bottom: window.innerHeight - r.top + 6, width: Math.max(r.width, 210), up: below < 300 && r.top > below })
    setQ(''); setHi(options.findIndex((o) => o.value === value)); setOpen(true)
  }
  const pick = (v: string) => { onChange(v); setOpen(false); btn.current?.focus() }

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { const t = e.target as Node; if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false) }
    const close = (e: Event) => { if (!pop.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', down); window.addEventListener('scroll', close, true); window.addEventListener('resize', close)
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [open])
  useEffect(() => { if (open && hi >= 0) pop.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' }) }, [hi, open])
  useEffect(() => { if (open && withSearch) setTimeout(() => pop.current?.querySelector('input')?.focus(), 0) }, [open, withSearch])

  const key = (e: React.KeyboardEvent) => {
    if (!open) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show() } return }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btn.current?.focus() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter' && hi >= 0 && list[hi]) { e.preventDefault(); pick(list[hi].value) }
    else if (e.key === 'Tab') setOpen(false)
    else if (!withSearch && e.key.length === 1) {          // type-ahead: jump to the first option starting with what you type
      const now = Date.now(); const ty = typed.current
      ty.text = now - ty.t > 700 ? e.key.toLowerCase() : ty.text + e.key.toLowerCase(); ty.t = now
      const i = list.findIndex((o) => o.label.toLowerCase().startsWith(ty.text)); if (i >= 0) setHi(i)
    }
  }

  return (
    <>
      <button type="button" ref={btn} className={'sel-btn' + (block ? ' block' : '')} disabled={disabled} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())} onKeyDown={key}>
        <span className={sel ? '' : 'ph'}>{sel ? sel.label : placeholder}</span>
        <ChevronDown size={16} className="i sel-chev" />
      </button>
      {open && createPortal(
        <div ref={pop} className={'sel-pop' + (pos.up ? ' up' : '')} role="listbox" onKeyDown={key}
          style={{ left: pos.left, width: pos.width, ...(pos.up ? { bottom: pos.bottom } : { top: pos.top }) }}>
          {withSearch && (
            <div className="sel-search"><Search size={14} /><input placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setHi(0) }} /></div>
          )}
          <div className="sel-list">
            {list.map((o, i) => (
              <div key={o.value} data-i={i} role="option" aria-selected={o.value === value}
                className={'sel-opt' + (i === hi ? ' hi' : '') + (o.value === value ? ' on' : '')}
                onMouseEnter={() => setHi(i)} onClick={() => pick(o.value)}>
                <span className="sel-check">{o.value === value && <Check size={14} />}</span>
                <span className="sel-label">{o.label}</span>
                {o.hint != null && <span className="sel-hint">{o.hint}</span>}
              </div>
            ))}
            {!list.length && <div className="sel-opt muted">No matches</div>}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

/** Numbers are always a plain text input (no spinner arrows). Returns null when empty. */
export function NumberInput({ value, onChange, placeholder, disabled }: {
  value: number | null | undefined; onChange: (n: number | null) => void; placeholder?: string; disabled?: boolean
}) {
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => {
    const parsed = text.trim() === '' || text === '-' || text === '.' ? null : Number(text)
    if ((parsed ?? null) !== (value ?? null)) setText(value == null ? '' : String(value))
  }, [value])
  return (
    <input inputMode="decimal" value={text} placeholder={placeholder} disabled={disabled}
      onChange={(e) => {
        const t = e.target.value
        if (!/^-?\d*\.?\d*$/.test(t)) return
        setText(t)
        onChange(t === '' || t === '-' || t === '.' ? null : Number(t))
      }} />
  )
}

const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fromIso = (v: string) => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d) }
const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

/** The one date picker used across the whole app (replaces native <input type="date">). Value is YYYY-MM-DD or ''. */
export function DatePicker({ value, onChange, placeholder = 'Select date', block = true, disabled, clearable = true }: {
  value: string | null | undefined; onChange: (v: string) => void; placeholder?: string; block?: boolean; disabled?: boolean; clearable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => (value ? fromIso(value) : new Date()))
  const [pos, setPos] = useState({ left: 0, top: 0, bottom: 0, up: false })
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)

  const show = () => {
    const r = btn.current!.getBoundingClientRect()
    const up = window.innerHeight - r.bottom < 340 && r.top > window.innerHeight - r.bottom
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 296)), top: r.bottom + 4, bottom: window.innerHeight - r.top + 4, up })
    setView(value ? fromIso(value) : new Date())
    setOpen(true)
  }
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { const t = e.target as Node; if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false) }
    const close = (e: Event) => { if (!pop.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', down); document.addEventListener('keydown', esc)
    window.addEventListener('scroll', close, true); window.addEventListener('resize', close)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', esc); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [open])

  const y = view.getFullYear(), m = view.getMonth()
  const first = new Date(y, m, 1)
  const start = new Date(y, m, 1 - ((first.getDay() + 6) % 7))
  const cells = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  const todayIso = toIso(new Date())
  const go = (dm: number) => setView(new Date(y, m + dm, 1))
  const pick = (v: string) => { onChange(v); setOpen(false); btn.current?.focus() }
  const label = value ? fromIso(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

  return (
    <>
      <button type="button" ref={btn} className={'sel-btn' + (block ? ' block' : '')} disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? setOpen(false) : show())}>
        <span className={label ? '' : 'ph'}>{label || placeholder}</span>
        <Calendar size={16} className="i" />
      </button>
      {open && createPortal(
        <div ref={pop} className="dp-pop" role="dialog" style={{ left: pos.left, ...(pos.up ? { bottom: pos.bottom } : { top: pos.top }) }}>
          <div className="dp-head">
            <button type="button" className="ghost icon sm" aria-label="Previous year" onClick={() => go(-12)}><ChevronsLeft size={16} /></button>
            <button type="button" className="ghost icon sm" aria-label="Previous month" onClick={() => go(-1)}><ChevronLeft size={16} /></button>
            <b>{view.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</b>
            <button type="button" className="ghost icon sm" aria-label="Next month" onClick={() => go(1)}><ChevronRight size={16} /></button>
            <button type="button" className="ghost icon sm" aria-label="Next year" onClick={() => go(12)}><ChevronsRight size={16} /></button>
          </div>
          <div className="dp-grid">
            {DOW.map((d) => <span key={d} className="dp-dow">{d}</span>)}
            {cells.map((d) => {
              const v = toIso(d)
              return <button type="button" key={v} className={'dp-day' + (d.getMonth() !== m ? ' out' : '') + (v === todayIso ? ' today' : '') + (v === value ? ' on' : '')} onClick={() => pick(v)}>{d.getDate()}</button>
            })}
          </div>
          <div className="dp-foot">
            <button type="button" className="ghost sm" onClick={() => pick(todayIso)}>Today</button>
            {clearable && value && <button type="button" className="ghost sm" onClick={() => pick('')}><X size={14} />Clear</button>}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

/** Client-side paging. Pass a `resetKey` (e.g. JSON of the filters) so the table returns to page 1 when filters change. */
export function usePaged<T>(rows: T[], resetKey: string, initial = 25) {
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(initial)
  useEffect(() => { setPage(1) }, [resetKey, size])
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const cur = Math.min(page, pages)
  return { rows: rows.slice((cur - 1) * size, cur * size), pager: { page: cur, pages, size, total: rows.length, setPage, setSize } }
}
export type Pager = ReturnType<typeof usePaged>['pager']

export function Pagination({ pager }: { pager: Pager }) {
  const { page, pages, size, total, setPage, setSize } = pager
  if (!total) return null
  const nums: (number | '…')[] = []
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…')
  return (
    <div className="pager">
      <span className="muted sm-text">{(page - 1) * size + 1}–{Math.min(page * size, total)} of {total}</span>
      <div className="pager-nav">
        <button className="icon sm" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={15} /></button>
        {nums.map((n, i) => n === '…' ? <span key={'e' + i} className="muted">…</span>
          : <button key={n} className={'sm' + (n === page ? ' primary' : ' ghost')} onClick={() => setPage(n)}>{n}</button>)}
        <button className="icon sm" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={15} /></button>
      </div>
      <div className="row" style={{ gap: '.4rem' }}>
        <span className="muted sm-text">Rows</span>
        <Select value={String(size)} onChange={(v) => setSize(Number(v))} options={['10', '25', '50', '100'].map((v) => ({ value: v, label: v }))} />
      </div>
    </div>
  )
}

/** A button that opens a small list of choices (e.g. "Remind" > Wayne / Reagan / Harvard). */
export function Menu({ label, icon: Ico, options, onPick, primary, disabled }: {
  label: string; icon?: LucideIcon; options: Option[]; onPick: (v: string) => void; primary?: boolean; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ left: 0, top: 0, bottom: 0, up: false })
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { const t = e.target as Node; if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false) }
    const close = () => setOpen(false)
    document.addEventListener('mousedown', down); window.addEventListener('scroll', close, true); window.addEventListener('resize', close)
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [open])
  const show = () => {
    const r = btn.current!.getBoundingClientRect()
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 216)), top: r.bottom + 6, bottom: window.innerHeight - r.top + 6, up: window.innerHeight - r.bottom < 220 })
    setOpen(true)
  }
  return (
    <>
      <button type="button" ref={btn} className={'sm' + (primary ? ' primary' : '')} disabled={disabled || !options.length} title={!options.length ? 'Nobody to choose yet' : undefined} onClick={() => (open ? setOpen(false) : show())}>
        {Ico && <Ico size={14} />}{label}<ChevronDown size={13} />
      </button>
      {open && createPortal(
        <div ref={pop} className={'sel-pop' + (pos.up ? ' up' : '')} style={{ left: pos.left, width: 210, ...(pos.up ? { bottom: pos.bottom } : { top: pos.top }) }}>
          <div className="sel-list">
            {options.map((o) => (
              <div key={o.value} className="sel-opt" onClick={() => { setOpen(false); onPick(o.value) }}>
                <span className="sel-label">{o.label}</span>{o.hint != null && <span className="sel-hint">{o.hint}</span>}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
