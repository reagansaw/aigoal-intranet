import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { parseCsv } from '../lib/util'
import { Msg } from './ui'

/** Reads a CSV (header row required, e.g. exported from Google Sheets) and returns rows as objects. */
export default function CsvImport({ onRows, label = 'Import CSV' }: { onRows: (rows: Record<string, string>[]) => Promise<string | void>; label?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const pick = async (file?: File) => {
    if (!file) return
    const grid = parseCsv(await file.text())
    if (grid.length < 2) return setMsg('File has no data rows.')
    const head = grid[0].map((h) => h.trim())
    const rows = grid.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])))
    setMsg((await onRows(rows)) || `Imported ${rows.length} rows ✓`)
    if (ref.current) ref.current.value = ''
  }
  return (
    <span className="row">
      <input ref={ref} type="file" accept=".csv" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <button onClick={() => ref.current?.click()}><Upload size={16} />{label}</button>
      <Msg text={msg} />
    </span>
  )
}
