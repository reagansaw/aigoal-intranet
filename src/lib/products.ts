import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export interface Product { id: string; name: string; price: number; active: boolean; sort: number }

/** Products that can be closed; managed by Admin (Customers → Products). */
export function useProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const reload = useCallback(async () => {
    const { data } = await supabase.from('products').select('*').order('sort').order('name')
    setProducts((data ?? []) as Product[])
  }, [])
  useEffect(() => { reload() }, [reload])
  return { products, reload }
}
