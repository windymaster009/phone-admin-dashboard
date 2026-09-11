import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

