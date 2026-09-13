import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StartupScreen from './StartupScreen'
import type { ShopProfile } from '../lib/api'

const mockShop: ShopProfile = {
  name: 'PhoneFlow Central',
  subtitle: 'Retail & Service Lab',
  phone: '+855 12 345 678',
  email: 'central@phoneflow.com',
  address: 'Phnom Penh, Cambodia',
  taxId: 'K001-998877',
  logoUrl: '',
  receiptFooter: 'Thank you for choosing PhoneFlow.',
}

describe('StartupScreen component', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders "checking-session" stage with brand details and step progression', () => {
    render(<StartupScreen stage="checking-session" shop={mockShop} />)

    expect(screen.getAllByText('PhoneFlow Central').length).toBeGreaterThan(0)
    expect(screen.getByText('Retail & Service Lab')).toBeInTheDocument()
    expect(screen.getByText('Secure session')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: /Checking your access/i })).toBeInTheDocument()
    expect(screen.getByText(/Verifying your session and connecting to the shop database/i)).toBeInTheDocument()

    // Step indicators
    expect(screen.getByText('Verify session')).toBeInTheDocument()
    expect(screen.getByText('Load workspace')).toBeInTheDocument()
    expect(screen.getByText('Sync dashboard')).toBeInTheDocument()
  })

  it('renders "loading-sign-in" stage with correct copy', () => {
    render(<StartupScreen stage="loading-sign-in" shop={mockShop} />)

    expect(screen.getAllByText('Secure access').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { level: 1, name: /Preparing sign in/i })).toBeInTheDocument()
    expect(screen.getByText(/Loading the secure PhoneFlow Central sign-in experience/i)).toBeInTheDocument()
  })

  it('renders "opening-workspace" stage with correct copy and second step active', () => {
    render(<StartupScreen stage="opening-workspace" shop={mockShop} />)

    expect(screen.getByText('Shop workspace')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: /Opening PhoneFlow Central/i })).toBeInTheDocument()
    expect(screen.getByText(/Loading inventory, pawn, sales, and customer tools/i)).toBeInTheDocument()
  })

  it('renders shop logo image when logoUrl is provided', () => {
    const shopWithLogo = { ...mockShop, logoUrl: 'https://example.com/logo.png' }
    const { container } = render(<StartupScreen stage="checking-session" shop={shopWithLogo} />)

    const img = container.querySelector('.startup-brand-mark img')
    expect(img).toHaveAttribute('src', 'https://example.com/logo.png')
  })

  it('responds to offline and online window events', () => {
    render(<StartupScreen stage="checking-session" shop={mockShop} />)

    // Initially online
    expect(screen.queryByText(/You are offline/i)).not.toBeInTheDocument()

    // Simulate going offline
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    expect(screen.getByRole('heading', { level: 1, name: /You are offline/i })).toBeInTheDocument()
    expect(screen.getByText(/Your device is offline. Reconnect to continue./i)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()

    // Simulate coming back online
    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(screen.getByRole('heading', { level: 1, name: /Checking your access/i })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('displays slow connection alert after 8 seconds timer', () => {
    render(<StartupScreen stage="checking-session" shop={mockShop} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    // Advance timer past 8,000ms
    act(() => {
      vi.advanceTimersByTime(8_000)
    })

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/This is taking longer than usual. The API or database may still be starting./i)).toBeInTheDocument()
    expect(screen.getByText('Still working…')).toBeInTheDocument()
  })

  it('displays connection error message and handles retry callback', () => {
    const onRetry = vi.fn()
    render(
      <StartupScreen
        stage="checking-session"
        shop={mockShop}
        error={{ message: 'Custom database timeout', retryable: true }}
        onRetry={onRetry}
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: /Service unavailable/i })).toBeInTheDocument()
    expect(screen.getAllByText('Custom database timeout').length).toBeGreaterThan(0)
    expect(screen.getByText('Connection error')).toBeInTheDocument()

    const retryButton = screen.getByRole('button', { name: /Retry connecting to the service/i })
    fireEvent.click(retryButton)

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('falls back to window.location.reload when onRetry is not provided', () => {
    const originalLocation = window.location
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, reload: reloadMock },
    })

    try {
      render(
        <StartupScreen
          stage="checking-session"
          shop={mockShop}
          error={{ message: 'Server down' }}
        />,
      )

      const retryButton = screen.getByRole('button', { name: /Retry connecting to the service/i })
      fireEvent.click(retryButton)

      expect(reloadMock).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: originalLocation,
      })
    }
  })

  it('renders overlay mode with dismiss button when onDismissOverlay is provided', async () => {
    const onDismissOverlay = vi.fn()
    render(
      <StartupScreen
        stage="opening-workspace"
        overlay
        shop={mockShop}
        error={{ message: 'Non-fatal slow warning' }}
        onDismissOverlay={onDismissOverlay}
      />,
    )

    const statusContainer = screen.getByRole('status')
    expect(statusContainer).toHaveClass('startup-screen-overlay')

    const dismissButton = screen.getByRole('button', { name: /Continue to workspace/i })
    expect(dismissButton).toHaveTextContent('Open workspace')

    fireEvent.click(dismissButton)
    expect(onDismissOverlay).toHaveBeenCalledTimes(1)
  })

  it('cleans up event listeners and timers on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')

    const { unmount } = render(<StartupScreen stage="checking-session" shop={mockShop} />)

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function))
    expect(clearTimeoutSpy).toHaveBeenCalled()
  })
})
