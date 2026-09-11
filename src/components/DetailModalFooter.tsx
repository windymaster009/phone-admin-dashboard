import { type ReactNode } from 'react'

export type DetailModalFooterProps = {
  banner?: ReactNode
  utilityActions?: ReactNode
  transactionActions?: ReactNode
  secondaryActions?: ReactNode
  destructiveAction?: ReactNode
  dismissAction?: ReactNode
  children?: ReactNode
  className?: string
}

export default function DetailModalFooter({
  banner,
  utilityActions,
  transactionActions,
  secondaryActions,
  destructiveAction,
  dismissAction,
  children,
  className = '',
}: DetailModalFooterProps) {
  return (
    <footer className={`detail-modal-footer ${className}`.trim()}>
      {banner && <div className="detail-modal-footer-banner">{banner}</div>}
      {children ?? (
        <div className="detail-modal-footer-content">
          {(utilityActions || destructiveAction) && (
            <div className="detail-modal-action-group detail-modal-utility-group">
              {utilityActions}
              {destructiveAction}
            </div>
          )}
          {(transactionActions || secondaryActions || dismissAction) && (
            <div className="detail-modal-action-group detail-modal-primary-group">
              {secondaryActions}
              {transactionActions}
              {dismissAction}
            </div>
          )}
        </div>
      )}
    </footer>
  )
}
