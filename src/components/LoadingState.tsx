type LoadingStateProps = {
  label: string
  detail?: string
  compact?: boolean
  className?: string
}

export default function LoadingState({ label, detail, compact = false, className = '' }: LoadingStateProps) {
  return (
    <div
      className={`loading-state${compact ? ' loading-state-compact' : ''}${className ? ` ${className}` : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="loading-dots" aria-hidden="true"><i /><i /><i /></span>
      <span className="loading-state-copy"><strong>{label}</strong>{detail && <small>{detail}</small>}</span>
    </div>
  )
}
