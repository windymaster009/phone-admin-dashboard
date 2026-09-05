import { useEffect, useRef, type ReactNode } from 'react'
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

function parsePlaceholderAlert(message?: string): ModalKind | null {
  const value = String(message || '').toLowerCase()
  if (value.startsWith('add stock') || value.startsWith('adjust stock')) return 'stock'
  if (value.startsWith('new purchase')) return 'purchase'
  if (value.startsWith('new sale')) return 'sale'
  if (value.startsWith('new pawn')) return 'pawn'
  return null
}

export default function OperationModalShell({
  kind,
  error,
  busy,
  onClose,
  compact = false,
  dismissible = true,
  dismissOnEscape = true,
  children,
}: {
  kind: ModalKind
  error: string
  busy: boolean
  onClose: () => void
  compact?: boolean
  dismissible?: boolean
  dismissOnEscape?: boolean
  children: ReactNode
}) {
  const meta = modalMeta[kind]
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

  return (
    <div className="operation-modal-backdrop" role="presentation">
      <section ref={dialogRef} className={`operation-modal operation-modal-${kind}${compact ? ' operation-modal-compact' : ''}`} role="dialog" aria-modal="true" aria-label={meta.title}>
        <header className="operation-modal-header">
          <span className="operation-modal-icon">{meta.icon}</span>
          <div>
            <span className="eyebrow">PhoneFlow operation</span>
            <h2>{meta.title}</h2>
            <p>{meta.description}</p>
          </div>
          {dismissible && <button type="button" className="operation-modal-close" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={19} />
          </button>}
        </header>
        {error && <div className="operation-modal-error"><AlertTriangle size={17} /> {error}</div>}
        {children}
      </section>
    </div>
  )
}

