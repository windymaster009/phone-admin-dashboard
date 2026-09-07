import type { ReactNode } from 'react'

export type KeyValueSummaryItem = {
  id: string
  label: ReactNode
  value: ReactNode
  supportingText?: ReactNode
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'muted'
  className?: string
}

export type KeyValueSummaryProps = {
  items: ReadonlyArray<KeyValueSummaryItem>
  columns?: 1 | 2 | 3 | 4 | 'auto'
  className?: string
}

const TONE_CLASS_MAP: Record<NonNullable<KeyValueSummaryItem['tone']>, string> = {
  default: 'tone-default',
  success: 'verified tone-success',
  warning: 'warning tone-warning',
  danger: 'missing tone-danger',
  muted: 'optional tone-muted',
}

export default function KeyValueSummary({
  items,
  columns,
  className = '',
}: KeyValueSummaryProps) {
  const columnClass = columns ? `columns-${columns}` : ''

  return (
    <div
      className={`key-value-summary ${columnClass} ${className}`.trim()}
      role="list"
    >
      {items.map((item) => {
        const toneClass = TONE_CLASS_MAP[item.tone || 'default']

        return (
          <div
            key={item.id}
            role="listitem"
            className={`key-value-item ${item.className || ''}`.trim()}
          >
            <span className="key-value-label">{item.label}</span>
            <strong className={`key-value-value ${toneClass}`.trim()}>
              {item.value}
            </strong>
            {item.supportingText && (
              <small className="key-value-supporting">
                {item.supportingText}
              </small>
            )}
          </div>
        )
      })}
    </div>
  )
}
