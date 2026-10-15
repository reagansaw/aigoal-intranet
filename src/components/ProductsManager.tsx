import { useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Product } from '../lib/products'
import Modal from './Modal'
import { Msg, NumberInput } from './ui'

/** Admin: the list of products that can be picked when closing a deal. */
export default function ProductsManager({ products, onClose, onChanged }: { products: Product[]; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState<number | ''>('')
  const [msg, setMsg] = useState('')
  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => { const { error } = await p; setMsg(error ? error.message : ''); onChanged() }
  const add = async () => {
    if (!name.trim()) return
    await run(supabase.from('products').insert({ name: name.trim(), price: Number(price) || 0, sort: products.length + 1 }))
    setName(''); setPrice('')
  }
  return (
    <Modal title="Products" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>These are the products a sales person can pick when closing a deal. A retired product stays on past deals but is hidden from the picker.</p>
      {products.map((p) => (
        <div key={p.id} className="row" style={{ gap: '.5rem', marginBottom: '.5rem', opacity: p.active ? 1 : .55 }}>
          <input style={{ flex: 1 }} defaultValue={p.name} onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && run(supabase.from('products').update({ name: e.target.value.trim() }).eq('id', p.id))} />
          <div style={{ width: 110 }}><NumberInput value={p.price} onChange={(v) => run(supabase.from('products').update({ price: v || 0 }).eq('id', p.id))} /></div>
          <button className="sm" onClick={() => run(supabase.from('products').update({ active: !p.active }).eq('id', p.id))}>{p.active ? 'Retire' : 'Restore'}</button>
        </div>
      ))}
      <div className="row" style={{ gap: '.5rem', marginTop: '.8rem' }}>
        <input style={{ flex: 1 }} placeholder="New product name" value={name} onChange={(e) => setName(e.target.value)} />
        <div style={{ width: 110 }}><NumberInput value={price === '' ? undefined : price} onChange={(v) => setPrice(v ?? '')} /></div>
        <button className="primary" disabled={!name.trim()} onClick={add}><Plus size={16} />Add</button>
      </div>
      <Msg text={msg} />
    </Modal>
  )
}
