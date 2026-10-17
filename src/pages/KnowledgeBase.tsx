import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { BookOpen, Check, Copy, ExternalLink, Pencil, Pin, Plus, Save, Trash2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import { Empty, PageHeader, SearchBox } from '../components/ui'
import type { KbArticle } from '../lib/types'

export default function KnowledgeBase() {
  const { canManageCrm: isAdmin } = useAuth()   // Admin or Manager may add and edit; everyone else reads
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
      <PageHeader title="Knowledge Base" sub="Links, scripts and guides for the team.">
        <SearchBox value={q} onChange={setQ} placeholder="Search articles…" />
        {isAdmin && <button className="primary" onClick={() => { setEdit({ category: cat || 'General', title: '', pinned: false }); setErr('') }}><Plus size={16} />Add article</button>}
      </PageHeader>
      <div className="tabs">
        <button className={!cat ? 'on' : ''} onClick={() => setCat('')}>All</button>
        {cats.map((c) => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {shown.map((a) => (
          <div key={a.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="row between"><span className="tag">{a.category}</span>{a.pinned && <Pin size={15} className="i" style={{ color: 'var(--brand)' }} aria-label="Pinned" />}</div>
            <h2 style={{ margin: '.7rem 0 .4rem' }}>{a.title}</h2>
            {a.url && <a href={a.url} target="_blank" rel="noreferrer" className="row sm-text" style={{ gap: '.3rem', marginBottom: '.4rem' }}><ExternalLink size={14} />Open link</a>}
            {a.body && <div className="pre muted sm-text" style={{ maxHeight: 170, overflow: 'auto', marginBottom: '.6rem' }}>{a.body}</div>}
            <div className="row" style={{ marginTop: 'auto', paddingTop: '.5rem' }}>
              <button className="sm" onClick={() => copy(a)}>{copied === a.id ? <Check size={14} /> : <Copy size={14} />}{copied === a.id ? 'Copied' : 'Copy'}</button>
              {isAdmin && <button className="sm ghost" onClick={() => { setEdit(a); setErr('') }}><Pencil size={14} />Edit</button>}
            </div>
          </div>
        ))}
      </div>
      {!shown.length && <Empty icon={BookOpen} title="Nothing found">Try a different search or category.</Empty>}

      {edit && (
        <Modal title={edit.id ? 'Edit article' : 'New article'} onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            <div className="form-grid">
              <div className="field"><label>Category</label><input list="cats" value={edit.category ?? ''} onChange={(e) => set('category', e.target.value)} required /><datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></div>
              <div className="field"><label>Title</label><input required value={edit.title ?? ''} onChange={(e) => set('title', e.target.value)} /></div>
            </div>
            <div className="field"><label>Link (optional)</label><input value={edit.url ?? ''} onChange={(e) => set('url', e.target.value)} placeholder="https://…" /></div>
            <div className="field"><label>Content (scripts, steps, checklists; the Copy button copies this)</label><textarea style={{ minHeight: 200 }} value={edit.body ?? ''} onChange={(e) => set('body', e.target.value)} /></div>
            <label className="check"><input type="checkbox" checked={edit.pinned ?? false} onChange={(e) => set('pinned', e.target.checked)} />Pin to everyone's Home page</label>
            {err && <div className="alert" style={{ marginTop: '.75rem' }}>{err}</div>}
            <div className="modal-foot"><button className="primary"><Save size={16} />Save</button>{edit.id && <button type="button" className="danger" onClick={del}><Trash2 size={16} />Delete</button>}</div>
          </form>
        </Modal>
      )}
    </>
  )
}
