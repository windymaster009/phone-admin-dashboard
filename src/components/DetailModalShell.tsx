import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type DetailModalShellProps = {
  onClose: () => void
  titleId?: string
  descriptionId?: string
  ariaLabel?: string
  className?: string
  compact?: boolean
  children: ReactNode
}

export default function DetailModalShell({
  onClose,
  titleId,
  descriptionId,
  ariaLabel,
  className = '',
  compact = false,
  children,
}: DetailModalShellProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const backdrop = backdropRef.current
    if (!backdrop) return

    const syncVisualViewport = () => {
      const viewport = window.visualViewport
      const height = viewport?.height ?? window.innerHeight
      const width = viewport?.width ?? window.innerWidth
      const top = viewport?.offsetTop ?? 0
      const left = viewport?.offsetLeft ?? 0

      const heightPx = `${Math.max(0, height)}px`
      backdrop.style.setProperty('--modal-viewport-height', heightPx)
      backdrop.style.setProperty('--operation-viewport-height', heightPx)
      backdrop.style.setProperty('--modal-viewport-width', `${Math.max(0, width)}px`)
      backdrop.style.setProperty('--modal-viewport-top', `${Math.max(0, top)}px`)
      backdrop.style.setProperty('--modal-viewport-left', `${Math.max(0, left)}px`)
    }

    syncVisualViewport()
    window.addEventListener('resize', syncVisualViewport)
    window.visualViewport?.addEventListener('resize', syncVisualViewport)
    window.visualViewport?.addEventListener('scroll', syncVisualViewport)

    return () => {
      window.removeEventListener('resize', syncVisualViewport)
      window.visualViewport?.removeEventListener('resize', syncVisualViewport)
      window.visualViewport?.removeEventListener('scroll', syncVisualViewport)
    }
  }, [])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    document.body.classList.add('detail-modal-open')
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      document.body.classList.remove('detail-modal-open')
    }
  }, [onClose])

  useEffect(() => {
    const dialog = dialogRef.current
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusableSelector =
      'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
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
  }, [compact])

  const content = (
    <div
      ref={backdropRef}
      className="modal-backdrop detail-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <section
        ref={dialogRef}
        className={`detail-modal surface-card ${compact ? 'detail-modal-compact' : ''} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-label={ariaLabel}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content
}
