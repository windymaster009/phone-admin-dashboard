import { type ReactNode } from 'react'
import { X } from 'lucide-react'

export type DetailModalHeaderProps = {
  eyebrow?: string
  title: ReactNode
  titleId?: string
  description?: ReactNode
  descriptionId?: string
  leadingMedia?: ReactNode
  badge?: ReactNode
  onClose: () => void
  closeLabel?: string
  className?: string
}

export default function DetailModalHeader({
  eyebrow,
  title,
  titleId,
  description,
  descriptionId,
  leadingMedia,
  badge,
  onClose,
  closeLabel = 'Close details',
  className = '',
}: DetailModalHeaderProps) {
  return (
    <header className={`detail-modal-header ${className}`.trim()}>
      {leadingMedia && <div className="detail-modal-leading">{leadingMedia}</div>}
      <div className="detail-modal-header-content">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        {typeof title === 'string' ? <h3 id={titleId}>{title}</h3> : title}
        {description &&
          (typeof description === 'string' ? (
            <p id={descriptionId}>{description}</p>
          ) : (
            description
          ))}
      </div>
      {badge && <div className="detail-modal-header-badge">{badge}</div>}
      <button
        type="button"
        className="icon-button"
        onClick={onClose}
        aria-label={closeLabel}
      >
        <X size={18} />
      </button>
    </header>
  )
}
