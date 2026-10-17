import React, { useEffect, useMemo, useState, type FormEvent } from 'react'
import { BookOpen, Check, ChevronDown, ChevronRight, Copy, ExternalLink, FolderCog, GripVertical, Lock, Pencil, Pin, Plus, Save, Trash2 } from 'lucide-react'
import { useStaff } from '../lib/useStaff'
import { useAuth } from '../lib/auth'
import { useConfirm } from '../lib/confirm'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import { Empty, PageHeader, SearchBox, Select } from '../components/ui'
import type { KbArticle } from '../lib/types'

interface KbCategory { id: string; name: string; sort: number }
interface KbSub { id: string; category_id: string; name: string; sort: number }
/** Draft rows for the categories editor: nothing is written until Save. */
interface SubDraft { id?: string; key: string; name: string; sort: number }
interface CatDraft { id?: string; key: string; name: string; sort: number; open: boolean; subs: SubDraft[] }
let keyN = 0
const nkey = () => 'k' + ++keyN

export default function KnowledgeBase() {
  const { canEditKb, isAdmin } = useAuth()   // Admin, HR and Manager add and edit articles; only Admin deletes and sets the categories
  const ask = useConfirm()
  const staff = useStaff()
  const [rows, setRows] = useState<KbArticle[]>([])
  const [catList, setCatList] = useState<KbCategory[]>([])
  const [subList, setSubList] = useState<KbSub[]>([])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [sub, setSub] = useState('')
  const [edit, setEdit] = useState<Partial<KbArticle> | null>(null)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})   // cards showing their full content
  // categories editor
  const [draft, setDraft] = useState<CatDraft[] | null>(null)
  const [delIds, setDelIds] = useState<{ cats: string[]; subs: string[] }>({ cats: [], subs: [] })
  const [dirty, setDirty] = useState(false)
  const [catMsg, setCatMsg] = useState('')
  const [saving, setSaving] = useState(false)
  // drag-and-drop ordering: a category row, or a sub-category row inside its category
  const [drag, setDrag] = useState<{ cat: string; sub?: string } | null>(null)
  const [over, setOver] = useState<{ cat: string; sub?: string } | null>(null)
  const sameRow = (a: { cat: string; sub?: string } | null, b: { cat: string; sub?: string }) => !!a && a.cat === b.cat && a.sub === b.sub
  const reorder = <T,>(list: T[], from: number, to: number) => { const l = [...list]; const [x] = l.splice(from, 1); l.splice(to, 0, x); return l }
  const dropOn = (target: { cat: string; sub?: string }) => {
    if (!drag || sameRow(drag, target)) return
    if (!drag.sub && !target.sub) patch((d) => reorder(d, d.findIndex((c) => c.key === drag.cat), d.findIndex((c) => c.key === target.cat)))
    else if (drag.sub && target.sub && drag.cat === target.cat) patch((d) => d.map((c) => (c.key === drag.cat ? { ...c, subs: reorder(c.subs, c.subs.findIndex((s) => s.key === drag.sub), c.subs.findIndex((s) => s.key === target.sub)) } : c)))
  }
  const dragProps = (row: { cat: string; sub?: string }) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { setDrag(row); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', row.sub ?? row.cat) },
    onDragEnd: () => { setDrag(null); setOver(null) },
    onDragOver: (e: React.DragEvent) => { if (drag && !!drag.sub === !!row.sub && (!row.sub || drag.cat === row.cat)) { e.preventDefault(); setOver(row) } },
    onDragLeave: () => setOver((o) => (sameRow(o, row) ? null : o)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); dropOn(row); setDrag(null); setOver(null) },
    className: 'row kbrow' + (sameRow(drag, row) ? ' dragging' : '') + (sameRow(over, row) ? ' over' : ''),
  })

  const load = async () => {
    const [{ data: a }, { data: c }, { data: s }] = await Promise.all([
      supabase.from('kb_articles').select('*').order('pinned', { ascending: false }).order('title'),
      supabase.from('kb_categories').select('id,name,sort').order('sort').order('name'),
      supabase.from('kb_subcategories').select('*').order('sort').order('name'),
    ])
    setRows((a ?? []) as KbArticle[]); setCatList((c ?? []) as KbCategory[]); setSubList((s ?? []) as KbSub[])
  }
  useEffect(() => { load() }, [])

  const catCount = (name: string) => rows.filter((r) => r.category === name).length
  const subCount = (catName: string, name: string) => rows.filter((r) => r.category === catName && r.subcategory === name).length
  const subsOf = (catName: string) => { const c = catList.find((x) => x.name === catName); return c ? subList.filter((s) => s.category_id === c.id).map((s) => s.name) : [] }
  // tabs follow the Admin's order; a category that was removed from the list still shows while articles use it
  const cats = useMemo(() => { const used = new Set(rows.map((r) => r.category)); return [...catList.map((c) => c.name), ...[...used].filter((n) => !catList.some((c) => c.name === n))] }, [rows, catList])
  const subTabs = useMemo(() => { if (!cat) return []; const used = new Set(rows.filter((r) => r.category === cat && r.subcategory).map((r) => r.subcategory as string)); return [...subsOf(cat), ...[...used].filter((n) => !subsOf(cat).includes(n))] }, [rows, cat, catList, subList])
  const catOpts = catList.map((c) => ({ value: c.name, label: c.name }))
  const shown = rows.filter((r) => (!cat || r.category === cat) && (!sub || r.subcategory === sub) && (!q || [r.title, r.body, r.category, r.subcategory].join(' ').toLowerCase().includes(q.toLowerCase())))

  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!edit) return
    const { id, ...rest } = edit as KbArticle
    const payload = { ...rest, subcategory: rest.subcategory || null, allowed_ids: rest.visibility === 'private' ? rest.allowed_ids ?? [] : [], updated_at: new Date().toISOString() }
    const { error } = id ? await supabase.from('kb_articles').update(payload).eq('id', id) : await supabase.from('kb_articles').insert(payload)
    if (error) return setErr(error.message)
    setEdit(null); setErr(''); load()
  }
  const del = async () => { if (edit?.id && await ask('Delete this article?', { title: 'Delete article', ok: 'Delete' })) { await supabase.from('kb_articles').delete().eq('id', edit.id); setEdit(null); load() } }
  const copy = async (a: KbArticle) => { await navigator.clipboard.writeText(a.body ?? a.url ?? ''); setCopied(a.id); setTimeout(() => setCopied(''), 1500) }
  const set = (k: keyof KbArticle, v: any) => setEdit({ ...edit, [k]: v })

  // ----- categories editor (Admin) -----
  const openCats = () => {
    setDraft(catList.map((c) => ({ id: c.id, key: c.id, name: c.name, sort: c.sort, open: false, subs: subList.filter((s) => s.category_id === c.id).map((s) => ({ id: s.id, key: s.id, name: s.name, sort: s.sort })) })))
    setDelIds({ cats: [], subs: [] }); setDirty(false); setCatMsg('')
  }
  const closeCats = async () => { if (!dirty || await ask('Discard the unsaved category changes?', { title: 'Unsaved changes', ok: 'Discard', cancel: 'Keep editing' })) setDraft(null) }
  const patch = (fn: (d: CatDraft[]) => CatDraft[]) => { setDraft((d) => (d ? fn(d) : d)); setDirty(true) }
  const patchCat = (key: string, p: Partial<CatDraft>) => patch((d) => d.map((c) => (c.key === key ? { ...c, ...p } : c)))
  const patchSub = (ck: string, sk: string, p: Partial<SubDraft>) => patch((d) => d.map((c) => (c.key === ck ? { ...c, subs: c.subs.map((s) => (s.key === sk ? { ...s, ...p } : s)) } : c)))
  const removeCat = async (c: CatDraft) => {
    if (c.id && !(await ask(<>Delete the category <b>{c.name}</b>{c.subs.length ? ` and its ${c.subs.length} sub-categor${c.subs.length === 1 ? 'y' : 'ies'}` : ''}? It is removed when you Save.</>, { title: 'Delete category', ok: 'Delete' }))) return
    if (c.id) setDelIds((x) => ({ ...x, cats: [...x.cats, c.id!] }))
    patch((d) => d.filter((x) => x.key !== c.key))
  }
  const removeSub = async (c: CatDraft, s: SubDraft) => {
    const n = c.id ? subCount(c.name, s.name) : 0
    if (s.id && !(await ask(<>Delete the sub-category <b>{s.name}</b>?{n > 0 && <> Its {n} article{n === 1 ? '' : 's'} stay in {c.name} without a sub-category.</>} It is removed when you Save.</>, { title: 'Delete sub-category', ok: 'Delete' }))) return
    if (s.id) setDelIds((x) => ({ ...x, subs: [...x.subs, s.id!] }))
    patch((d) => d.map((x) => (x.key === c.key ? { ...x, subs: x.subs.filter((y) => y.key !== s.key) } : x)))
  }
  const saveCats = async () => {
    if (!draft) return
    const bad = draft.find((c) => !c.name.trim() || c.subs.some((s) => !s.name.trim()))
    if (bad) return setCatMsg('Every category and sub-category needs a name.')
    setSaving(true)
    try {
      const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message) }
      if (delIds.subs.length) fail((await supabase.from('kb_subcategories').delete().in('id', delIds.subs)).error)
      if (delIds.cats.length) fail((await supabase.from('kb_categories').delete().in('id', delIds.cats)).error)
      // new categories first (their ids are needed by their sub-categories), then everything else in parallel
      const ids: Record<string, string> = {}
      for (const c of draft) {
        if (c.id) ids[c.key] = c.id
        else { const { data, error } = await supabase.from('kb_categories').insert({ name: c.name.trim(), sort: draft.indexOf(c) + 1 }).select('id').single(); fail(error); ids[c.key] = data!.id }
      }
      const writes: PromiseLike<{ error: { message: string } | null }>[] = []
      draft.forEach((c, i) => {
        const orig = catList.find((x) => x.id === c.id)
        if (orig && (orig.name !== c.name.trim() || orig.sort !== i + 1)) writes.push(supabase.from('kb_categories').update({ name: c.name.trim(), sort: i + 1 }).eq('id', c.id!))
        c.subs.forEach((s, j) => {
          const so = subList.find((x) => x.id === s.id)
          if (!s.id) writes.push(supabase.from('kb_subcategories').insert({ category_id: ids[c.key], name: s.name.trim(), sort: j + 1 }))
          else if (so && (so.name !== s.name.trim() || so.sort !== j + 1)) writes.push(supabase.from('kb_subcategories').update({ name: s.name.trim(), sort: j + 1 }).eq('id', s.id))
        })
      })
      for (const r of await Promise.all(writes)) fail(r.error)
      setDraft(null); await load()
    } catch (e: any) { setCatMsg(e.message); await load() }
    setSaving(false)
  }

  return (
    <>
      <PageHeader title="Knowledge Base" sub="Links, scripts and guides for the team. Private articles are only shown to the people picked.">
        <SearchBox value={q} onChange={setQ} placeholder="Search articles…" />
        {isAdmin && <button onClick={openCats}><FolderCog size={16} />Categories</button>}
        {canEditKb && <button className="primary" onClick={() => { setEdit({ category: cat || catOpts[0]?.value || '', subcategory: sub || null, title: '', pinned: false, visibility: 'public', allowed_ids: [] }); setErr('') }}><Plus size={16} />Add article</button>}
      </PageHeader>
      <div className="tabs">
        <button className={!cat ? 'on' : ''} onClick={() => { setCat(''); setSub('') }}>All</button>
        {cats.map((c) => <button key={c} className={cat === c ? 'on' : ''} onClick={() => { setCat(c); setSub('') }}>{c}</button>)}
      </div>
      {subTabs.length > 0 && (
        <div className="chips" style={{ marginBottom: '1rem' }}>
          <button className={'chip' + (!sub ? ' on' : '')} onClick={() => setSub('')}>All {cat}</button>
          {subTabs.map((s) => <button key={s} className={'chip' + (sub === s ? ' on' : '')} onClick={() => setSub(s)}>{s}</button>)}
        </div>
      )}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {shown.map((a) => (
          <div key={a.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="row between"><span className="row" style={{ gap: '.3rem' }}><span className="tag">{a.category}{a.subcategory && <> › {a.subcategory}</>}</span>{a.visibility === 'private' && <span className="tag warn" title={`Private · ${a.allowed_ids.length} person${a.allowed_ids.length === 1 ? '' : 's'} can see it`}><Lock size={11} />Private{canEditKb && a.allowed_ids.length > 0 && ` · ${a.allowed_ids.length}`}</span>}</span>{a.pinned && <Pin size={15} className="i" style={{ color: 'var(--brand)' }} aria-label="Pinned" />}</div>
            <h2 style={{ margin: '.7rem 0 .4rem' }}>{a.title}</h2>
            {a.url && <a href={a.url} target="_blank" rel="noreferrer" className="row sm-text" style={{ gap: '.3rem', marginBottom: '.4rem' }}><ExternalLink size={14} />Open link</a>}
            {a.body && (
              <div style={{ marginBottom: '.6rem' }}>
                <div className={'pre muted sm-text kb-body' + (expanded[a.id] ? '' : ' clamp')}>{a.body}</div>
                {(a.body.length > 260 || a.body.split('\n').length > 6) && <button type="button" className="link sm-text" onClick={() => setExpanded({ ...expanded, [a.id]: !expanded[a.id] })}>{expanded[a.id] ? 'Show less' : 'Show more'}</button>}
              </div>
            )}
            <div className="row" style={{ marginTop: 'auto', paddingTop: '.5rem' }}>
              <button className="sm" onClick={() => copy(a)}>{copied === a.id ? <Check size={14} /> : <Copy size={14} />}{copied === a.id ? 'Copied' : 'Copy'}</button>
              {canEditKb && <button className="sm ghost" onClick={() => { setEdit(a); setErr('') }}><Pencil size={14} />Edit</button>}
            </div>
          </div>
        ))}
      </div>
      {!shown.length && <Empty icon={BookOpen} title="Nothing found">Try a different search or category.</Empty>}

      {draft && (
        <Modal title="Knowledge Base categories" sub="Only Admin can change this list. Nothing is written until you press Save." onClose={closeCats}>
          <p className="muted" style={{ marginTop: 0 }}>Drag the handle to arrange the order. Editors pick a category and, if it has any, a sub-category. Renaming moves the articles along. A category can only be deleted once it has no articles.</p>
          {draft.map((c) => (
            <div key={c.key} className="kbcat">
              <div {...dragProps({ cat: c.key })} style={{ gap: '.5rem' }}>
                <span className="grip" title="Drag to reorder"><GripVertical size={16} /></span>
                <button type="button" className="ghost icon sm" aria-label={c.open ? 'Hide sub-categories' : 'Show sub-categories'} onClick={() => patchCat(c.key, { open: !c.open })}>{c.open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                <input style={{ flex: 1, minWidth: 140 }} value={c.name} placeholder="Category name" onChange={(e) => patchCat(c.key, { name: e.target.value })} />
                <span className="muted sm-text nowrap" style={{ width: 118 }}>{c.id ? `${catCount(c.name)} item${catCount(c.name) === 1 ? '' : 's'} · ` : ''}{c.subs.length} sub</span>
                <button type="button" className="sm danger" disabled={!!c.id && catCount(c.name) > 0} title={c.id && catCount(c.name) ? `Move its ${catCount(c.name)} article${catCount(c.name) === 1 ? '' : 's'} to another category first` : 'Delete this category'} onClick={() => removeCat(c)}><Trash2 size={14} />Delete</button>
              </div>
              {c.open && (
                <div className="kbsubs">
                  {c.subs.map((s) => (
                    <div key={s.key} {...dragProps({ cat: c.key, sub: s.key })} style={{ gap: '.5rem' }}>
                      <span className="grip" title="Drag to reorder"><GripVertical size={16} /></span>
                      <input style={{ flex: 1, minWidth: 120 }} value={s.name} placeholder="Sub-category name" onChange={(e) => patchSub(c.key, s.key, { name: e.target.value })} />
                      <span className="muted sm-text nowrap" style={{ width: 60 }}>{c.id && s.id ? `${subCount(c.name, s.name)} item${subCount(c.name, s.name) === 1 ? '' : 's'}` : ''}</span>
                      <button type="button" className="sm danger" title="Delete this sub-category" onClick={() => removeSub(c, s)}><Trash2 size={14} />Delete</button>
                    </div>
                  ))}
                  <button type="button" className="sm ghost" onClick={() => patchCat(c.key, { subs: [...c.subs, { key: nkey(), name: '', sort: c.subs.length + 1 }] })}><Plus size={14} />Add sub-category</button>
                </div>
              )}
            </div>
          ))}
          <button type="button" className="sm" style={{ marginTop: '.6rem' }} onClick={() => patch((d) => [...d, { key: nkey(), name: '', sort: d.length + 1, open: true, subs: [] }])}><Plus size={14} />Add category</button>
          {catMsg && <div className="alert" style={{ marginTop: '.6rem' }}>{catMsg}</div>}
          <div className="modal-foot">
            <button type="button" className="primary" disabled={saving || !dirty} onClick={saveCats}><Save size={16} />{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" className="ghost" onClick={closeCats}>Cancel</button>
            {dirty && <span className="muted sm-text">Unsaved changes</span>}
          </div>
        </Modal>
      )}

      {edit && (
        <Modal title={edit.id ? 'Edit article' : 'New article'} onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            <div className="form-grid">
              <div className="field"><label>Category <span className="muted sm-text">(list set by Admin)</span></label><Select block value={edit.category ?? ''} onChange={(v) => setEdit({ ...edit, category: v, subcategory: subsOf(v).includes(edit.subcategory ?? '') ? edit.subcategory : null })} options={catOpts} placeholder="Choose a category" /></div>
              <div className="field"><label>Sub-category</label>
                {subsOf(edit.category ?? '').length ? <Select block value={edit.subcategory ?? ''} onChange={(v) => set('subcategory', v || null)} options={[{ value: '', label: '— None —' }, ...subsOf(edit.category ?? '').map((s) => ({ value: s, label: s }))]} /> : <div className="muted sm-text" style={{ padding: '.55rem 0' }}>This category has no sub-categories.</div>}
              </div>
            </div>
            <div className="field"><label>Title</label><input required value={edit.title ?? ''} onChange={(e) => set('title', e.target.value)} /></div>
            <div className="field"><label>Link (optional)</label><input value={edit.url ?? ''} onChange={(e) => set('url', e.target.value)} placeholder="https://…" /></div>
            <div className="field"><label>Content (scripts, steps, checklists; the Copy button copies this)</label><textarea style={{ minHeight: 200 }} value={edit.body ?? ''} onChange={(e) => set('body', e.target.value)} /></div>
            <div className="field"><label>Who can see it</label>
              <Select block value={edit.visibility ?? 'public'} onChange={(v) => set('visibility', v)} options={[{ value: 'public', label: 'Public — everyone in the company' }, { value: 'private', label: 'Private — only the people picked below (and Admin / HR / Manager)' }]} /></div>
            {edit.visibility === 'private' && (
              <div className="field"><label>People who can see it</label>
                <div className="chips">{staff.filter((s) => !['admin', 'hr', 'manager'].includes(s.role)).map((s) => { const on = (edit.allowed_ids ?? []).includes(s.id); return (
                  <button key={s.id} type="button" className={'chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => set('allowed_ids', on ? (edit.allowed_ids ?? []).filter((x) => x !== s.id) : [...(edit.allowed_ids ?? []), s.id])}>{on && <Check size={13} />}{s.full_name || s.email}</button>) })}</div>
                <p className="muted sm-text" style={{ margin: '.3rem 0 0' }}>Admin, HR and Manager always see every article.</p></div>
            )}
            <label className="check"><input type="checkbox" checked={edit.pinned ?? false} onChange={(e) => set('pinned', e.target.checked)} />Pin to everyone's Home page</label>
            {err && <div className="alert" style={{ marginTop: '.75rem' }}>{err}</div>}
            <div className="modal-foot"><button className="primary"><Save size={16} />Save</button>{edit.id && isAdmin && <button type="button" className="danger" onClick={del}><Trash2 size={16} />Delete</button>}{edit.id && !isAdmin && <span className="muted sm-text">Only Admin can delete an article.</span>}</div>
          </form>
        </Modal>
      )}
    </>
  )
}
