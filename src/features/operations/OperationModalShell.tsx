import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, HandCoins, Package, Printer, ScanLine, ShoppingCart, X } from 'lucide-react'
import type { ModalKind } from './operationDomain'

const modalMeta: Record<ModalKind, { title: string; description: string; icon: ReactNode }> = {
  stock: {
    title: 'Adjust stock',
    description: 'Correct the count or status of an existing inventory item.',
    icon: <Package size={21} />,
  },
  purchase: {
    title: 'New purchase',
    description: 'Buy one or more products and add them to inventory.',
    icon: <Package size={21} />,
  },
  sale: {
    title: 'New sale',
    description: 'Sell an available inventory item to a customer.',
    icon: <ShoppingCart size={21} />,
  },
  pawn: {
    title: 'New pawn contract',
    description: 'Register customer collateral, value, principal, and due date.',
    icon: <HandCoins size={21} />,
  },
  scan: {
    title: 'Scan product',
    description: 'Use a barcode scanner, type a code, or scan with this device camera.',
    icon: <ScanLine size={21} />,
  },
  label: {
    title: 'Purchase completed',
    description: 'The product was added to stock and its barcode label is ready.',
    icon: <Printer size={21} />,
  },
}

export type OperationModalShellProps = {
  kind?: ModalKind
  title?: string
  eyebrow?: string
  description?: string
  icon?: ReactNode
  error?: string
  busy?: boolean
  onClose: () => void
  compact?: boolean
  confirmation?: boolean
  scanner?: boolean
  dismissible?: boolean
  dismissOnEscape?: boolean
  className?: string
  ariaLabel?: string
  children: ReactNode
}

export default function OperationModalShell({
  kind,
  title,
  eyebrow,
  description,
  icon,
  error,
  busy = false,
  onClose,
  compact = false,
  confirmation = false,
  scanner = false,
  dismissible = true,
  dismissOnEscape = true,
  className = '',
  ariaLabel,
  children,
}: OperationModalShellProps) {
  const meta = kind ? modalMeta[kind] : undefined
  const resolvedTitle = title || meta?.title || 'Operation'
  const resolvedEyebrow = eyebrow !== undefined ? eyebrow : (meta ? 'PhoneFlow operation' : '')
  const resolvedDescription = description !== undefined ? description : meta?.description || ''
  const resolvedIcon = icon !== undefined ? icon : meta?.icon || null
  const kindClass = kind ? `operation-modal-${kind}` : ''
  const compactClass = compact ? 'operation-modal-compact' : ''
  const confirmationClass = confirmation ? 'loan-modal-confirmation' : ''
  const scannerClass = scanner ? 'loan-modal-scanner' : ''
  const sectionClass = `operation-modal ${kindClass} ${compactClass} ${confirmationClass} ${scannerClass} ${className}`.trim()
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy && dismissible && dismissOnEscape) onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    document.body.classList.add('operation-modal-open')
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.body.classList.remove('operation-modal-open')
    }
  }, [busy, dismissible, dismissOnEscape, onClose])

  useEffect(() => {
    const dialog = dialogRef.current
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusableSelector = 'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(focusableSelector) || [])
    const frame = window.requestAnimationFrame(() => {
      const preferred = dialog?.querySelector<HTMLElement>('[data-modal-initial-focus]')
      ;(preferred || focusable()[0])?.focus()
    })
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (!elements.length) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    dialog?.addEventListener('keydown', trapFocus)
    return () => {
      window.cancelAnimationFrame(frame)
      dialog?.removeEventListener('keydown', trapFocus)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [kind, compact])

  const content = (
    <div className={`operation-modal-backdrop ${className ? `${className}-backdrop` : ''}`.trim()} role="presentation">
      <section
        ref={dialogRef}
        className={sectionClass}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || resolvedTitle}
      >
        <header className="operation-modal-header">
          {resolvedIcon && <span className="operation-modal-icon">{resolvedIcon}</span>}
          <div>
            {resolvedEyebrow && <span className="eyebrow">{resolvedEyebrow}</span>}
            <h2>{resolvedTitle}</h2>
            {resolvedDescription && <p>{resolvedDescription}</p>}
          </div>
          {dismissible && (
            <button
              type="button"
              className="operation-modal-close"
              onClick={onClose}
              disabled={busy}
              aria-label="Close"
            >
              <X size={19} />
            </button>
          )}
        </header>
        {error && <div className="operation-modal-error"><AlertTriangle size={17} /> {error}</div>}
        {children}
      </section>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content
}

