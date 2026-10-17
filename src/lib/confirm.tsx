import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import Modal from '../components/Modal'

export interface ConfirmOptions { title?: ReactNode; ok?: string; cancel?: string; danger?: boolean }
type Ask = (message: ReactNode, opts?: ConfirmOptions) => Promise<boolean>

const Ctx = createContext<Ask>(() => Promise.resolve(false))

/** App-wide replacement for window.confirm: renders the universal Modal and resolves true/false. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ message: ReactNode; opts: ConfirmOptions } | null>(null)
  const resolver = useRef<(v: boolean) => void>()
  const ask = useCallback<Ask>((message, opts = {}) => new Promise<boolean>((resolve) => { resolver.current = resolve; setState({ message, opts }) }), [])
  const close = (v: boolean) => { resolver.current?.(v); resolver.current = undefined; setState(null) }
  return (
    <Ctx.Provider value={ask}>
      {children}
      {state && (
        <Modal title={state.opts.title ?? 'Please confirm'} onClose={() => close(false)} size="sm">
          <div style={{ whiteSpace: 'pre-wrap' }}>{state.message}</div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: '1.1rem' }}>
            <button type="button" className="ghost" onClick={() => close(false)}>{state.opts.cancel ?? 'Cancel'}</button>
            <button type="button" className={state.opts.danger === false ? 'primary' : 'danger'} autoFocus onClick={() => close(true)}>{state.opts.ok ?? 'OK'}</button>
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  )
}

export const useConfirm = () => useContext(Ctx)
