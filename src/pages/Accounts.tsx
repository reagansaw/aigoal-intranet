import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, BadgeCheck, MessageSquareQuote, Pencil, Plus, ReceiptText, Save, Trash2, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import Modal from '../components/Modal'
import { DatePicker, Empty, PageHeader, SearchBox, Select, Stat, opts } from '../components/ui'
import type { PurchaseAccount } from '../lib/types'

const IN_USE = [{ value: '', label: 'Unknown' }, { value: 'Y', label: 'Yes, in use' }, { value: 'P', label: 'Partially' }, { value: 'N', label: 'Not using' }]
const STAGES = [{ value: '', label: 'Not set' }, { value: '1', label: 'Stage 1' }, { value: '2', label: 'Stage 2' }, { value: '3', label: 'Stage 3' }]
const MILESTONES: [keyof PurchaseAccount, string][] = [
  ['opened_by', 'Account opened by (开户)'], ['coaching_1', 'Coaching 1'], ['docs_provided', 'Docs provided (资料提供)'],
  ['chatbot_done', 'Chat bot done'], ['landing_page_done', 'Landing page done'], ['coaching_2', 'Coaching 2'],
  ['optimised', 'Optimised (优化完成)'], ['final_coaching', 'Final coaching'], ['maintenance', 'Maintenance'],
]
const blank: Partial<PurchaseAccount> = { product: 'AIGOAL', account_name: '', testimonial: false }
const useLabel = (v: string | null) => IN_USE.find((o) => o.value === (v ?? ''))?.label ?? v

export default function Accounts() {
  const { isManager } = useAuth()
  const [rows, setRows] = useState<PurchaseAccount[]>([])
  const [q, setQ] = useState('')
  const [stage, setStage] = useState('all')
  const [use, setUse] = useState('all')
  const [sales, setSales] = useState('all')
  const [edit, setEdit] = useState<Partial<PurchaseAccount> | null>(null)
  const [err, setErr] = useState('')

  const load = async () => {
    const { data } = await supabase.from('purchase_accounts').select('*').order('purchase_date', { ascending: false, nullsFirst: false }).limit(5000)
    setRows((data ?? []) as PurchaseAccount[])
  }
  useEffect(() => { load() }, [])

  const salesList = useMemo(() => [...new Set(rows.map((r) => r.sales).filter(Boolean))] as string[], [rows])
  const shown = rows.filter((r) =>
    (stage === 'all' || (r.onboarding_stage ?? '') === stage) && (use === 'all' || (r.in_use ?? '') === use) && (sales === 'all' || r.sales === sales) &&
    (!q || [r.account_name, r.contact_person, r.phone, r.email, r.industry, r.remarks, r.action_plan].join(' ').toLowerCase().includes(q.toLowerCase())))

  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!edit) return
    const { id, ...rest } = edit as PurchaseAccount
    const payload = { ...rest, purchase_date: rest.purchase_date || null, deadline: rest.deadline || null, updated_at: new Date().toISOString() }
    const { error } = id ? await supabase.from('purchase_accounts').update(payload).eq('id', id) : await supabase.from('purchase_accounts').insert(payload)
    if (error) return setErr(error.message)
    setEdit(null); setErr(''); load()
  }
  const del = async () => {
    if (edit?.id && confirm('Delete this account?')) { await supabase.from('purchase_accounts').delete().eq('id', edit.id); setEdit(null); load() }
  }
  const set = (k: keyof PurchaseAccount, v: any) => setEdit({ ...edit, [k]: v })
  const txt = (k: keyof PurchaseAccount, label: string, area = false) => (
    <div className="field"><label>{label}</label>
      {area ? <textarea value={(edit?.[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} /> : <input value={(edit?.[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} />}
    </div>
  )

  return (
    <>
      <PageHeader title="Purchase Accounts" sub="Customers who bought AIGOAL and where they are in onboarding.">
        <button className="primary" onClick={() => { setEdit({ ...blank }); setErr('') }}><Plus size={16} />Add account</button>
      </PageHeader>
      <div className="grid">
        <Stat icon={Users} label="Total accounts" value={rows.length} />
        <Stat icon={BadgeCheck} tone="green" label="In use" value={rows.filter((r) => r.in_use === 'Y').length} />
        <Stat icon={AlertTriangle} tone="orange" label="With open issues" value={rows.filter((r) => r.issues).length} />
        <Stat icon={MessageSquareQuote} tone="yellow" label="Testimonials" value={rows.filter((r) => r.testimonial).length} />
      </div>
      <div className="row" style={{ marginBottom: '1rem' }}>
        <SearchBox value={q} onChange={setQ} placeholder="Search name, phone, industry, notes…" />
        <Select value={stage} onChange={setStage} options={[{ value: 'all', label: 'All stages' }, ...STAGES.slice(1)]} />
        <Select value={use} onChange={setUse} options={[{ value: 'all', label: 'Any usage' }, ...IN_USE]} />
        <Select value={sales} onChange={setSales} options={[{ value: 'all', label: 'All sales' }, ...opts(salesList)]} />
        <span className="muted sm-text">{shown.length} shown</span>
      </div>
      <div className="card flush table-wrap">
        <table>
          <thead><tr><th>Account</th><th>Contact</th><th>Industry</th><th>Purchased</th><th>Stage</th><th>In use</th><th>Sales</th><th>Issue / next action</th><th>Deadline</th><th></th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="click" onClick={() => { setEdit(r); setErr('') }}>
                <td><div className="cell-title">{r.account_name}</div><div className="muted sm-text">{r.category}</div></td>
                <td>{r.contact_person}<div className="muted sm-text">{r.phone && <a href={`https://wa.me/${r.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{r.phone}</a>}</div></td>
                <td>{r.industry}</td><td className="nowrap">{r.purchase_date}</td>
                <td className="nowrap">{r.onboarding_stage && <span className="tag brand">Stage {r.onboarding_stage}</span>}</td>
                <td>{r.in_use && <span className={'tag ' + (r.in_use === 'Y' ? 'good' : r.in_use === 'N' ? 'warn' : '')}>{useLabel(r.in_use)}</span>}</td>
                <td>{r.sales ?? r.closed_by}</td>
                <td style={{ maxWidth: 320 }}>{r.issues && <div className="cell-title">{r.issues}</div>}<div className="muted sm-text pre">{r.action_plan}</div></td>
                <td className="nowrap">{r.deadline}</td>
                <td><Pencil size={15} className="i" style={{ color: 'var(--muted)' }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <Empty icon={ReceiptText} title="No accounts found">Try clearing the filters.</Empty>}
      </div>

      {edit && (
        <Modal title={edit.id ? edit.account_name || 'Account' : 'Add account'} onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            <h2>Account</h2>
            <div className="form-grid">
              <div className="field"><label>System / company name</label><input required value={edit.account_name ?? ''} onChange={(e) => set('account_name', e.target.value)} /></div>
              {txt('contact_person', 'Contact person')}{txt('phone', 'Phone')}{txt('email', 'Register email')}{txt('industry', 'Industry')}{txt('category', 'Category')}
              <div className="field"><label>Purchase date</label><DatePicker value={edit.purchase_date ?? ''} onChange={(v) => set('purchase_date', v)} /></div>
              {txt('closed_by', 'Closed via (成交)')}{txt('sales', 'Sales')}
              <div className="field"><label>Onboarding stage</label><Select block value={edit.onboarding_stage ?? ''} onChange={(v) => set('onboarding_stage', v || null)} options={STAGES} /></div>
              <div className="field"><label>In use</label><Select block value={edit.in_use ?? ''} onChange={(v) => set('in_use', v || null)} options={IN_USE} /></div>
              {txt('ai_builder', 'AI builder')}{txt('ai_builder_2', 'AI builder 2')}{txt('whatsapp_group', 'WhatsApp group link')}
            </div>
            <label className="check" style={{ marginBottom: '1rem' }}><input type="checkbox" checked={edit.testimonial ?? false} onChange={(e) => set('testimonial', e.target.checked)} />Testimonial received</label>

            <h2>Follow-up</h2>
            <div className="form-grid">{txt('remarks', 'Remarks', true)}{txt('issues', 'Issues', true)}{txt('action_plan', 'Action plan', true)}
              <div className="field"><label>Deadline</label><DatePicker value={edit.deadline ?? ''} onChange={(v) => set('deadline', v)} /></div>
            </div>

            <h2>Onboarding timeline</h2>
            <div className="form-grid">{MILESTONES.map(([k, l]) => txt(k, l))}</div>
            {err && <div className="alert">{err}</div>}
            <div className="modal-foot">
              <button className="primary"><Save size={16} />Save</button>
              {edit.id && isManager && <button type="button" className="danger" onClick={del}><Trash2 size={16} />Delete</button>}
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
