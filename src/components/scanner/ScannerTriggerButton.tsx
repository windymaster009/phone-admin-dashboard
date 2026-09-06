import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { ScanLine } from 'lucide-react'

export const PRODUCT_SCANNER_EVENT = 'phoneflow:open-scanner'

export function openProductScanner() {
  window.dispatchEvent(new Event(PRODUCT_SCANNER_EVENT))
}

type ScannerTriggerButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string
  description?: string
  trailing?: ReactNode
  variant?: 'toolbar' | 'quick-action'
  iconSize?: number
}

export default function ScannerTriggerButton({
  label,
  description,
  trailing,
  variant = 'toolbar',
  iconSize,
  className = '',
  type = 'button',
  ...buttonProps
}: ScannerTriggerButtonProps) {
  if (variant === 'quick-action') {
    return (
      <button type={type} className={className || undefined} {...buttonProps}>
        <span className="quick-icon blue"><ScanLine size={iconSize || 19} aria-hidden="true" /></span>
        <p>{label}{description && <small>{description}</small>}</p>
        {trailing}
      </button>
    )
  }

  const toolbarClassName = ['secondary-button', className].filter(Boolean).join(' ')
  return (
    <button type={type} className={toolbarClassName} aria-label={buttonProps['aria-label'] || label} {...buttonProps}>
      <ScanLine size={iconSize || 17} aria-hidden="true" />
      <span>{label}</span>
    </button>
  )
}
