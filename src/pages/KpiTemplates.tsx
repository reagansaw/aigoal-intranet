import { useEffect, useState } from 'react'
import { Copy, Plus, Save, Trash2 } from 'lucide-react'
import { Msg, NumberInput, PageHeader, Select } from '../components/ui'
import { supabase } from '../lib/supabase'
import type { Band, KpiItem, KpiTemplate } from '../lib/types'

const bandsToText = (b: Band[]) => b.map((x) => `${x.threshold}:${x.points}`).join(', ')
const textToBands = (t: string): Band[] =>
  t.split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
    const [threshold, points] = p.split(':').map(Number)
    return { threshold, points }
  }).filter((b) => !Number.isNaN(b.threshold) && !Number.isNaN(b.points))
const DIR = [{ value: 'higher', label: 'Higher is better' }, { value: 'lower', label: 'Lower is better' }, { value: 'manual', label: 'Manual score' }]

export default function KpiTemplates() {
  const [list, setList] = useState<KpiTemplate[]>([])
  const [sel, setSel] = useState<KpiTemplate | null>(null)
  const [items, setItems] = useState<KpiItem[]>([])
  const [bandText, setBandText] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState('')

  const loadList = async () => {
    const { data } = await supabase.from('kpi_templates').select('*').order('name')
    setList((data ?? []) as KpiTemplate[])
  }
  const open = async (t: KpiTemplate) => {
    setSel(t); setMsg('')
    const { data } = await supabase.from('kpi_items').select('*').eq('template_id', t.id).order('sort')
    const it = (data ?? []) as KpiItem[]
    setItems(it)
    setBandText(Object.fromEntries(it.map((i) => [i.id, bandsToText(i.bands)])))
  }
  useEffect(() => { loadList() }, [])

  const newTemplate = async () => {
    const { data } = await supabase.from('kpi_templates').insert({ name: 'New template' }).select().single()
    await loadList(); if (data) open(data as KpiTemplate)
  }
  const duplicate = async () => {
    if (!sel) return
    const { id, created_at, ...rest } = sel as any
    const { data: nt } = await supabase.from('kpi_templates').insert({ ...rest, name: sel.name + ' (copy)' }).select().single()
    if (nt) {
      await supabase.from('kpi_items').insert(items.map(({ id: _i, template_id: _t, ...r }) => ({ ...r, template_id: nt.id })))
      await loadList(); open(nt as KpiTemplate)
    }
  }
  const remove = async () => {
    if (!sel || !confirm(`Delete “${sel.name}”? Existing scorecards using it will block deletion.`)) return
    const { error } = await supabase.from('kpi_templates').delete().eq('id', sel.id)
    if (error) return setMsg('Cannot delete — it is used by scorecards. Untick “Active” instead.')
    setSel(null); loadList()
  }
  const save = async () => {
    if (!sel) return
    const { id, created_at, ...t } = sel as any
    const e1 = (await supabase.from('kpi_templates').update(t).eq('id', sel.id)).error
    const rows = items.map((i, n) => ({ ...i, sort: n + 1, bands: textToBands(bandText[i.id] ?? '') }))
    const e2 = (await supabase.from('kpi_items').upsert(rows)).error
    setMsg(e1?.message || e2?.message || 'Saved ✓'); loadList()
  }
  const addItem = async () => {
    if (!sel) return
    const { data } = await supabase.from('kpi_items').insert({ template_id: sel.id, name: 'New item', sort: items.length + 1, max_points: 10, direction: 'manual' }).select().single()
    if (data) { setItems([...items, data as KpiItem]); setBandText({ ...bandText, [data.id]: '' }) }
  }
  const delItem = async (id: string) => { await supabase.from('kpi_items').delete().eq('id', id); setItems(items.filter((i) => i.id !== id)) }
  const setT = (k: keyof KpiTemplate, v: any) => setSel(sel && { ...sel, [k]: v })
  const setI = (id: string, k: keyof KpiItem, v: any) => setItems(items.map((i) => (i.id === id ? { ...i, [k]: v } : i)))

  return (
    <>
      <PageHeader title="KPI Templates" sub="Design the PDR scorecards. Each month HR/Admin picks a template per staff.">
        <button className="primary" onClick={newTemplate}><Plus size={16} />New template</button>
      </PageHeader>
      <div className="tabs">{list.map((t) => <button key={t.id} className={sel?.id === t.id ? 'on' : ''} onClick={() => open(t)}>{t.name}{!t.active && ' (off)'}</button>)}</div>

      {sel && (
        <>
          <div className="card">
            <div className="form-grid">
              <div className="field"><label>Name</label><input value={sel.name} onChange={(e) => setT('name', e.target.value)} /></div>
              <div className="field"><label>Currency</label><input value={sel.currency} onChange={(e) => setT('currency', e.target.value)} /></div>
              <div className="field"><label>Fixed monthly fee</label><NumberInput value={sel.base_fee} onChange={(n) => setT('base_fee', n ?? 0)} /></div>
              <div className="field"><label>Bonus per base point</label><NumberInput value={sel.rate_per_point} onChange={(n) => setT('rate_per_point', n ?? 0)} /></div>
              <div className="field"><label>Base bonus cap (blank = none)</label><NumberInput value={sel.max_base_bonus} onChange={(n) => setT('max_base_bonus', n)} /></div>
              <div className="field"><label>Min score to unlock extra bonus</label><NumberInput value={sel.qualify_score} onChange={(n) => setT('qualify_score', n ?? 0)} /></div>
              <div className="field"><label>Commission rate (0.10 = 10%)</label><NumberInput value={sel.commission_rate} onChange={(n) => setT('commission_rate', n ?? 0)} /></div>
              <div className="field"><label>Deals with no commission each month</label><NumberInput value={sel.commission_free_deals} onChange={(n) => setT('commission_free_deals', n ?? 0)} /></div>
            </div>
            <div className="field"><label>Description / rules summary</label><textarea value={sel.description ?? ''} onChange={(e) => setT('description', e.target.value)} /></div>
            <label className="check"><input type="checkbox" checked={sel.active} onChange={(e) => setT('active', e.target.checked)} /> Active (available for new scorecards)</label>
          </div>

          <div className="card flush table-wrap">
            <div className="card-head"><h2>Scorecard rows</h2></div>
            <table>
              <thead><tr><th>Name</th><th>Standard (text)</th><th>Max pts</th><th>Target</th><th>Unit</th><th>Scoring</th><th>Bands (threshold:points, …)</th><th>% of target?</th><th>Bonus at %</th><th>Bonus amt</th><th></th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td><input value={i.name} onChange={(e) => setI(i.id, 'name', e.target.value)} /></td>
                    <td><textarea style={{ minHeight: 50, minWidth: 200 }} value={i.standard ?? ''} onChange={(e) => setI(i.id, 'standard', e.target.value)} /></td>
                    <td><NumberInput value={i.max_points} onChange={(n) => setI(i.id, 'max_points', n ?? 0)} /></td>
                    <td><NumberInput value={i.target} onChange={(n) => setI(i.id, 'target', n)} /></td>
                    <td><input value={i.unit ?? ''} onChange={(e) => setI(i.id, 'unit', e.target.value)} /></td>
                    <td><Select block value={i.direction} onChange={(v) => setI(i.id, 'direction', v)} options={DIR} /></td>
                    <td><input value={bandText[i.id] ?? ''} onChange={(e) => setBandText({ ...bandText, [i.id]: e.target.value })} placeholder="100:25, 95:20" /></td>
                    <td><input type="checkbox" checked={i.pct_of_target} onChange={(e) => setI(i.id, 'pct_of_target', e.target.checked)} /></td>
                    <td><NumberInput value={i.bonus_threshold_pct} onChange={(n) => setI(i.id, 'bonus_threshold_pct', n)} /></td>
                    <td><NumberInput value={i.bonus_amount} onChange={(n) => setI(i.id, 'bonus_amount', n)} /></td>
                    <td><button className="ghost icon sm danger" aria-label="Delete row" onClick={() => delItem(i.id)}><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '.8rem 1.25rem' }}><button onClick={addItem}><Plus size={16} />Add row</button>
            <p className="muted sm-text">“Higher”: highest band whose threshold ≤ achieved wins. “Lower”: lowest band whose threshold ≥ achieved wins (e.g. CPL). With “% of target” thresholds are compared to achieved ÷ target.</p></div>
          </div>
          <div className="row">
            <button className="primary" onClick={save}><Save size={16} />Save template</button>
            <button onClick={duplicate}><Copy size={16} />Duplicate</button>
            <button className="danger" onClick={remove}><Trash2 size={16} />Delete</button>
            <Msg text={msg} />
          </div>
        </>
      )}
    </>
  )
}
