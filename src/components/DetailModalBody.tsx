import { type ReactNode } from 'react'

export type DetailModalBodyProps = {
  children: ReactNode
  className?: string
}

export default function DetailModalBody({
  children,
  className = '',
}: DetailModalBodyProps) {
  return (
    <div className={`detail-modal-body ${className}`.trim()}>
      {children}
    </div>
  )
}
