import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export type SummaryStatTone = 'violet' | 'blue' | 'orange' | 'rose' | 'green'

export type SummaryStatItem = {
  label: string
  value: ReactNode
  secondaryValue?: ReactNode
  detail?: ReactNode
  icon: LucideIcon
  tone?: SummaryStatTone
}

type SummaryStatsProps = {
  items: SummaryStatItem[]
  label: string
  className?: string
}

function valueSize(value: ReactNode) {
  if (typeof value !== 'string' && typeof value !== 'number') return 'default'
  const length = String(value).trim().length
  if (length > 13) return 'tiny'
  if (length > 8) return 'compact'
  return 'default'
}

export default function SummaryStats({ items, label, className = '' }: SummaryStatsProps) {
  const gridClassName = ['summary-stats-grid', className].filter(Boolean).join(' ')

  return (
    <section className={gridClassName} aria-label={label}>
      {items.map(({ label: itemLabel, value, secondaryValue, detail, icon: Icon, tone = 'violet' }) => {
        const size = valueSize(value)
        const valueTitle = size !== 'default' && (typeof value === 'string' || typeof value === 'number') ? String(value) : undefined
        return (
          <article className="surface-card summary-stat-card" key={itemLabel}>
            <span className={`summary-stat-icon tone-${tone}`} aria-hidden="true">
              <Icon />
            </span>
            <p className="summary-stat-copy">
              <span className="summary-stat-label">{itemLabel}</span>
              <strong className="summary-stat-value" data-value-size={size} title={valueTitle}>{value}</strong>
              {secondaryValue !== undefined && <small className="summary-stat-secondary">{secondaryValue}</small>}
              {detail !== undefined && <span className="summary-stat-detail">{detail}</span>}
            </p>
          </article>
        )
      })}
    </section>
  )
}
