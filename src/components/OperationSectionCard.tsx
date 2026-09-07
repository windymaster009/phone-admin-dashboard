import type { ReactNode } from 'react'

export type OperationSectionCardProps = {
  marker?: ReactNode
  title: ReactNode
  description?: ReactNode
  badge?: ReactNode
  headerAction?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}

export default function OperationSectionCard({
  marker,
  title,
  description,
  badge,
  headerAction,
  children,
  className = '',
  id,
}: OperationSectionCardProps) {
  const isPlainHeading = !marker

  return (
    <section
      id={id}
      className={`operation-section-card purchase-section-card ${className}`.trim()}
    >
      <div
        className={`operation-section-heading purchase-section-heading ${isPlainHeading ? 'purchase-section-heading-plain' : ''}`.trim()}
      >
        {marker && <span>{marker}</span>}
        <div>
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        {badge && <b>{badge}</b>}
        {headerAction}
      </div>
      {children}
    </section>
  )
}
