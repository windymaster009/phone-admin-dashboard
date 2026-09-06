import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export type SummaryStatTone = 'violet' | 'blue' | 'orange' | 'rose' | 'green'
export type SummaryStatValueTone = 'default' | 'negative' | 'warning' | 'positive'
export type SummaryStatsVariant = 'compact' | 'standard' | 'detailed' | 'stacked'

export type SummaryStatItem = {
  label: string
  value: ReactNode
  valueText?: string
  secondaryValue?: ReactNode
  detail?: ReactNode
  icon: LucideIcon
  tone?: SummaryStatTone
  valueTone?: SummaryStatValueTone
  key?: string
  valueSize?: 'default' | 'compact' | 'tiny'
  onClick?: () => void
  active?: boolean
  ariaLabel?: string
}

export type SummaryStatsProps = {
  items: SummaryStatItem[]
  label: string
  variant?: SummaryStatsVariant
  columns?: number
  className?: string
}

export function getVisibleText(value: ReactNode, valueText?: string): string {
  if (valueText !== undefined) return valueText
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return ''
}

export function resolveValueSize(
  value: ReactNode,
  explicitSize?: 'default' | 'compact' | 'tiny',
  valueText?: string,
): 'default' | 'compact' | 'tiny' {
  if (explicitSize) return explicitSize
  const text = getVisibleText(value, valueText).replace(/\s/g, '')
  if (!text) return 'default'
  if (text.length >= 14) return 'tiny'
  if (text.length >= 9) return 'compact'
  return 'default'
}

export default function SummaryStats({
  items,
  label,
  variant = 'compact',
  columns,
  className = '',
}: SummaryStatsProps) {
  const normalizedVariant = variant === 'stacked' ? 'detailed' : variant
  const gridClassName = [
    'summary-stats-grid',
    `summary-stats-${normalizedVariant}`,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const gridStyle = columns ? ({ '--summary-columns': columns } as React.CSSProperties) : undefined

  return (
    <section className={gridClassName} style={gridStyle} aria-label={label}>
      {items.map((item, index) => {
        const {
          label: itemLabel,
          value,
          valueText,
          secondaryValue,
          detail,
          icon: Icon,
          tone = 'violet',
          valueTone,
          key,
          valueSize,
          onClick,
          active = false,
          ariaLabel,
        } = item

        const size = resolveValueSize(value, valueSize, valueText)
        const rawText = getVisibleText(value, valueText)
        const valueTitle = rawText ? rawText : undefined
        const itemKey = key ?? `${itemLabel}-${index}`

        const cardContent = (
          <>
            <span className={`summary-stat-icon tone-${tone}`} aria-hidden="true">
              <Icon aria-hidden="true" />
            </span>
            <div className="summary-stat-copy">
              <span className="summary-stat-label">{itemLabel}</span>
              <strong
                className={`summary-stat-value${valueTone && valueTone !== 'default' ? ` value-tone-${valueTone}` : ''}`}
                data-value-size={size}
                title={valueTitle}
              >
                {value}
              </strong>
              {secondaryValue !== undefined && (
                <small className="summary-stat-secondary">{secondaryValue}</small>
              )}
              {detail !== undefined && (
                <span className="summary-stat-detail">{detail}</span>
              )}
            </div>
          </>
        )

        if (onClick) {
          return (
            <button
              type="button"
              className={`surface-card summary-stat-card summary-stat-interactive ${active ? 'is-active' : ''}`}
              key={itemKey}
              onClick={onClick}
              aria-pressed={active}
              aria-label={ariaLabel}
            >
              {cardContent}
            </button>
          )
        }

        return (
          <article className="surface-card summary-stat-card" key={itemKey}>
            {cardContent}
          </article>
        )
      })}
    </section>
  )
}
