import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import type { KbArticle } from '../lib/types'

export default function KnowledgeBase() {
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState<KbArticle[]>([])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [edit, setEdit] = useState<Partial<KbArticle> | null>(null)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState('')

  const load = async () => {
    const { data } = await supabase.from('kb_articles').select('*').order('pinned', { ascending: false }).order('title')
    setRows((data ?? []) as KbArticle[])
  }
  useEffect(() => { load() }, [])

  const cats = useMemo(() => [...new Set(rows.map((r) => r.category))], [rows])
  const shown = rows.filter((r) => (!cat || r.category === cat) && (!q || [r.title, r.body, r.category].join(' ').toLowerCase().includes(q.toLowerCase())))

  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!edit) return
    const { id, ...rest } = edit as KbArticle
    const payload = { ...rest, updated_at: new Date().toISOString() }
    const { error } = id ? await supabase.from('kb_articles').update(payload).eq('id', id) : await supabase.from('kb_articles').insert(payload)
    if (error) return setErr(error.message)
    setEdit(null); setErr(''); load()
  }
  const del = async () => { if (edit?.id && confirm('Delete this article?')) { await supabase.from('kb_articles').delete().eq('id', edit.id); setEdit(null); load() } }
  const copy = async (a: KbArticle) => { await navigator.clipboard.writeText(a.body ?? a.url ?? ''); setCopied(a.id); setTimeout(() => setCopied(''), 1500) }
  const set = (k: keyof KbArticle, v: any) => setEdit({ ...edit, [k]: v })

  return (
    <>
      <div className="row between">
        <h1>Knowledge Base</h1>
        {isAdmin && <button className="primary" onClick={() => { setEdit({ category: cat || 'General', title: '', pinned: false }); setErr('') }}>+ Add article</button>}
      </div>
      <div className="row" style={{ marginBottom: '1rem' }}>
        <input style={{ maxWidth: 280 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="tabs" style={{ margin: 0 }}>
          <button className={!cat ? 'on' : ''} onClick={() => setCat('')}>All</button>
          {cats.map((c) => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}
        </div>
      </div>
      <div className="grid">
        {shown.map((a) => (
          <div key={a.id} className="card" style={{ margin: 0 }}>
            <div className="row between"><span className="tag">{a.category}</span>{a.pinned && <span title="Pinned on Home">📌</span>}</div>
            <h2 style={{ marginTop: '.5rem' }}>{a.title}</h2>
            {a.url && <div><a href={a.url} target="_blank" rel="noreferrer">Open link ↗</a></div>}
            {a.body && <div className="pre muted" style={{ maxHeight: 180, overflow: 'auto', margin: '.5rem 0' }}>{a.body}</div>}
            <div className="row">
              <button className="sm" onClick={() => copy(a)}>{copied === a.id ? 'Copied ✓' : 'Copy'}</button>
              {isAdmin && <button className="sm" onClick={() => { setEdit(a); setErr('') }}>Edit</button>}
            </div>
          </div>
        ))}
      </div>
      {!shown.length && <p className="muted">Nothing found.</p>}
      {edit && (
        <Modal title={edit.id ? 'Edit article' : 'New article'} onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            <div className="form-grid">
              <div className="field"><label>Category</label><input list="cats" value={edit.category ?? ''} onChange={(e) => set('category', e.target.value)} required /><datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></div>
              <div className="field"><label>Title</label><input required value={edit.title ?? ''} onChange={(e) => set('title', e.target.value)} /></div>
            </div>
            <div className="field"><label>Link (optional)</label><input value={edit.url ?? ''} onChange={(e) => set('url', e.target.value)} placeholder="https://…" /></div>
            <div className="field"><label>Content (scripts, steps, checklists — Copy button copies this)</label><textarea style={{ minHeight: 200 }} value={edit.body ?? ''} onChange={(e) => set('body', e.target.value)} /></div>
            <label className="row"><input type="checkbox" checked={edit.pinned ?? false} onChange={(e) => set('pinned', e.target.checked)} /> Pin to everyone's Home page</label>
            {err && <div className="err">{err}</div>}
            <div className="row"><button className="primary">Save</button>{edit.id && <button type="button" className="danger" onClick={del}>Delete</button>}</div>
          </form>
        </Modal>
      )}
    </>
  )
}
