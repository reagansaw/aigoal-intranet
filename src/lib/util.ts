export const iso = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}
export const today = () => iso(new Date())
export const monthStart = (d: Date | string) => {
  const x = typeof d === 'string' ? new Date(d + 'T00:00:00') : d
  return iso(new Date(x.getFullYear(), x.getMonth(), 1))
}
export const addDays = (s: string, n: number) => {
  const d = new Date(s + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return iso(d)
}
export const addMonths = (s: string, n: number) => {
  const d = new Date(s + 'T00:00:00')
  return iso(new Date(d.getFullYear(), d.getMonth() + n, 1))
}
export const monthLabel = (s: string) =>
  new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
export const dayLabel = (s: string) =>
  new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
export const money = (n: number, cur = 'RM') =>
  `${cur}${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((x) => x.trim())) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim())) rows.push(row)
  return rows
}
