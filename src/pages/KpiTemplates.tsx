import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Band, KpiItem, KpiTemplate } from '../lib/types'

const bandsToText = (b: Band[]) => b.map((x) => `${x.threshold}:${x.points}`).join(', ')
const textToBands = (t: string): Band[] =>
  t.split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
    const [threshold, points] = p.split(':').map(Number)
    return { threshold, points }
  }).filter((b) => !Number.isNaN(b.threshold) && !Number.isNaN(b.points))
const num = (v: string) => (v === '' ? null : Number(v))

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
      <div className="row between"><h1>KPI Templates</h1><button className="primary" onClick={newTemplate}>+ New template</button></div>
      <p className="muted">Design the PDR scorecards. Auto-scoring uses “bands” (threshold:points). Each month, HR/Admin picks a template per staff.</p>
      <div className="tabs">{list.map((t) => <button key={t.id} className={sel?.id === t.id ? 'on' : ''} onClick={() => open(t)}>{t.name}{!t.active && ' (off)'}</button>)}</div>

      {sel && (
        <>
          <div className="card">
            <div className="form-grid">
              <div className="field"><label>Name</label><input value={sel.name} onChange={(e) => setT('name', e.target.value)} /></div>
              <div className="field"><label>Currency</label><input value={sel.currency} onChange={(e) => setT('currency', e.target.value)} /></div>
              <div className="field"><label>Fixed monthly fee</label><input type="number" value={sel.base_fee} onChange={(e) => setT('base_fee', Number(e.target.value))} /></div>
              <div className="field"><label>Bonus per base point</label><input type="number" value={sel.rate_per_point} onChange={(e) => setT('rate_per_point', Number(e.target.value))} /></div>
              <div className="field"><label>Base bonus cap (blank = none)</label><input type="number" value={sel.max_base_bonus ?? ''} onChange={(e) => setT('max_base_bonus', num(e.target.value))} /></div>
              <div className="field"><label>Min score to unlock extra bonus</label><input type="number" value={sel.qualify_score} onChange={(e) => setT('qualify_score', Number(e.target.value))} /></div>
              <div className="field"><label>Commission rate (0.10 = 10%)</label><input type="number" step="0.01" value={sel.commission_rate} onChange={(e) => setT('commission_rate', Number(e.target.value))} /></div>
              <div className="field"><label>Deals with no commission each month</label><input type="number" value={sel.commission_free_deals} onChange={(e) => setT('commission_free_deals', Number(e.target.value))} /></div>
            </div>
            <div className="field"><label>Description / rules summary</label><textarea value={sel.description ?? ''} onChange={(e) => setT('description', e.target.value)} /></div>
            <label className="row"><input type="checkbox" checked={sel.active} onChange={(e) => setT('active', e.target.checked)} /> Active (available for new scorecards)</label>
          </div>

          <div className="card table-wrap">
            <h2>Scorecard rows</h2>
            <table>
              <thead><tr><th>Name</th><th>Standard (text)</th><th>Max pts</th><th>Target</th><th>Unit</th><th>Scoring</th><th>Bands (threshold:points, …)</th><th>% of target?</th><th>Bonus at %</th><th>Bonus amt</th><th></th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td><input value={i.name} onChange={(e) => setI(i.id, 'name', e.target.value)} /></td>
                    <td><textarea style={{ minHeight: 50, minWidth: 200 }} value={i.standard ?? ''} onChange={(e) => setI(i.id, 'standard', e.target.value)} /></td>
                    <td><input type="number" value={i.max_points} onChange={(e) => setI(i.id, 'max_points', Number(e.target.value))} /></td>
                    <td><input type="number" value={i.target ?? ''} onChange={(e) => setI(i.id, 'target', num(e.target.value))} /></td>
                    <td><input value={i.unit ?? ''} onChange={(e) => setI(i.id, 'unit', e.target.value)} /></td>
                    <td><select value={i.direction} onChange={(e) => setI(i.id, 'direction', e.target.value)}><option value="higher">Higher is better</option><option value="lower">Lower is better</option><option value="manual">Manual</option></select></td>
                    <td><input value={bandText[i.id] ?? ''} onChange={(e) => setBandText({ ...bandText, [i.id]: e.target.value })} placeholder="100:25, 95:20" /></td>
                    <td><input type="checkbox" checked={i.pct_of_target} onChange={(e) => setI(i.id, 'pct_of_target', e.target.checked)} /></td>
                    <td><input type="number" value={i.bonus_threshold_pct ?? ''} onChange={(e) => setI(i.id, 'bonus_threshold_pct', num(e.target.value))} /></td>
                    <td><input type="number" value={i.bonus_amount ?? ''} onChange={(e) => setI(i.id, 'bonus_amount', num(e.target.value))} /></td>
                    <td><button className="sm danger" onClick={() => delItem(i.id)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={addItem} style={{ marginTop: '.5rem' }}>+ Add row</button>
            <p className="muted">“Higher”: highest band whose threshold ≤ achieved wins. “Lower”: lowest band whose threshold ≥ achieved wins (e.g. CPL). With “% of target” thresholds are compared to achieved ÷ target.</p>
          </div>
          <div className="row">
            <button className="primary" onClick={save}>Save template</button>
            <button onClick={duplicate}>Duplicate</button>
            <button className="danger" onClick={remove}>Delete</button>
            <span className={msg.includes('✓') ? 'ok' : 'err'}>{msg}</span>
          </div>
        </>
      )}
    </>
  )
}
