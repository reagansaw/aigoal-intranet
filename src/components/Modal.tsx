import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export default function Modal({ title, sub, onClose, children, wide, size }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; size?: 'sm' }) {
  return (
    <div className={'modal-bg' + (size === 'sm' ? ' sm-bg' : '')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '') + (size === 'sm' ? ' sm' : '')} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div style={{ minWidth: 0 }}>
            <h2>{title}</h2>
            {sub && <div className="modal-sub">{sub}</div>}
          </div>
          <button className="ghost icon" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
