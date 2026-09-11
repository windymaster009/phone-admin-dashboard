import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NotificationToast from './NotificationToast'

describe('NotificationToast', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders into document.body with status role for success', () => {
    const onDismiss = vi.fn()
    render(<NotificationToast message="Operation succeeded." tone="success" onDismiss={onDismiss} />)

    const toast = screen.getByRole('status')
    expect(toast).toBeInTheDocument()
    expect(toast).toHaveTextContent('Operation succeeded.')
    expect(toast).toHaveClass('notification-toast', 'success')
  })

  it('renders into document.body with alert role for error', () => {
    const onDismiss = vi.fn()
    render(<NotificationToast message="Operation failed." tone="error" onDismiss={onDismiss} />)

    const toast = screen.getByRole('alert')
    expect(toast).toBeInTheDocument()
    expect(toast).toHaveTextContent('Operation failed.')
    expect(toast).toHaveClass('notification-toast', 'error')
  })

  it('calls onDismiss when clicking the dismiss button', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(<NotificationToast message="Dismissable toast" onDismiss={onDismiss} />)

    const dismissButton = screen.getByRole('button', { name: /Dismiss message/i })
    await user.click(dismissButton)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('automatically calls onDismiss after the specified duration', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(<NotificationToast message="Auto dismiss" duration={4000} onDismiss={onDismiss} />)

    expect(onDismiss).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(3999)
    })
    expect(onDismiss).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('cleans up timeout on unmount', () => {
    vi.useFakeTimers()
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')
    const onDismiss = vi.fn()
    const { unmount } = render(<NotificationToast message="Unmount test" onDismiss={onDismiss} />)

    unmount()
    expect(clearTimeoutSpy).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('renders nothing when message is empty', () => {
    const onDismiss = vi.fn()
    const { container } = render(<NotificationToast message="" onDismiss={onDismiss} />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
