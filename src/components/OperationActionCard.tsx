import { Plus } from 'lucide-react'
import './operation-action-card.css'

type OperationActionCardProps = {
  ariaLabel: string
  eyebrow: string
  title: string
  description: string
  actionLabel: string
  onAction: () => void
}

export default function OperationActionCard({ ariaLabel, eyebrow, title, description, actionLabel, onAction }: OperationActionCardProps) {
  return <section className="operation-action-section" aria-label={ariaLabel}>
    <article className="surface-card operation-action-card">
      <span className="operation-action-icon"><Plus size={26} aria-hidden="true" /></span>
      <div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3><p>{description}</p></div>
      <button type="button" className="primary-button" onClick={onAction}><Plus size={17} />{actionLabel}</button>
    </article>
  </section>
}
