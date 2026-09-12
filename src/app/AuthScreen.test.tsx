import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AuthScreen from './AuthScreen'
import type { SessionUser, ShopProfile } from '../lib/api'
import { safeStorage } from '../lib/storage'

const mockShop: ShopProfile = {
  name: 'PhoneFlow Shop',
  subtitle: 'Store & Repairs',
  phone: '',
  email: '',
  address: '',
  taxId: '',
  logoUrl: '',
  receiptFooter: 'Thank you for your business.',
}

const mockUser: SessionUser = {
  id: 'usr-1',
  name: 'Store Owner',
  email: 'owner@phoneflow.com',
  role: 'OWNER',
  active: true,
}

describe('AuthScreen regression tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    safeStorage.removeItem('phoneflow_restore_success', 'session')
  })

  it('displays loading connection status until /auth/status responds', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
    render(<AuthScreen onAuthenticated={vi.fn()} theme="dark" shop={mockShop} />)

    expect(screen.getByText(/Checking secure connection…/i)).toBeInTheDocument()
  })

  it('displays error if /auth/status request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Failed to fetch'))

    render(<AuthScreen onAuthenticated={vi.fn()} theme="dark" shop={mockShop} />)

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/temporarily unavailable/i)
    })
  })

  it('renders standard sign-in form when setupRequired is false', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ setupRequired: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    render(<AuthScreen onAuthenticated={vi.fn()} theme="dark" shop={mockShop} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('owner@shop.com')).toBeInTheDocument()
    })

    expect(screen.getByRole('heading', { name: /Welcome back/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Sign in$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Use one-time pairing code/i })).toBeInTheDocument()
  })

  it('handles successful sign-in with email and password', async () => {
    const onAuthenticated = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/auth/status')) {
        return new Response(JSON.stringify({ setupRequired: false }), { status: 200 })
      }
      if (url.includes('/auth/login')) {
        const body = JSON.parse(String(init?.body || '{}'))
        expect(body.email).toBe('owner@phoneflow.com')
        expect(body.password).toBe('correctpassword')
        return new Response(JSON.stringify({ user: mockUser }), { status: 200 })
      }
      return new Response('Not found', { status: 404 })
    })

    const user = userEvent.setup()
    render(<AuthScreen onAuthenticated={onAuthenticated} theme="dark" shop={mockShop} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('owner@shop.com')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText('owner@shop.com'), 'owner@phoneflow.com')
    await user.type(screen.getByPlaceholderText('Enter your password'), 'correctpassword')
    await user.click(screen.getByRole('button', { name: /^Sign in$/i }))

    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledWith(mockUser)
    })
  })

  it('displays "Invalid email or password" error on 401 from /auth/login with role="alert"', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/auth/status')) {
        return new Response(JSON.stringify({ setupRequired: false }), { status: 200 })
      }
      if (url.includes('/auth/login')) {
        return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })
      }
      return new Response('Not found', { status: 404 })
    })

    const user = userEvent.setup()
    render(<AuthScreen onAuthenticated={vi.fn()} theme="dark" shop={mockShop} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('owner@shop.com')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText('owner@shop.com'), 'wrong@phoneflow.com')
    await user.type(screen.getByPlaceholderText('Enter your password'), 'badpassword')
    await user.click(screen.getByRole('button', { name: /^Sign in$/i }))

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/Invalid email or password/i)
    })
  })

  it('prevents duplicate in-flight submissions and shows "Please wait…"', async () => {
    let resolveLoginPromise: (res: Response) => void
    const loginPromise = new Promise<Response>((resolve) => {
      resolveLoginPromise = resolve
    })

    let loginCalls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/auth/status')) {
        return new Response(JSON.stringify({ setupRequired: false }), { status: 200 })
      }
      if (url.includes('/auth/login')) {
        loginCalls++
        return loginCalls === 1 ? loginPromise : new Response(JSON.stringify({ user: mockUser }), { status: 200 })
      }
      return new Response('Not found', { status: 404 })
    })

    const user = userEvent.setup()
    render(<AuthScreen onAuthenticated={vi.fn()} theme="dark" shop={mockShop} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('owner@shop.com')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText('owner@shop.com'), 'owner@phoneflow.com')
    await user.type(screen.getByPlaceholderText('Enter your password'), 'secret1234')

    const submitBtn = screen.getByRole('button', { name: /^Sign in$/i })
    act(() => {
      const form = submitBtn.closest('form')!
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    // First click puts button into busy state
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Please wait…/i })).toBeDisabled()
    })
    expect(loginCalls).toBe(1)

    // Subsequent click attempt while in-flight should be ignored
    await user.click(screen.getByRole('button', { name: /Please wait…/i }))
    expect(loginCalls).toBe(1)

    // Complete login
    resolveLoginPromise!(new Response(JSON.stringify({ message: 'Invalid credentials' }), { status: 401 }))
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: /^Sign in$/i }))
    expect(loginCalls).toBe(2)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Please wait…/i })).not.toBeInTheDocument()
    })
  })

  it('transitions to 2FA challenge mode when requiresTwoFactor is returned', async () => {
    const onAuthenticated = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/auth/status')) {
        return new Response(JSON.stringify({ setupRequired: false }), { status: 200 })
      }
      if (url.includes('/auth/login')) {
        return new Response(JSON.stringify({
          requiresTwoFactor: true,
          challengeToken: 'chal-token-999',
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          account: { name: 'Owner Account' },
        }), { status: 200 })
      }
      if (url.includes('/auth/2fa/verify-login')) {
        const body = JSON.parse(String(init?.body || '{}'))
        expect(body.challengeToken).toBe('chal-token-999')
        if (body.code === '123456') {
          return new Response(JSON.stringify({ user: mockUser }), { status: 200 })
        }
        return new Response(JSON.stringify({ message: 'Authenticator or recovery code is invalid' }), { status: 401 })
      }
      return new Response('Not found', { status: 404 })
    })

    const user = userEvent.setup()
    render(<AuthScreen onAuthenticated={onAuthenticated} theme="dark" shop={mockShop} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('owner@shop.com')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText('owner@shop.com'), 'owner@phoneflow.com')
    await user.type(screen.getByPlaceholderText('Enter your password'), 'password123')
    await user.click(screen.getByRole('button', { name: /^Sign in$/i }))

    // Now in 2FA mode
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Verify it’s you/i })).toBeInTheDocument()
      expect(screen.getByText(/for Owner Account/i)).toBeInTheDocument()
    })

    const twoFactorInput = screen.getByPlaceholderText(/123456 or PF2F-…/i)
    expect(twoFactorInput).toBeInTheDocument()

    // Test invalid 2FA code
    await user.type(twoFactorInput, '000000')
    await user.click(screen.getByRole('button', { name: /Verify and sign in/i }))

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/Authenticator or recovery code is invalid/i)
    })

    // Test "Back to password" button clears 2FA state and error
    await user.click(screen.getByRole('button', { name: /Back to password/i }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Welcome back/i })).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    // Sign in again into 2FA and submit valid code
    await user.type(screen.getByPlaceholderText('owner@shop.com'), 'owner@phoneflow.com')
    await user.type(screen.getByPlaceholderText('Enter your password'), 'password123')
    await user.click(screen.getByRole('button', { name: /^Sign in$/i }))

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/123456 or PF2F-…/i)).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText(/123456 or PF2F-…/i), '123456')
    await user.click(screen.getByRole('button', { name: /Verify and sign in/i }))

    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledWith(mockUser)
    })
  })

  it('supports pairing mode: toggle, input, 401 error, and successful redeem', async () => {
    const onAuthenticated = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/auth/status')) {
        return new Response(JSON.stringify({ setupRequired: false }), { status: 200 })
      }
      if (url.includes('/auth/pairing/redeem')) {
        const body = JSON.parse(String(init?.body || '{}'))
        if (body.code === '654321') {
          return new Response(JSON.stringify({ user: mockUser }), { status: 200 })
        }
        return new Response(JSON.stringify({ message: 'Invalid pairing code' }), { status: 401 })
      }
      return new Response('Not found', { status: 404 })
    })

    const user = userEvent.setup()
    render(<AuthScreen onAuthenticated={onAuthenticated} theme="dark" shop={mockShop} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Use one-time pairing code/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Use one-time pairing code/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Pair this device/i })).toBeInTheDocument()
    })

    const pairingInput = screen.getByPlaceholderText('000000')
    expect(pairingInput).toBeInTheDocument()

    // Test invalid code
    await user.type(pairingInput, '111111')
    await user.click(screen.getByRole('button', { name: /Pair device/i }))

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/Pairing code is invalid or expired/i)
    })

    // Clear and enter valid pairing code
    await user.clear(pairingInput)
    await user.type(pairingInput, '654321')
    await user.click(screen.getByRole('button', { name: /Pair device/i }))

    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledWith(mockUser)
    })
  })

  it('renders bootstrap form when setupRequired is true and calls /auth/bootstrap', async () => {
    const onAuthenticated = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/auth/status')) {
        return new Response(JSON.stringify({ setupRequired: true }), { status: 200 })
      }
      if (url.includes('/auth/bootstrap')) {
        const body = JSON.parse(String(init?.body || '{}'))
        expect(body.name).toBe('First Owner')
        expect(body.email).toBe('first@owner.com')
        expect(body.password).toBe('initialpassword')
        return new Response(JSON.stringify({ user: mockUser }), { status: 200 })
      }
      return new Response('Not found', { status: 404 })
    })

    const user = userEvent.setup()
    render(<AuthScreen onAuthenticated={onAuthenticated} theme="dark" shop={mockShop} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Shop owner')).toBeInTheDocument()
    })

    expect(screen.getByRole('heading', { name: /Create owner account/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('owner@shop.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Create shop account/i })).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Shop owner'), 'First Owner')
    await user.type(screen.getByPlaceholderText('owner@shop.com'), 'first@owner.com')
    await user.type(screen.getByPlaceholderText('Enter your password'), 'initialpassword')
    await user.click(screen.getByRole('button', { name: /Create shop account/i }))

    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledWith(mockUser)
    })
  })

  it('displays restore success notice from session storage and cleans it up', async () => {
    safeStorage.setJSON('phoneflow_restore_success', {
      restoredAt: '2026-09-12T10:30:00.000Z',
      filename: 'backup.json',
    }, 'session')

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ setupRequired: false }), { status: 200 })
    )

    render(<AuthScreen onAuthenticated={vi.fn()} theme="dark" shop={mockShop} />)

    await waitFor(() => {
      expect(screen.getByText(/Restore completed successfully/i)).toBeInTheDocument()
      expect(screen.getByText(/Shop data was restored to/i)).toBeInTheDocument()
    })

    // Should have removed the key from session storage so subsequent refreshes don't show it again
    expect(safeStorage.getJSON('phoneflow_restore_success', null, undefined, 'session')).toBeNull()
  })
})
