import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppWithBackend from './AppWithBackend'
import { getSessionUser, setToken, type SessionUser, type ShopProfile } from '../lib/api'
import { safeStorage, STORAGE_KEYS } from '../lib/storage'

const mockShop: ShopProfile = {
  name: 'PhoneFlow Flagship',
  subtitle: 'Headquarters',
  phone: '+855 23 888 999',
  email: 'hq@phoneflow.com',
  address: 'Monivong Blvd, Phnom Penh',
  taxId: 'TAX-00123',
  logoUrl: '',
  receiptFooter: 'Thank you for your visit.',
}

const mockUser: SessionUser = {
  id: 'usr-100',
  name: 'Sophea Owner',
  email: 'sophea@phoneflow.com',
  role: 'OWNER',
  active: true,
}

describe('AppWithBackend component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    safeStorage.removeItem(STORAGE_KEYS.THEME)
    safeStorage.removeItem(STORAGE_KEYS.FONT_SIZE)
    safeStorage.removeItem('phoneflow_restore_success', 'session')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('displays StartupScreen in "checking-session" stage while checking session on mount', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))

    render(<AppWithBackend />)

    expect(screen.getByRole('heading', { level: 1, name: /Checking your access/i })).toBeInTheDocument()
    expect(screen.getByText(/Verifying your session and connecting to the shop database/i)).toBeInTheDocument()
  })

  it('restores session when /auth/me succeeds with authenticated user', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/shop')) {
        return new Response(JSON.stringify({ shop: mockShop }), { status: 200 })
      }
      if (url.includes('/auth/me')) {
        return new Response(JSON.stringify({ user: mockUser }), { status: 200 })
      }
      if (url.includes('/loans/summary')) {
        return new Response(JSON.stringify({ summary: { counts: { overdue: 2 } } }), { status: 200 })
      }
      return new Response(JSON.stringify({}), { status: 200 })
    })

    render(<StrictMode><AppWithBackend /></StrictMode>)

    // Match the real entry point, including Strict Mode's effect replay.
    expect(screen.getByRole('heading', { level: 1, name: /Checking your access/i })).toBeInTheDocument()

    // Once /auth/me resolves, App loads and displays authenticated workspace with overlay
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Sophea/i })).toBeInTheDocument()
    })
  })

  it('renders AuthScreen when /auth/me returns 401 unauthorized', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/shop')) {
        return new Response(JSON.stringify({ shop: mockShop }), { status: 200 })
      }
      if (url.includes('/auth/me')) {
        return new Response(JSON.stringify({ message: 'Session expired' }), { status: 401 })
      }
      if (url.includes('/auth/status')) {
        return new Response(JSON.stringify({ setupRequired: false }), { status: 200 })
      }
      return new Response('Not found', { status: 404 })
    })

    render(<AppWithBackend />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('owner@shop.com')).toBeInTheDocument()
    }, { timeout: 5_000 }) // Includes the real lazy module's cold transform under coverage.

    expect(screen.getByRole('heading', { name: /Welcome back/i })).toBeInTheDocument()
  })

  it('distinguishes server error (500) from 401 and allows retrying session check', async () => {
    let authMeAttempts = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/shop')) {
        return new Response(JSON.stringify({ shop: mockShop }), { status: 200 })
      }
      if (url.includes('/auth/me')) {
        authMeAttempts++
        if (authMeAttempts === 1) {
          return new Response(JSON.stringify({ message: 'Database connection failed', retryable: false }), {
            status: 500,
            headers: { 'X-Request-ID': 'req-err-1' },
          })
        }
        return new Response(JSON.stringify({ user: mockUser }), { status: 200 })
      }
      if (url.includes('/loans/summary')) {
        return new Response(JSON.stringify({ summary: { counts: { overdue: 0 } } }), { status: 200 })
      }
      return new Response(JSON.stringify({}), { status: 200 })
    })

    render(<AppWithBackend />)

    // Should display StartupScreen with error
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /Service unavailable/i })).toBeInTheDocument()
    })
    expect(screen.getAllByText(/Database connection failed/i).length).toBeGreaterThan(0)

    // Click Retry
    const retryButton = screen.getByRole('button', { name: /Retry connecting to the service/i })
    fireEvent.click(retryButton)

    // Next check succeeds and opens app
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Sophea/i })).toBeInTheDocument()
    })
  })

  it('handles token change subscription resetting user to null', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/shop')) return new Response(JSON.stringify({ shop: mockShop }), { status: 200 })
      if (url.includes('/auth/me')) return new Response(JSON.stringify({ user: mockUser }), { status: 200 })
      if (url.includes('/auth/status')) return new Response(JSON.stringify({ setupRequired: false }), { status: 200 })
      return new Response(JSON.stringify({}), { status: 200 })
    })

    render(<AppWithBackend />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Sophea/i })).toBeInTheDocument()
    })

    // Simulate token invalidation
    act(() => {
      setToken(null)
    })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Welcome back/i })).toBeInTheDocument()
    })
  })

  it('handles logout flow by calling /auth/logout and returning to AuthScreen', async () => {
    let loggedOut = false
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/shop')) return new Response(JSON.stringify({ shop: mockShop }), { status: 200 })
      if (url.includes('/auth/me')) {
        if (loggedOut) return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })
        return new Response(JSON.stringify({ user: mockUser }), { status: 200 })
      }
      if (url.includes('/auth/logout')) {
        loggedOut = true
        return new Response(JSON.stringify({ success: true }), { status: 200 })
      }
      if (url.includes('/auth/status')) return new Response(JSON.stringify({ setupRequired: false }), { status: 200 })
      return new Response(JSON.stringify({}), { status: 200 })
    })

    render(<AppWithBackend />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Sophea/i })).toBeInTheDocument()
    })

    // Open profile menu
    const profileTrigger = screen.getByRole('button', { name: /Sophea/i })
    fireEvent.click(profileTrigger)

    const logoutBtn = screen.getByRole('menuitem', { name: /Log out/i })
    fireEvent.click(logoutBtn)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Welcome back/i })).toBeInTheDocument()
    })
  })

  it('guards against late session check response overwriting newer login', async () => {
    let resolveInitialAuthMe: (res: Response) => void
    const slowAuthMePromise = new Promise<Response>((resolve) => {
      resolveInitialAuthMe = resolve
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/shop')) return new Response(JSON.stringify({ shop: mockShop }), { status: 200 })
      if (url.includes('/auth/me')) return slowAuthMePromise
      if (url.includes('/auth/status')) return new Response(JSON.stringify({ setupRequired: false }), { status: 200 })
      if (url.includes('/auth/login')) return new Response(JSON.stringify({ user: mockUser }), { status: 200 })
      return new Response(JSON.stringify({}), { status: 200 })
    })

    render(<AppWithBackend />)

    // Initial check is pending
    expect(screen.getByRole('heading', { level: 1, name: /Checking your access/i })).toBeInTheDocument()

    // An expiry notification opens sign-in while the original check is still pending.
    act(() => setToken(null))

    // Now on AuthScreen
    await waitFor(() => {
      expect(screen.getByPlaceholderText('owner@shop.com')).toBeInTheDocument()
    })

    // Submit sign in
    const emailInput = screen.getByPlaceholderText('owner@shop.com')
    const passInput = screen.getByPlaceholderText('Enter your password')
    fireEvent.change(emailInput, { target: { value: 'sophea@phoneflow.com' } })
    fireEvent.change(passInput, { target: { value: 'password123' } })

    const signInBtn = screen.getByRole('button', { name: /^Sign in$/i })
    fireEvent.click(signInBtn)

    // Authenticated App renders
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Sophea/i })).toBeInTheDocument()
    })

    // Actually deliver the obsolete response after the new login.
    await act(async () => {
      resolveInitialAuthMe!(new Response(JSON.stringify({ user: { ...mockUser, name: 'Previous user' } })))
    })
    expect(screen.getByRole('button', { name: /Sophea/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Previous user/i })).not.toBeInTheDocument()
  })

  it('does not restore a pending session after an expiry notification', async () => {
    let finish!: (response: Response) => void
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).includes('/shop')) return new Response(JSON.stringify({ shop: mockShop }))
      if (String(input).includes('/auth/me')) return new Promise<Response>((resolve) => { finish = resolve })
      return new Response(JSON.stringify({ setupRequired: false }))
    })
    render(<AppWithBackend />)
    act(() => setToken(null))
    await screen.findByPlaceholderText('owner@shop.com')
    await act(async () => { finish(new Response(JSON.stringify({ user: mockUser }))) })
    expect(getSessionUser()).toBeNull()
    expect(screen.getByPlaceholderText('owner@shop.com')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sophea/i })).not.toBeInTheDocument()
  })

  it('safely handles unmount while /auth/me is in flight without errors', async () => {
    let resolveAuthMe: (res: Response) => void
    const authMePromise = new Promise<Response>((resolve) => {
      resolveAuthMe = resolve
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/auth/me')) return authMePromise
      return new Response(JSON.stringify({}), { status: 200 })
    })

    const { unmount } = render(<AppWithBackend />)
    expect(screen.getByRole('heading', { level: 1, name: /Checking your access/i })).toBeInTheDocument()

    // Unmount while in flight
    unmount()

    // Late resolution
    await act(async () => {
      resolveAuthMe!(new Response(JSON.stringify({ user: mockUser }), { status: 200 }))
    })
  })

  it('dismisses workspace overlay automatically after 8-second safety timeout', async () => {
    window.history.replaceState({}, '', '/dashboard')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/shop')) return new Response(JSON.stringify({ shop: mockShop }), { status: 200 })
      if (url.includes('/auth/me')) return new Response(JSON.stringify({ user: mockUser }), { status: 200 })
      if (url.endsWith('/dashboard')) return new Promise<Response>(() => {})
      return new Response(JSON.stringify({}), { status: 200 })
    })

    try {
      const { container } = render(<AppWithBackend />)

      // Advance past fetch / microtasks
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })
      expect(container.querySelector('.startup-screen-overlay')).toBeInTheDocument()

      // Advance safety timer by 8,000ms
      await act(async () => {
        vi.advanceTimersByTime(8_000)
      })

      // Overlay should be dismissed
      expect(container.querySelector('.startup-screen-overlay')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('synchronizes theme and font size with documentElement and safeStorage', async () => {
    safeStorage.setItem(STORAGE_KEYS.THEME, 'light')
    safeStorage.setItem(STORAGE_KEYS.FONT_SIZE, 'comfortable')

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({}), { status: 401 }))

    render(<AppWithBackend />)

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(document.documentElement.dataset.fontSize).toBe('comfortable')
  })

  it('allows toggling theme in authenticated app and updates safeStorage', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/shop')) return new Response(JSON.stringify({ shop: mockShop }), { status: 200 })
      if (url.includes('/auth/me')) return new Response(JSON.stringify({ user: mockUser }), { status: 200 })
      return new Response(JSON.stringify({}), { status: 200 })
    })

    render(<AppWithBackend />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Sophea/i })).toBeInTheDocument()
    })

    const themeToggleBtn = screen.getByLabelText(/Switch to (light|dark) mode/i)
    fireEvent.click(themeToggleBtn)

    expect(safeStorage.getItem(STORAGE_KEYS.THEME)).toBe('light')
  })
})
