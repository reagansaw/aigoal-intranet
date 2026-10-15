import { useEffect, useState } from 'react'
import { ArrowRight, History } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fieldLabel, STATUS_LABELS, when, type AuditEntry } from '../lib/audit'
const ISO = /^\d{4}-\d\d-\d\dT/

export function ChangeText({ e }: { e: AuditEntry }) {
  if (e.action === 'insert') return <span className="muted">Created this record</span>
  if (e.action === 'delete') return <span className="muted">Deleted this record</span>
  const v = (x: string | null) => (x === null || x === '' ? <i className="muted">empty</i> : x === 'true' ? 'Yes' : x === 'false' ? 'No' : ISO.test(x) ? when(x) : STATUS_LABELS[x] ?? x)
  return (
    <span className="audit-diff">
      <span className="audit-old pre">{v(e.old_value)}</span><ArrowRight size={14} className="i" /><span className="audit-new pre">{v(e.new_value)}</span>
    </span>
  )
}

/** Who changed what, newest first, for one record. */
export default function AuditTrail({ table, recordId, refreshKey }: { table: string; recordId: string; refreshKey?: number }) {
  const [rows, setRows] = useState<AuditEntry[] | null>(null)
  useEffect(() => {
    supabase.from('audit_log').select('*').eq('table_name', table).eq('record_id', recordId).order('changed_at', { ascending: false }).limit(200)
      .then(({ data }) => setRows((data ?? []) as AuditEntry[]))
  }, [table, recordId, refreshKey])

  return (
    <div className="audit">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}><History size={17} className="i" />Change history</h2>
      {rows === null && <p className="muted sm-text">Loading…</p>}
      {rows?.length === 0 && <p className="muted sm-text">No changes recorded yet. Edits from now on will appear here with who made them.</p>}
      {rows?.map((e) => (
        <div key={e.id} className="audit-row">
          <div className="audit-meta"><b>{e.changed_by_name}</b><span className="muted sm-text">{when(e.changed_at)}</span></div>
          <div>{e.field && <span className="tag brand" style={{ marginRight: '.5rem' }}>{fieldLabel(e.field)}</span>}<ChangeText e={e} /></div>
        </div>
      ))}
    </div>
  )
}
