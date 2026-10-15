import { useEffect, useMemo, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fieldLabel, when, type AuditEntry } from '../lib/audit'
import { ChangeText } from '../components/AuditTrail'
import { Empty, PageHeader, Pagination, SearchBox, Select, opts, usePaged } from '../components/ui'

const WHAT = { purchase_accounts: 'Account', customers: 'Customer' } as Record<string, string>

export default function AuditLog() {
  const [rows, setRows] = useState<AuditEntry[]>([])
  const [q, setQ] = useState('')
  const [table, setTable] = useState('all')
  const [field, setField] = useState('all')
  const [who, setWho] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('audit_log').select('*').order('changed_at', { ascending: false }).limit(2000)
      .then(({ data }) => { setRows((data ?? []) as AuditEntry[]); setLoading(false) })
  }, [])

  const people = useMemo(() => [...new Set(rows.map((r) => r.changed_by_name))], [rows])
  const fields = useMemo(() => [...new Set(rows.filter((r) => table === 'all' || r.table_name === table).map((r) => r.field).filter(Boolean))] as string[], [rows, table])
  const shown = rows.filter((r) =>
    (table === 'all' || r.table_name === table) && (field === 'all' || r.field === field) && (who === 'all' || r.changed_by_name === who) &&
    (!q || [r.record_label, r.old_value, r.new_value].join(' ').toLowerCase().includes(q.toLowerCase())))
  const { rows: pageRows, pager } = usePaged(shown, JSON.stringify([q, table, field, who]))

  return (
    <>
      <PageHeader title="Audit Log" sub="Every change to purchase accounts and customers: what changed, who changed it, and when.">
        <SearchBox value={q} onChange={setQ} placeholder="Search name or text…" />
        <Select value={table} onChange={(v) => { setTable(v); setField('all') }} options={[{ value: 'all', label: 'Accounts and customers' }, { value: 'purchase_accounts', label: 'Purchase accounts' }, { value: 'customers', label: 'Customers' }]} />
        <Select value={field} onChange={setField} options={[{ value: 'all', label: 'All fields' }, ...fields.map((f) => ({ value: f, label: fieldLabel(f) }))]} />
        <Select value={who} onChange={setWho} options={[{ value: 'all', label: 'Everyone' }, ...opts(people)]} />
      </PageHeader>
      <div className="card flush table-wrap">
        <table>
          <thead><tr><th>When</th><th>Who</th><th>Record</th><th>Field</th><th>Change</th></tr></thead>
          <tbody>
            {pageRows.map((e) => (
              <tr key={e.id}>
                <td className="nowrap muted">{when(e.changed_at)}</td>
                <td className="cell-title nowrap">{e.changed_by_name}</td>
                <td><div className="cell-title">{e.record_label}</div><div className="muted sm-text">{WHAT[e.table_name] ?? e.table_name}</div></td>
                <td>{e.field ? <span className="tag brand">{fieldLabel(e.field)}</span> : <span className="tag">{e.action}</span>}</td>
                <td style={{ maxWidth: 520 }}><ChangeText e={e} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !shown.length && <Empty icon={ScrollText} title="No changes recorded yet">Edits to accounts and customers will show up here.</Empty>}
        <Pagination pager={pager} />
      </div>
    </>
  )
}
