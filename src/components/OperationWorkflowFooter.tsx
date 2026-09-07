import type { ReactNode } from 'react'

export type WorkflowFooterSummary = {
  stepText?: ReactNode
  detailText?: ReactNode
}

export type OperationWorkflowFooterProps = {
  summary?: WorkflowFooterSummary | ReactNode
  secondaryAction?: ReactNode
  primaryAction?: ReactNode
  children?: ReactNode
  className?: string
}

function isWorkflowFooterSummary(val: unknown): val is WorkflowFooterSummary {
  return typeof val === 'object' && val !== null && ('stepText' in val || 'detailText' in val)
}

export default function OperationWorkflowFooter({
  summary,
  secondaryAction,
  primaryAction,
  children,
  className = '',
}: OperationWorkflowFooterProps) {
  return (
    <footer className={`operation-workflow-footer operation-modal-actions ${className}`.trim()}>
      {summary && (
        isWorkflowFooterSummary(summary) ? (
          <div className="operation-workflow-footer-summary purchase-submit-summary">
            {summary.stepText && <span>{summary.stepText}</span>}
            {summary.detailText && <strong>{summary.detailText}</strong>}
          </div>
        ) : (
          summary
        )
      )}
      {children ? (
        children
      ) : (
        <>
          {secondaryAction}
          {primaryAction}
        </>
      )}
    </footer>
  )
}
