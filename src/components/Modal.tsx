import type { ReactNode } from 'react'

export default function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="row between" style={{ marginBottom: '.75rem' }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="sm" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
