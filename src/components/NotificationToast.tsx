import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'

export interface NotificationToastProps {
  message: string
  tone?: 'success' | 'error'
  onDismiss: () => void
  duration?: number
}

export default function NotificationToast({
  message,
  tone = 'success',
  onDismiss,
  duration = 4000,
}: NotificationToastProps) {
  useEffect(() => {
    if (!message) return

    // Auto-dismiss after duration
    const timer = window.setTimeout(() => {
      onDismiss()
    }, duration)

    return () => window.clearTimeout(timer)
  }, [message, duration, onDismiss])

  if (!message) return null

  const isError = tone === 'error'
  const role = isError ? 'alert' : 'status'

  return createPortal(
    <div
      className={`notification-toast ${tone}`}
      role={role}
      aria-live="polite"
    >
      {isError ? (
        <AlertTriangle size={16} aria-hidden="true" />
      ) : (
        <CheckCircle2 size={16} aria-hidden="true" />
      )}
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss message"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>,
    document.body,
  )
}
