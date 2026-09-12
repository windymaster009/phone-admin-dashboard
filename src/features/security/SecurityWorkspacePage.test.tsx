import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SecurityWorkspacePage from './SecurityWorkspacePage'
import { mockOwnerUser } from '../../test/testUtils'
import { setStoredSessionUser } from '../../lib/storage'

const mockSessions = [
  {
    id: 'session-1',
    deviceName: 'MacBook Pro — Chrome',
    current: true,
    revokedAt: null,
    createdAt: '2026-09-10T08:00:00.000Z',
    lastActiveAt: '2026-09-11T09:00:00.000Z',
    ipAddress: '127.0.0.1',
  },
  {
    id: 'session-2',
    deviceName: 'iPhone 15 — Safari',
    current: false,
    revokedAt: null,
    createdAt: '2026-09-09T08:00:00.000Z',
    lastActiveAt: '2026-09-10T09:00:00.000Z',
    ipAddress: '192.168.1.50',
  },
]

const mockStaffUsers = [
  {
    _id: 'user-1',
    id: 'user-1',
    name: 'Owner User',
    username: 'owner',
    role: 'OWNER' as const,
    active: true,
    lastActiveAt: '2026-09-11T09:00:00.000Z',
  },
  {
    _id: 'user-2',
    id: 'user-2',
    name: 'Inactive Staff',
    username: 'staff2',
    role: 'CASHIER' as const,
    active: false,
    lastActiveAt: '2026-08-01T09:00:00.000Z',
  },
]

describe('SecurityWorkspacePage delete and revocation flows', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setStoredSessionUser(mockOwnerUser)
  })

  it('successfully deletes an inactive staff account, reloads users, and displays success toast', async () => {
    let usersList = [...mockStaffUsers]
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/api/users/user-2') && method === 'DELETE') {
        usersList = usersList.filter((u) => u.id !== 'user-2')
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ success: true }) } as Response
      }
      if (url.includes('/api/users')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ users: usersList }) } as Response
      }
      if (url.includes('/api/security/sessions')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ sessions: mockSessions }) } as Response
      }
      if (url.includes('/api/security/events')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ events: [] }) } as Response
      }
      if (url.includes('/api/security/two-factor')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: false }) } as Response
      }

      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const user = userEvent.setup()
    render(<SecurityWorkspacePage />)

    await waitFor(() => {
      expect(screen.getByText('Inactive Staff')).toBeInTheDocument()
    })

    // Click delete user button
    const deleteButton = screen.getByRole('button', { name: /Delete Inactive Staff/i })
    await user.click(deleteButton)

    // Window confirm was called
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Permanently delete Inactive Staff?'))

    // Success toast appears
    await waitFor(() => {
      expect(screen.getByText('Staff account deleted successfully.')).toBeInTheDocument()
    })

    // User is removed from list
    expect(screen.queryByText('Inactive Staff')).not.toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/users/user-2'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('does not delete staff account or show toast when user cancels confirmation', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/users')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ users: mockStaffUsers }) } as Response
      }
      if (url.includes('/api/security/sessions')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ sessions: mockSessions }) } as Response
      }
      if (url.includes('/api/security/events')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ events: [] }) } as Response
      }
      if (url.includes('/api/security/two-factor')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: false }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    vi.spyOn(window, 'confirm').mockReturnValue(false)

    const user = userEvent.setup()
    render(<SecurityWorkspacePage />)

    await waitFor(() => {
      expect(screen.getByText('Inactive Staff')).toBeInTheDocument()
    })

    const deleteButton = screen.getByRole('button', { name: /Delete Inactive Staff/i })
    await user.click(deleteButton)

    // Confirmation rejected
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'DELETE' }),
    )

    // User remains in list and no toast
    expect(screen.getByText('Inactive Staff')).toBeInTheDocument()
    expect(screen.queryByText('Staff account deleted successfully.')).not.toBeInTheDocument()
  })

  it('successfully revokes a session, displays success toast, and reloads sessions', async () => {
    let sessionList = [...mockSessions]
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/api/security/sessions/session-2') && method === 'DELETE') {
        sessionList = sessionList.filter((s) => s.id !== 'session-2')
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ success: true }) } as Response
      }
      if (url.includes('/api/security/sessions')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ sessions: sessionList }) } as Response
      }
      if (url.includes('/api/users')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ users: mockStaffUsers }) } as Response
      }
      if (url.includes('/api/security/events')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ events: [] }) } as Response
      }
      if (url.includes('/api/security/two-factor')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: false }) } as Response
      }

      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const user = userEvent.setup()
    render(<SecurityWorkspacePage />)

    await waitFor(() => {
      expect(screen.getByText('iPhone 15 — Safari')).toBeInTheDocument()
    })

    // Click revoke session button
    const revokeButton = screen.getByRole('button', { name: /Sign out iPhone 15 — Safari/i })
    await user.click(revokeButton)

    // Confirm dialog was triggered
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Sign out iPhone 15 — Safari?'))

    // Success toast appears
    await waitFor(() => {
      expect(screen.getByText('Device signed out successfully.')).toBeInTheDocument()
    })

    // Device session is removed
    expect(screen.queryByText('iPhone 15 — Safari')).not.toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/security/sessions/session-2'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('does not revoke session or show toast when user cancels confirmation', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/security/sessions')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ sessions: mockSessions }) } as Response
      }
      if (url.includes('/api/users')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ users: mockStaffUsers }) } as Response
      }
      if (url.includes('/api/security/events')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ events: [] }) } as Response
      }
      if (url.includes('/api/security/two-factor')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: false }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    vi.spyOn(window, 'confirm').mockReturnValue(false)

    const user = userEvent.setup()
    render(<SecurityWorkspacePage />)

    await waitFor(() => {
      expect(screen.getByText('iPhone 15 — Safari')).toBeInTheDocument()
    })

    const revokeButton = screen.getByRole('button', { name: /Sign out iPhone 15 — Safari/i })
    await user.click(revokeButton)

    // No DELETE request made
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'DELETE' }),
    )

    // No toast shown
    expect(screen.queryByText('Device signed out successfully.')).not.toBeInTheDocument()
  })

  it('displays error and does not show toast when staff deletion fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/api/users/user-2') && method === 'DELETE') {
        return { ok: false, status: 400, headers: new Headers(), json: async () => ({ message: 'Cannot delete user with open register' }) } as Response
      }
      if (url.includes('/api/users')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ users: mockStaffUsers }) } as Response
      }
      if (url.includes('/api/security/sessions')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ sessions: mockSessions }) } as Response
      }
      if (url.includes('/api/security/events')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ events: [] }) } as Response
      }
      if (url.includes('/api/security/two-factor')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: false }) } as Response
      }

      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const user = userEvent.setup()
    render(<SecurityWorkspacePage />)

    await waitFor(() => {
      expect(screen.getByText('Inactive Staff')).toBeInTheDocument()
    })

    const deleteButton = screen.getByRole('button', { name: /Delete Inactive Staff/i })
    await user.click(deleteButton)

    // Error is displayed
    await waitFor(() => {
      expect(screen.getByText(/Cannot delete user with open register/i)).toBeInTheDocument()
    })

    // No success toast shown
    expect(screen.queryByText('Staff account deleted successfully.')).not.toBeInTheDocument()
  })
})

describe('SecurityWorkspacePage security activity feed and filters', () => {
  const mockSecurityEvents = [
    {
      id: 'sec-1',
      _id: 'sec-1',
      action: 'LOGIN',
      entity: 'AUTH_SESSION',
      user: 'Owner User',
      createdAt: new Date(Date.now() - 5000).toISOString(),
      details: { deviceName: 'Chrome on Mac' },
      ipAddress: '127.0.0.1',
    },
    {
      id: 'sec-2',
      _id: 'sec-2',
      action: 'LOGIN_FAILED',
      entity: 'AUTH_SESSION',
      user: 'Unknown',
      createdAt: new Date(Date.now() - 15000).toISOString(),
      details: { email: 'bad@attempt.com' },
      ipAddress: '::1',
    },
  ]

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    setStoredSessionUser(mockOwnerUser)
  })

  it('renders security activity with formatted local device and supports category filtering', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/security/events')) {
        const urlObj = new URL(url, 'http://localhost')
        const cat = urlObj.searchParams.get('filter') || urlObj.searchParams.get('category')
        const list = cat === 'FAILED_SIGN_IN'
          ? [mockSecurityEvents[1]]
          : mockSecurityEvents

        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ events: list, nextCursor: null, hasMore: false }),
        } as Response
      }
      if (url.includes('/api/security/sessions')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ sessions: mockSessions }) } as Response
      }
      if (url.includes('/api/users')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ users: mockStaffUsers }) } as Response
      }
      if (url.includes('/api/security/two-factor')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: false }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<SecurityWorkspacePage />)

    // Verify events render with natural labels
    expect(await screen.findByText('Signed in')).toBeInTheDocument()
    expect(screen.getByText('Failed sign-in')).toBeInTheDocument()

    // 127.0.0.1 and ::1 are formatted as Local device
    const localDeviceElements = screen.getAllByText(/Local device/i)
    expect(localDeviceElements.length).toBeGreaterThanOrEqual(1)

    // Click "Failed" filter chip
    const failedChip = screen.getByRole('button', { name: /^Failed$/i })
    await user.click(failedChip)

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('filter=FAILED_SIGN_IN'),
        expect.anything()
      )
    })

    expect(screen.getByText('Failed sign-in')).toBeInTheDocument()
    expect(screen.queryByText('Signed in')).not.toBeInTheDocument()
  })

  it('supports Clear from view without deleting database records, and supports Undo', async () => {
    const user = userEvent.setup()
    let deleteCalled = false

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase()
      if (method === 'DELETE') deleteCalled = true

      const url = String(input)
      if (url.includes('/api/security/events')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ events: mockSecurityEvents, nextCursor: null, hasMore: false }),
        } as Response
      }
      if (url.includes('/api/security/sessions')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ sessions: mockSessions }) } as Response
      }
      if (url.includes('/api/users')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ users: mockStaffUsers }) } as Response
      }
      if (url.includes('/api/security/two-factor')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: false }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<SecurityWorkspacePage />)

    expect(await screen.findByText('Signed in')).toBeInTheDocument()

    // Click Clear from view
    const clearBtn = screen.getByRole('button', { name: /Clear from view/i })
    await user.click(clearBtn)

    // Must NOT call DELETE on database
    expect(deleteCalled).toBe(false)

    // Explanatory banner appears
    expect(await screen.findByText(/Audit records are retained/i)).toBeInTheDocument()

    // Events are hidden from view
    expect(screen.queryByText('Signed in')).not.toBeInTheDocument()

    // Click Undo
    const undoBtn = screen.getByRole('button', { name: /Undo/i })
    await user.click(undoBtn)

    // Events reappear
    expect(await screen.findByText('Signed in')).toBeInTheDocument()
  })
})

describe('SecurityWorkspacePage 2FA, staff creation, pairing and submission guards', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setStoredSessionUser(mockOwnerUser)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('displays error inside user form when staff creation fails and prevents in-flight duplicate submits', async () => {
    let postUserCalls = 0
    let resolveCreatePromise: (res: any) => void
    const createPromise = new Promise((resolve) => {
      resolveCreatePromise = resolve
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/api/security/sessions')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ sessions: mockSessions }) } as Response
      }
      if (url.includes('/api/security/events')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ events: [], nextCursor: null, hasMore: false }) } as Response
      }
      if (url.includes('/api/security/two-factor')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ eligible: true, configured: true, enabled: false }) } as Response
      }
      if (url.includes('/api/users') && method === 'POST') {
        postUserCalls++
        return createPromise as Promise<Response>
      }
      if (url.includes('/api/users')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ users: mockStaffUsers }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<SecurityWorkspacePage />)

    expect(await screen.findByText('User management')).toBeInTheDocument()

    // Click "Add user"
    await user.click(screen.getByRole('button', { name: /Add user/i }))
    expect(screen.getByPlaceholderText('Staff name')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Staff name'), 'New Cashier')
    await user.type(screen.getByPlaceholderText('staff@example.com'), 'cashier@phoneflow.com')
    await user.type(screen.getByPlaceholderText('Minimum 8 characters'), 'password123')

    const submitBtn = screen.getByRole('button', { name: /Create user/i })
    act(() => {
      const form = submitBtn.closest('form')!
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    // Button should now indicate in-flight busy state
    expect(screen.getByRole('button', { name: /Creating.../i })).toBeDisabled()
    expect(postUserCalls).toBe(1)

    // Attempt second submission while in-flight
    await user.click(screen.getByRole('button', { name: /Creating.../i }))
    expect(postUserCalls).toBe(1)

    // Fail the request
    resolveCreatePromise!({
      ok: false,
      status: 400,
      headers: new Headers(),
      json: async () => ({ message: 'Email address is already in use' }),
    } as Response)

    // Error appears inside the form
    await waitFor(() => {
      const formAlert = document.querySelector('.security-form-error')
      expect(formAlert).toBeInTheDocument()
      expect(formAlert).toHaveTextContent(/Email address is already in use/i)
    })
    // Failure releases the synchronous guard for a subsequent attempt.
    await user.click(screen.getByRole('button', { name: /Create user/i }))
    expect(postUserCalls).toBe(2)
  })

  it('completes 2FA setup, validates TOTP code with error inside card, and enables 2FA with recovery codes', async () => {
    let twoFactorEnabledState = false
    let enableCalls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/api/security/sessions')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ sessions: mockSessions }) } as Response
      }
      if (url.includes('/api/security/events')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ events: [], nextCursor: null, hasMore: false }) } as Response
      }
      if (url.includes('/api/users')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ users: mockStaffUsers }) } as Response
      }
      if (url.includes('/api/security/two-factor/setup') && method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            setupId: 'setup-test-456',
            secret: 'HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ',
            otpauthUri: 'otpauth://totp/PhoneFlow:owner?secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ',
          }),
        } as Response
      }
      if (url.includes('/api/security/two-factor/enable') && method === 'POST') {
        enableCalls++
        const body = JSON.parse(String(init?.body || '{}'))
        if (body.code !== '123456') {
          return {
            ok: false,
            status: 400,
            headers: new Headers(),
            json: async () => ({ message: 'Invalid 6-digit authenticator code' }),
          } as Response
        }
        twoFactorEnabledState = true
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            recoveryCodes: ['PF2F-ABCD1234', 'PF2F-EFGH5678'],
          }),
        } as Response
      }
      if (url.includes('/api/security/two-factor')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            eligible: true,
            configured: true,
            enabled: twoFactorEnabledState,
            recoveryCodesRemaining: twoFactorEnabledState ? 2 : 0,
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<SecurityWorkspacePage />)

    expect(await screen.findByText(/Set up 2FA/i)).toBeInTheDocument()

    // Click "Set up 2FA"
    await user.click(screen.getByRole('button', { name: /Set up 2FA/i }))

    // Secret and QR setup should appear
    expect(await screen.findByText('HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ')).toBeInTheDocument()
    expect(screen.getByText(/Scan with Google Authenticator/i)).toBeInTheDocument()

    const codeInput = screen.getByPlaceholderText('000000')
    const verifyBtn = screen.getByRole('button', { name: /Verify and enable 2FA/i })

    // Button disabled until 6 digits entered
    expect(verifyBtn).toBeDisabled()
    await user.type(codeInput, '000000')
    expect(verifyBtn).not.toBeDisabled()

    // Submit invalid code -> shows error inside 2FA card
    act(() => {
      verifyBtn.click()
      verifyBtn.click()
    })
    expect(enableCalls).toBe(1)
    await waitFor(() => {
      const cardAlert = document.querySelector('.security-2fa-error')
      expect(cardAlert).toBeInTheDocument()
      expect(cardAlert).toHaveTextContent(/Invalid 6-digit authenticator code/i)
    })

    // Submit valid code
    await user.clear(codeInput)
    await user.type(codeInput, '123456')
    await user.click(verifyBtn)

    // Recovery codes appear
    expect(await screen.findByText(/Save these recovery codes now/i)).toBeInTheDocument()
    expect(enableCalls).toBe(2)
    expect(screen.getByText('PF2F-ABCD1234')).toBeInTheDocument()
    expect(screen.getByText('PF2F-EFGH5678')).toBeInTheDocument()
  })

  it('handles 2FA disable and recovery code regeneration when 2FA is active', async () => {
    let twoFactorEnabled = true
    let disabledCalled = false
    let regeneratedCalled = false

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/api/security/sessions')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ sessions: mockSessions }) } as Response
      }
      if (url.includes('/api/security/events')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ events: [], nextCursor: null, hasMore: false }) } as Response
      }
      if (url.includes('/api/users')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ users: mockStaffUsers }) } as Response
      }
      if (url.includes('/api/security/two-factor/recovery-codes') && method === 'POST') {
        regeneratedCalled = true
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ recoveryCodes: ['PF2F-NEW1111', 'PF2F-NEW2222'] }),
        } as Response
      }
      if (url.includes('/api/security/two-factor/disable') && method === 'POST') {
        disabledCalled = true
        twoFactorEnabled = false
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ success: true }) } as Response
      }
      if (url.includes('/api/security/two-factor')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            eligible: true,
            configured: true,
            enabled: twoFactorEnabled,
            enabledAt: '2026-09-12T00:00:00.000Z',
            recoveryCodesRemaining: 5,
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<SecurityWorkspacePage />)

    expect(await screen.findByText(/Authenticator protection is on/i)).toBeInTheDocument()

    const codeInput = screen.getByPlaceholderText(/123456 or PF2F-…/i)
    const newCodesBtn = screen.getByRole('button', { name: /New recovery codes/i })
    const disableBtn = screen.getByRole('button', { name: /Disable 2FA/i })

    // Clicking without code shows error inside 2FA card
    await user.click(newCodesBtn)
    await waitFor(() => {
      const cardError = document.querySelector('.security-2fa-error')
      expect(cardError).toBeInTheDocument()
      expect(cardError).toHaveTextContent(/Enter a current authenticator or recovery code first/i)
    })

    // Type code and regenerate recovery codes
    await user.type(codeInput, '123456')
    await user.click(newCodesBtn)

    await waitFor(() => {
      expect(regeneratedCalled).toBe(true)
      expect(screen.getByText('PF2F-NEW1111')).toBeInTheDocument()
    })

    // Now test disable with code
    await user.type(screen.getByPlaceholderText(/123456 or PF2F-…/i), '123456')
    await user.click(disableBtn)

    await waitFor(() => {
      expect(disabledCalled).toBe(true)
      expect(screen.getByText(/Set up 2FA/i)).toBeInTheDocument()
    })
  })

  it('generates Android pairing code and shows expiry countdown', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/api/security/sessions')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ sessions: mockSessions }) } as Response
      }
      if (url.includes('/api/security/events')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ events: [], nextCursor: null, hasMore: false }) } as Response
      }
      if (url.includes('/api/users')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ users: mockStaffUsers }) } as Response
      }
      if (url.includes('/api/security/two-factor')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ eligible: true, configured: true, enabled: false }) } as Response
      }
      if (url.includes('/api/security/android-pairing') && method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            code: '741852',
            expiresAt: new Date(Date.now() + 180000).toISOString(),
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<SecurityWorkspacePage />)

    expect(await screen.findByText('Pair PhoneFlow Android')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Generate pairing code/i }))

    expect(await screen.findByText('741852')).toBeInTheDocument()
    expect(screen.getByText(/Expires in/i)).toBeInTheDocument()
  })
})
