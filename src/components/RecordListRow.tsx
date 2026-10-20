import type { ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import './record-list-row.css'

type RecordListRowProps = {
  icon: ReactNode
  tone: 'sale' | 'purchase' | 'repair' | 'preorder'
  title: string
  meta: string
  detail?: string
  badge: ReactNode
  amount?: string
  amountTone?: 'in' | 'out'
  ariaLabel: string
  onOpen: () => void
}

export default function RecordListRow({ icon, tone, title, meta, detail, badge, amount, amountTone, ariaLabel, onOpen }: RecordListRowProps) {
  return <button type="button" className="record-list-row" aria-label={ariaLabel} onClick={onOpen}>
    <span className={`record-list-row-icon ${tone}`} aria-hidden="true">{icon}</span>
    <span className="record-list-row-copy"><strong>{title}</strong><small>{meta}</small>{detail && <small>{detail}</small>}</span>
    <span className="record-list-row-side"><span className="record-list-row-badge">{badge}</span>{amount && <strong className={`record-list-row-amount ${amountTone ? `money-${amountTone}` : ''}`}>{amount}</strong>}</span>
    <span className="record-list-row-more" aria-hidden="true"><MoreHorizontal size={18} /></span>
  </button>
}
