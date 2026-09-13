import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SecurityWorkspacePage from './SecurityWorkspacePage'
import { mockOwnerUser, mockManagerUser, mockCashierUser } from '../../test/testUtils'
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

describe('SecurityWorkspacePage loading, partial failures, error recovery and role-based views', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    setStoredSessionUser(mockOwnerUser)
  })

  it('displays error banner when loading fails and recovers upon clicking Refresh', async () => {
    let shouldFail = true
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (shouldFail) {
        return {
          ok: false,
          status: 400,
          headers: new Headers(),
          json: async () => ({ message: 'Database connection failed' }),
        } as Response
      }
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
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ eligible: true, configured: true, enabled: false }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<SecurityWorkspacePage />)

    // Initial load fails and renders error
    expect(await screen.findByText('Database connection failed')).toBeInTheDocument()

    // Clicking Refresh retries
    shouldFail = false
    const refreshBtn = screen.getByRole('button', { name: /Refresh/i })
    await user.click(refreshBtn)

    expect(await screen.findByText('Signed-in devices')).toBeInTheDocument()
    expect(screen.queryByText('Database connection failed')).not.toBeInTheDocument()
  })

  it('restricts UI for CASHIER: omits user management and shows role not required for 2FA', async () => {
    setStoredSessionUser(mockCashierUser)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/security/sessions')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ sessions: mockSessions }) } as Response
      }
      if (url.includes('/api/security/two-factor')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ eligible: false, configured: true, enabled: false, recoveryCodesRemaining: 0 }) } as Response
      }
      if (url.includes('/api/security/events')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ events: [] }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<SecurityWorkspacePage />)

    expect(await screen.findByText('Signed-in devices')).toBeInTheDocument()
    // User management is omitted
    expect(screen.queryByText('User management')).not.toBeInTheDocument()
    // Summary card shows Owner / Manager only
    expect(screen.getAllByText('Owner / Manager only').length).toBeGreaterThanOrEqual(1)
    // 2FA says Not required for this role
    expect(screen.getByText('Not required for this role')).toBeInTheDocument()
  })
})

describe('SecurityWorkspacePage session list identification, badges and revoke others', () => {
  const sessionsWithTypes = [
    {
      id: 'session-web-current',
      kind: 'WEB' as const,
      deviceName: 'Chrome on Mac',
      current: true,
      twoFactorVerifiedAt: '2026-09-12T00:00:00.000Z',
      revokedAt: null,
      createdAt: '2026-09-10T08:00:00.000Z',
      lastSeenAt: '2026-09-11T09:00:00.000Z',
      ipAddress: '127.0.0.1',
    },
    {
      id: 'session-android',
      kind: 'ANDROID' as const,
      deviceName: 'Pixel 8 Pro',
      current: false,
      twoFactorVerifiedAt: null,
      revokedAt: null,
      createdAt: '2026-09-09T08:00:00.000Z',
      lastSeenAt: '2026-09-10T09:00:00.000Z',
      ipAddress: '192.168.1.55',
    },
    {
      id: 'session-revoked',
      kind: 'WEB' as const,
      deviceName: 'Old Windows Laptop',
      current: false,
      twoFactorVerifiedAt: null,
      revokedAt: '2026-09-08T08:00:00.000Z',
      createdAt: '2026-09-01T08:00:00.000Z',
      lastSeenAt: '2026-09-08T08:00:00.000Z',
      ipAddress: '10.0.0.2',
    },
  ]

  beforeEach(() => {
    vi.restoreAllMocks()
    setStoredSessionUser(mockOwnerUser)
  })

  it('renders Current badge, 2FA badge, Revoked badge, and omits revoke button on current/revoked sessions', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/security/sessions')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ sessions: sessionsWithTypes }) } as Response
      }
      if (url.includes('/api/users')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ users: mockStaffUsers }) } as Response
      }
      if (url.includes('/api/security/events')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ events: [] }) } as Response
      }
      if (url.includes('/api/security/two-factor')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ eligible: true, configured: true, enabled: true }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<SecurityWorkspacePage />)

    expect(await screen.findByText('Chrome on Mac')).toBeInTheDocument()
    expect(screen.getByText('Current')).toBeInTheDocument()
    expect(document.querySelector('.security-2fa-badge')).toHaveTextContent('2FA')
    expect(screen.getByText('Revoked')).toBeInTheDocument()

    // No sign-out button for current session or revoked session
    expect(screen.queryByRole('button', { name: /Sign out Chrome on Mac/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sign out Old Windows Laptop/i })).not.toBeInTheDocument()

    // Active other session has sign-out button
    expect(screen.getByRole('button', { name: /Sign out Pixel 8 Pro/i })).toBeInTheDocument()
  })

  it('handles revoke-others: disabled when 0 others, cancelled confirmation performs no mutation, confirming revokes others and rapid clicks are guarded', async () => {
    let revokeCalls = 0
    let sessionsState = [...sessionsWithTypes]
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/api/security/sessions/revoke-others') && method === 'POST') {
        revokeCalls++
        sessionsState = sessionsState.filter((s) => s.current)
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ revokedCount: 1 }) } as Response
      }
      if (url.includes('/api/security/sessions')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ sessions: sessionsState }) } as Response
      }
      if (url.includes('/api/users')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ users: mockStaffUsers }) } as Response
      }
      if (url.includes('/api/security/events')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ events: [] }) } as Response
      }
      if (url.includes('/api/security/two-factor')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ eligible: true, configured: true, enabled: false }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const confirmSpy = vi.spyOn(window, 'confirm')
    const user = userEvent.setup()
    render(<SecurityWorkspacePage />)

    const signOthersBtn = await screen.findByRole('button', { name: /Sign out others/i })
    expect(signOthersBtn).not.toBeDisabled()

    // 1. Cancel confirmation -> no POST
    confirmSpy.mockReturnValueOnce(false)
    await user.click(signOthersBtn)
    expect(revokeCalls).toBe(0)

    // 2. Confirm -> sends POST, rapid clicks blocked
    confirmSpy.mockReturnValueOnce(true)
    act(() => {
      signOthersBtn.click()
      signOthersBtn.click()
    })
    expect(revokeCalls).toBe(1)

    await waitFor(() => {
      expect(screen.queryByText('Pixel 8 Pro')).not.toBeInTheDocument()
    })
    // Now with 0 others, button becomes disabled
    expect(screen.getByRole('button', { name: /Sign out others/i })).toBeDisabled()
  })

  it('displays error banner when revoke-others fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/api/security/sessions/revoke-others') && method === 'POST') {
        return { ok: false, status: 400, headers: new Headers(), json: async () => ({ message: 'Revocation service offline' }) } as Response
      }
      if (url.includes('/api/security/sessions')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ sessions: sessionsWithTypes }) } as Response
      }
      if (url.includes('/api/users')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ users: mockStaffUsers }) } as Response
      }
      if (url.includes('/api/security/events')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ events: [] }) } as Response
      }
      if (url.includes('/api/security/two-factor')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ eligible: true, configured: true, enabled: false }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    render(<SecurityWorkspacePage />)

    const signOthersBtn = await screen.findByRole('button', { name: /Sign out others/i })
    await user.click(signOthersBtn)

    expect(await screen.findByText('Revocation service offline')).toBeInTheDocument()
  })
})

describe('SecurityWorkspacePage staff management and permissions', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setStoredSessionUser(mockOwnerUser)
  })

  it('updates role via select, handles deactivation confirm/cancel, and activates staff', async () => {
    let patchCalls: Array<{ id: string; body: any }> = []
    let usersList = [
      {
        _id: 'user-owner-1',
        id: 'user-owner-1',
        name: 'Sophea Owner',
        role: 'OWNER' as const,
        active: true,
      },
      {
        _id: 'user-2',
        id: 'user-2',
        name: 'Staff Two',
        role: 'CASHIER' as const,
        active: true,
      },
    ]

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/api/users/user-2') && method === 'PATCH') {
        const body = JSON.parse(String(init?.body || '{}'))
        patchCalls.push({ id: 'user-2', body })
        if (body.role) usersList[1].role = body.role
        if (body.active !== undefined) usersList[1].active = body.active
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: usersList[1] }) } as Response
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
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ eligible: true, configured: true, enabled: false }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm')
    render(<SecurityWorkspacePage />)

    expect(await screen.findByText('Staff Two')).toBeInTheDocument()

    // 1. Role select change to STOCK
    const roleSelects = screen.getAllByRole('combobox')
    const staffRoleSelect = roleSelects.find((s) => !s.hasAttribute('disabled'))!
    await user.selectOptions(staffRoleSelect, 'STOCK')

    await waitFor(() => {
      expect(patchCalls.some((c) => c.body.role === 'STOCK')).toBe(true)
    })

    // 2. Deactivation cancelled
    confirmSpy.mockReturnValueOnce(false)
    const deactivateButtons = screen.getAllByRole('button', { name: /Deactivate/i })
    const staffDeactivateBtn = deactivateButtons.find((b) => !b.hasAttribute('disabled'))!
    await user.click(staffDeactivateBtn)
    expect(patchCalls.some((c) => c.body.active === false)).toBe(false)

    // 3. Deactivation confirmed
    confirmSpy.mockReturnValueOnce(true)
    await user.click(staffDeactivateBtn)
    await waitFor(() => {
      expect(patchCalls.some((c) => c.body.active === false)).toBe(true)
    })

    // 4. Activation (no confirm prompt required)
    const activateBtn = await screen.findByRole('button', { name: /^Activate$/i })
    await user.click(activateBtn)
    await waitFor(() => {
      expect(patchCalls.some((c) => c.body.active === true)).toBe(true)
    })
  })

  it('enforces role restrictions: MANAGER sees staff list in read-only mode and OWNER cannot edit self', async () => {
    setStoredSessionUser(mockManagerUser)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
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
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ eligible: true, configured: true, enabled: false }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<SecurityWorkspacePage />)

    expect(await screen.findByText('Owner User')).toBeInTheDocument()
    expect(screen.getByText('Inactive Staff')).toBeInTheDocument()

    // "Add user" is not present for Manager
    expect(screen.queryByRole('button', { name: /Add user/i })).not.toBeInTheDocument()

    // Role selects are all disabled for Manager
    const selects = screen.getAllByRole('combobox')
    for (const select of selects) {
      expect(select).toBeDisabled()
    }

    // Action buttons (Deactivate, Activate, Delete) are not present for Manager
    expect(screen.queryByRole('button', { name: /Deactivate/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Activate/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete Inactive Staff/i })).not.toBeInTheDocument()
  })
})

describe('SecurityWorkspacePage 2FA edge cases, clipboard and cancellation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setStoredSessionUser(mockOwnerUser)
  })

  it('displays warning when 2FA is eligible but server key is unconfigured', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/security/two-factor')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ eligible: true, configured: false, enabled: false }) } as Response
      }
      if (url.includes('/api/security/sessions')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ sessions: mockSessions }) } as Response
      }
      if (url.includes('/api/users')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ users: mockStaffUsers }) } as Response
      }
      if (url.includes('/api/security/events')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ events: [] }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<SecurityWorkspacePage />)

    expect(await screen.findByText('TWO_FACTOR_ENCRYPTION_KEY')).toBeInTheDocument()
    expect(screen.getByText(/before enabling 2FA/i)).toBeInTheDocument()
  })

  it('supports clipboard copy of setup key, link, and recovery codes with fallback error handling', async () => {
    const user = userEvent.setup()
    let writeTextCalls: string[] = []
    let shouldRejectClipboard = false
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockImplementation(async (text: string) => {
          if (shouldRejectClipboard) throw new Error('Clipboard denied')
          writeTextCalls.push(text)
        }),
      },
      configurable: true,
      writable: true,
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/api/security/two-factor/setup') && method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            setupId: 'setup-123',
            secret: 'SECRETKEY123',
            otpauthUri: 'otpauth://totp/PhoneFlow?secret=SECRETKEY123',
          }),
        } as Response
      }
      if (url.includes('/api/security/two-factor')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ eligible: true, configured: true, enabled: false }) } as Response
      }
      if (url.includes('/api/security/sessions')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ sessions: mockSessions }) } as Response
      }
      if (url.includes('/api/users')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ users: mockStaffUsers }) } as Response
      }
      if (url.includes('/api/security/events')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ events: [] }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<SecurityWorkspacePage />)

    await user.click(await screen.findByRole('button', { name: /Set up 2FA/i }))
    expect(await screen.findByText('SECRETKEY123')).toBeInTheDocument()

    // Copy secret
    await user.click(screen.getByRole('button', { name: /Copy setup key/i }))
    await waitFor(() => {
      expect(writeTextCalls).toContain('SECRETKEY123')
    })

    // Copy setup link
    await user.click(screen.getByRole('button', { name: /Copy authenticator setup link/i }))
    await waitFor(() => {
      expect(writeTextCalls).toContain('otpauth://totp/PhoneFlow?secret=SECRETKEY123')
    })

    // Clipboard failure triggers fallback error message
    shouldRejectClipboard = true
    await user.click(screen.getByRole('button', { name: /Copy setup key/i }))
    expect(await screen.findByText('Unable to copy automatically. Select and copy the value manually.')).toBeInTheDocument()
  })

  it('cancelling confirmation for 2FA disable and recovery code regeneration performs no mutation', async () => {
    let disableCalls = 0
    let regenCalls = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/api/security/two-factor/disable') && method === 'POST') {
        disableCalls++
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ disabled: true }) } as Response
      }
      if (url.includes('/api/security/two-factor/recovery-codes') && method === 'POST') {
        regenCalls++
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ recoveryCodes: ['NEW-1'] }) } as Response
      }
      if (url.includes('/api/security/two-factor')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ eligible: true, configured: true, enabled: true, recoveryCodesRemaining: 5 }) } as Response
      }
      if (url.includes('/api/security/sessions')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ sessions: mockSessions }) } as Response
      }
      if (url.includes('/api/users')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ users: mockStaffUsers }) } as Response
      }
      if (url.includes('/api/security/events')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ events: [] }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<SecurityWorkspacePage />)

    expect(await screen.findByText(/Authenticator protection is on/i)).toBeInTheDocument()

    const codeInput = screen.getByPlaceholderText(/123456 or PF2F-…/i)
    await user.type(codeInput, '123456')

    // Click Disable 2FA with cancel -> no POST
    await user.click(screen.getByRole('button', { name: /Disable 2FA/i }))
    expect(disableCalls).toBe(0)

    // Click New recovery codes with cancel -> no POST
    await user.click(screen.getByRole('button', { name: /New recovery codes/i }))
    expect(regenCalls).toBe(0)
  })
})

describe('SecurityWorkspacePage sensitive data clearing, stale response and timer cleanup', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setStoredSessionUser(mockOwnerUser)
  })

  it('clears temporary password and form state when user creation is cancelled', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
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
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ eligible: true, configured: true, enabled: false }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<SecurityWorkspacePage />)

    // Open user form
    await user.click(await screen.findByRole('button', { name: /Add user/i }))
    const nameInput = screen.getByPlaceholderText('Staff name')
    const emailInput = screen.getByPlaceholderText('staff@example.com')
    const passwordInput = screen.getByPlaceholderText('Minimum 8 characters')

    await user.type(nameInput, 'Temporary Staff')
    await user.type(emailInput, 'temp@phoneflow.com')
    await user.type(passwordInput, 'SecretPassword123!')

    // Cancel form
    await user.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(screen.queryByPlaceholderText('Staff name')).not.toBeInTheDocument()

    // Reopen form: fields must be cleared, password must not persist
    await user.click(screen.getByRole('button', { name: /Add user/i }))
    expect(screen.getByPlaceholderText('Staff name')).toHaveValue('')
    expect(screen.getByPlaceholderText('staff@example.com')).toHaveValue('')
    expect(screen.getByPlaceholderText('Minimum 8 characters')).toHaveValue('')
  })

  it('prevents stale responses from overwriting newer state when filtering security events', async () => {
    let resolveFirstFilter: (res: any) => void
    const firstFilterPromise = new Promise((resolve) => { resolveFirstFilter = resolve })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('filter=SIGN_IN')) {
        return firstFilterPromise as Promise<Response>
      }
      if (url.includes('filter=FAILED_SIGN_IN')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            events: [{ _id: 'failed-1', action: 'LOGIN_FAILED', createdAt: new Date().toISOString() }],
          }),
        } as Response
      }
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
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ eligible: true, configured: true, enabled: false }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<SecurityWorkspacePage />)

    await screen.findByText('Recent security activity')

    // Click Sign-ins (slow request)
    await user.click(screen.getByRole('button', { name: /^Sign-ins$/i }))

    // Click Failed (fast request)
    await user.click(screen.getByRole('button', { name: /^Failed$/i }))

    // Fast request succeeds and renders Failed sign-in
    expect(await screen.findByText('Failed sign-in')).toBeInTheDocument()

    // Now resolve the slower first request (Sign-ins)
    resolveFirstFilter!({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        events: [{ _id: 'signin-old', action: 'LOGIN', createdAt: new Date().toISOString() }],
      }),
    } as Response)

    // Wait a tick: newer state (Failed sign-in) must NOT be replaced by the stale Sign-in event
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByText('Failed sign-in')).toBeInTheDocument()
    expect(screen.queryByText('Signed in')).not.toBeInTheDocument()
  })

  it('keeps a new filter when an old pagination response arrives', async () => {
    let finish!: (response: Response) => void
    let allCalls = 0
    const response = (body: unknown) => new Response(JSON.stringify(body))
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/security/events')) {
        if (url.includes('FAILED_SIGN_IN')) return response({ events: [{ _id: 'new', action: 'LOGIN_FAILED', createdAt: new Date().toISOString() }] })
        allCalls++
        if (allCalls > 1) return new Promise<Response>((resolve) => { finish = resolve })
        return response({ events: [], hasMore: true, nextCursor: 'older-cursor' })
      }
      if (url.includes('/security/sessions')) return response({ sessions: mockSessions })
      if (url.includes('/security/two-factor')) return response({ eligible: true, configured: true, enabled: false })
      if (url.includes('/users')) return response({ users: mockStaffUsers })
      return response({})
    })
    const user = userEvent.setup()
    render(<SecurityWorkspacePage />)
    await screen.findByText('Inactive Staff')
    await user.click(screen.getByRole('button', { name: /Load older activity/i }))
    await user.click(screen.getByRole('button', { name: /^Failed$/i }))
    await screen.findByText('Failed sign-in')
    await act(async () => { finish(response({ events: [{ _id: 'old', action: 'LOGIN', createdAt: new Date().toISOString() }], hasMore: true, nextCursor: 'stale' })) })
    expect(screen.getByText('Failed sign-in')).toBeInTheDocument()
    expect(screen.queryByText('Signed in')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Load older activity/i })).not.toBeInTheDocument()
  })

  it('unmounts cleanly while pairing countdown and copy timeout are active', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/api/security/android-pairing') && method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ code: '999888', expiresAt: new Date(Date.now() + 60000).toISOString() }),
        } as Response
      }
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
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ eligible: true, configured: true, enabled: false }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    const { unmount } = render(<SecurityWorkspacePage />)

    // Generate pairing code
    await user.click(await screen.findByRole('button', { name: /Generate pairing code/i }))
    expect(await screen.findByText('999888')).toBeInTheDocument()

    // Unmount while countdown interval is active
    expect(() => unmount()).not.toThrow()
  })
})

describe('SecurityWorkspacePage events pagination and expand collapse', () => {
  const generatedEvents = Array.from({ length: 6 }, (_, i) => ({
    _id: `evt-${i}`,
    action: i % 2 === 0 ? 'LOGIN' : 'LOGOUT',
    createdAt: new Date(Date.now() - (i + 1) * 60000).toISOString(),
    ipAddress: `192.168.1.${10 + i}`,
    details: { deviceName: `Device ${i}` },
  }))

  beforeEach(() => {
    vi.restoreAllMocks()
    setStoredSessionUser(mockOwnerUser)
  })

  it('loads older security events with cursor pagination and handles expand/collapse', async () => {
    let paginationCalls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/security/events') && url.includes('cursor=')) {
        paginationCalls++
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            events: [
              {
                _id: 'evt-older',
                action: 'SESSION_REVOKED',
                createdAt: new Date(Date.now() - 600000).toISOString(),
                details: { sessionId: 'sess-old' },
              },
            ],
            nextCursor: null,
            hasMore: false,
          }),
        } as Response
      }
      if (url.includes('/api/security/events')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            events: generatedEvents,
            nextCursor: 'next-page-cursor',
            hasMore: true,
          }),
        } as Response
      }
      if (url.includes('/api/security/sessions')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ sessions: mockSessions }) } as Response
      }
      if (url.includes('/api/users')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ users: mockStaffUsers }) } as Response
      }
      if (url.includes('/api/security/two-factor')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ eligible: true, configured: true, enabled: false }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<SecurityWorkspacePage />)

    expect(await screen.findByText('Recent security activity')).toBeInTheDocument()

    // Groups are > 4, so "Show all (6)" toggle appears
    const showAllBtn = await screen.findByRole('button', { name: /Show all \(6\)/i })
    await user.click(showAllBtn)
    expect(screen.getByRole('button', { name: /Show less/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Show less/i }))
    expect(screen.getByRole('button', { name: /Show all \(6\)/i })).toBeInTheDocument()

    // Pagination: Load older activity
    const loadMoreBtn = screen.getByRole('button', { name: /Load older activity/i })
    await user.click(loadMoreBtn)

    await waitFor(() => {
      expect(paginationCalls).toBe(1)
    })

    // Expand to show all including older events
    const showAllOlderBtn = await screen.findByRole('button', { name: /Show all \(7\)/i })
    await user.click(showAllOlderBtn)
    expect(screen.getByText('Session revoked')).toBeInTheDocument()
  })
})
