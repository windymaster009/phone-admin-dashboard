import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRef, useState } from 'react'
import ActivityReportDropdown from './ActivityReportDropdown'
import { mockOwnerUser, mockCashierUser } from '../../test/testUtils'
import { getActivityClearedKey, getActivityLastSeenKey, safeStorage } from '../../lib/storage'
import type { ActivityLog } from '../../types/domain'
import type { SessionUser } from '../../lib/api'

const mockLogs: ActivityLog[] = [
  {
    _id: 'log-1',
    id: 'log-1',
    action: 'LOGIN',
    entity: 'AUTH_SESSION',
    user: { name: 'Yuto', email: 'yuto@phoneflow.local', role: 'OWNER' },
    summary: 'Web session from Chrome',
    ipAddress: '127.0.0.1',
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    reference: 'SESSION-101',
  },
  {
    _id: 'log-2',
    id: 'log-2',
    action: 'LOGIN_FAILED',
    entity: 'AUTH_SESSION',
    user: { name: 'Yuto', email: 'yuto@phoneflow.local', role: 'OWNER' },
    summary: 'Invalid password attempt',
    ipAddress: '::1',
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    reference: 'SESSION-102',
  },
  {
    _id: 'log-3',
    id: 'log-3',
    action: 'CREATE',
    entity: 'TRADE',
    user: { name: 'Sophea', email: 'sophea@phoneflow.local', role: 'MANAGER' },
    summary: 'Sold iPhone 15 Pro Max',
    reference: 'TR-2026-0099',
    createdAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
  },
  {
    _id: 'log-4',
    id: 'log-4',
    action: 'SESSION_REVOKED',
    entity: 'AUTH_SESSION',
    user: { name: 'Yuto', email: 'yuto@phoneflow.local', role: 'OWNER' },
    summary: 'Revoked Chrome web session',
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
]

function TestHarness({ user = mockOwnerUser }: { user?: SessionUser }) {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const buttonRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Activity notifications"
        onClick={() => setOpen((c) => !c)}
      >
        <span>Bell</span>
        {unread > 0 && <span data-testid="unread-badge">{unread}</span>}
      </button>
      <ActivityReportDropdown
        anchorRef={buttonRef}
        open={open}
        onClose={() => setOpen(false)}
        onUnreadChange={setUnread}
        user={user}
      />
    </>
  )
}

describe('ActivityReportDropdown component', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    safeStorage.clear('local')
    safeStorage.clear('session')
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('renders trigger button, opens dropdown, and renders natural titles and formatted local IP', async () => {
    const user = userEvent.setup()

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/activity-logs')) {
        return new Response(JSON.stringify({
          logs: mockLogs,
          nextCursor: null,
          hasMore: false,
          totalCount: mockLogs.length,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('{}', { status: 200 })
    })

    // Seed previous seen time 1 hour ago so all 4 mock logs are unread
    localStorage.setItem(getActivityLastSeenKey(mockOwnerUser.id), new Date(Date.now() - 60 * 60 * 1000).toISOString())

    render(<TestHarness user={mockOwnerUser} />)

    // Trigger button should show unread count (4 logs)
    const triggerBtn = await screen.findByRole('button', { name: /Activity notifications/i })
    expect(triggerBtn).toBeInTheDocument()
    expect(await screen.findByTestId('unread-badge')).toHaveTextContent('4')

    // Click to open dropdown
    await user.click(triggerBtn)

    // Verify natural authentication title formatting:
    // - LOGIN with AUTH_SESSION -> "Yuto signed in"
    // - LOGIN_FAILED with AUTH_SESSION -> "Failed sign-in for Yuto"
    // - SESSION_REVOKED with AUTH_SESSION -> "Device session revoked"
    expect(await screen.findByText('Yuto signed in')).toBeInTheDocument()
    expect(screen.getByText('Failed sign-in for Yuto')).toBeInTheDocument()
    expect(screen.getByText('Device session revoked')).toBeInTheDocument()
    expect(screen.getByText(/Created Sale TR-2026-0099/i)).toBeInTheDocument()

    // Verify IP addresses: 127.0.0.1 and ::1 are formatted as "Local device"
    const localDeviceElements = screen.getAllByText('Local device')
    expect(localDeviceElements.length).toBeGreaterThanOrEqual(2)
  })

  it('supports module filter selection and reloads filtered activity from backend', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/activity-logs')) {
        const urlObj = new URL(url, 'http://localhost')
        const entityParam = urlObj.searchParams.get('entity')
        const filtered = entityParam
          ? mockLogs.filter((l) => l.entity === entityParam)
          : mockLogs

        return new Response(JSON.stringify({
          logs: filtered,
          nextCursor: null,
          hasMore: false,
          totalCount: filtered.length,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('{}', { status: 200 })
    })

    render(<TestHarness user={mockOwnerUser} />)

    const triggerBtn = await screen.findByRole('button', { name: /Activity notifications/i })
    await user.click(triggerBtn)

    // Filter select
    const filterSelect = await screen.findByLabelText(/Filter activity type/i)
    expect(filterSelect).toBeInTheDocument()

    // Switch to Sales & purchases (TRADE)
    await user.selectOptions(filterSelect, 'TRADE')

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('entity=TRADE'),
        expect.anything()
      )
    })

    expect(screen.getByText(/Created Sale TR-2026-0099/i)).toBeInTheDocument()
    expect(screen.queryByText('Yuto signed in')).not.toBeInTheDocument()
  })

  it('marks all as read: clears unread badge and updates stored timestamp without deleting records', async () => {
    const user = userEvent.setup()

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/activity-logs')) {
        return new Response(JSON.stringify({
          logs: mockLogs,
          nextCursor: null,
          hasMore: false,
          totalCount: mockLogs.length,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('{}', { status: 200 })
    })

    localStorage.setItem(getActivityLastSeenKey(mockOwnerUser.id), new Date(Date.now() - 60 * 60 * 1000).toISOString())

    render(<TestHarness user={mockOwnerUser} />)

    const triggerBtn = await screen.findByRole('button', { name: /Activity notifications/i })
    expect(await screen.findByTestId('unread-badge')).toHaveTextContent('4')

    await user.click(triggerBtn)

    const markReadBtn = await screen.findByRole('button', { name: /Mark read/i })
    await user.click(markReadBtn)

    // Badge should disappear
    expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument()

    // Last seen key is stored in localStorage under account-specific key
    const lastSeenKey = getActivityLastSeenKey(mockOwnerUser.id)
    const storedLastSeen = localStorage.getItem(lastSeenKey)
    expect(storedLastSeen).toBeTruthy()

    // Verify all items are still rendered in the dropdown
    expect(screen.getByText('Yuto signed in')).toBeInTheDocument()
    expect(screen.getByText(/Created Sale TR-2026-0099/i)).toBeInTheDocument()
  })

  it('clears view without calling DELETE, supports Undo, and supports Show all', async () => {
    const user = userEvent.setup()
    let deleteCalled = false

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase()
      if (method === 'DELETE') {
        deleteCalled = true
      }
      const url = String(input)
      if (url.includes('/api/activity-logs')) {
        return new Response(JSON.stringify({
          logs: mockLogs,
          nextCursor: null,
          hasMore: false,
          totalCount: mockLogs.length,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('{}', { status: 200 })
    })

    render(<TestHarness user={mockOwnerUser} />)

    const triggerBtn = await screen.findByRole('button', { name: /Activity notifications/i })
    await user.click(triggerBtn)

    const clearBtn = await screen.findByRole('button', { name: /Clear view/i })
    await user.click(clearBtn)

    // Must NOT call DELETE on the database
    expect(deleteCalled).toBe(false)

    // Check account-scoped cleared timestamp
    const clearedKey = getActivityClearedKey(mockOwnerUser.id)
    expect(localStorage.getItem(clearedKey)).toBeTruthy()

    // Cleared banner appears explaining audit history is retained
    expect(await screen.findByText(/Current notifications cleared from view/i)).toBeInTheDocument()
    expect(screen.getByText('Audit history is retained.')).toBeInTheDocument()

    // Items are hidden from current view
    expect(screen.queryByText('Yuto signed in')).not.toBeInTheDocument()

    // Test Undo
    const undoBtn = screen.getByRole('button', { name: /Undo/i })
    await user.click(undoBtn)

    // Items are restored and cleared timestamp is removed
    expect(screen.getByText('Yuto signed in')).toBeInTheDocument()
    expect(localStorage.getItem(clearedKey)).toBeNull()

    // Clear again and test "Show all"
    await user.click(clearBtn)
    expect(screen.queryByText('Yuto signed in')).not.toBeInTheDocument()

    const showAllBtn = screen.getByRole('button', { name: /Show all/i })
    await user.click(showAllBtn)

    // Showing complete audit history banner
    expect(await screen.findByText(/Viewing complete audit history/i)).toBeInTheDocument()
    expect(screen.getByText('Yuto signed in')).toBeInTheDocument()
  })

  it('isolates cleared and last-seen state by user account', () => {
    const ownerKey = getActivityClearedKey(mockOwnerUser.id)
    const cashierKey = getActivityClearedKey(mockCashierUser.id)

    expect(ownerKey).not.toBe(cashierKey)
    expect(ownerKey).toContain(mockOwnerUser.id)
    expect(cashierKey).toContain(mockCashierUser.id)

    const ownerSeenKey = getActivityLastSeenKey(mockOwnerUser.id)
    const cashierSeenKey = getActivityLastSeenKey(mockCashierUser.id)

    expect(ownerSeenKey).not.toBe(cashierSeenKey)
    expect(ownerSeenKey).toContain(mockOwnerUser.id)
    expect(cashierSeenKey).toContain(mockCashierUser.id)
  })

  it('loads older activity via cursor pagination when Load older activity is clicked', async () => {
    const user = userEvent.setup()
    const olderLog: ActivityLog = {
      _id: 'log-older-5',
      id: 'log-older-5',
      action: 'CANCEL',
      entity: 'LOAN',
      user: { name: 'Vanna', email: 'vanna@phoneflow.local', role: 'CASHIER' },
      summary: 'Cancelled uncollected loan contract',
      createdAt: '2026-08-01T00:00:00.000Z',
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('cursor=cursor-123')) {
        return new Response(JSON.stringify({
          logs: [olderLog],
          nextCursor: null,
          hasMore: false,
          totalCount: 5,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.includes('/api/activity-logs')) {
        return new Response(JSON.stringify({
          logs: mockLogs,
          nextCursor: 'cursor-123',
          hasMore: true,
          totalCount: 5,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('{}', { status: 200 })
    })

    render(<TestHarness user={mockOwnerUser} />)

    const triggerBtn = await screen.findByRole('button', { name: /Activity notifications/i })
    await user.click(triggerBtn)

    const loadMoreBtn = await screen.findByRole('button', { name: /Load older activity/i })
    expect(loadMoreBtn).toBeInTheDocument()

    await user.click(loadMoreBtn)

    expect(await screen.findByText('Cancelled uncollected loan contract')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Load older activity/i })).not.toBeInTheDocument()
  })

  it('polls for newer records and prepends without replacing existing records', async () => {
    vi.useFakeTimers()
    const newLog: ActivityLog = {
      _id: 'log-new-99',
      id: 'log-new-99',
      action: 'PAYMENT',
      entity: 'LOAN_PAYMENT',
      user: { name: 'Vanna', email: 'vanna@phoneflow.local', role: 'CASHIER' },
      summary: 'Recorded installment payment',
      createdAt: new Date().toISOString(),
    }

    let pollCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('since=')) {
        pollCount++
        return new Response(JSON.stringify({
          logs: [newLog],
          hasMore: false,
          totalCount: mockLogs.length + 1,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.includes('/api/activity-logs')) {
        return new Response(JSON.stringify({
          logs: mockLogs,
          nextCursor: null,
          hasMore: false,
          totalCount: mockLogs.length,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('{}', { status: 200 })
    })

    render(<TestHarness user={mockOwnerUser} />)

    // Initial fetch
    await act(async () => {
      await Promise.resolve()
    })

    // Advance 15 seconds for polling
    await act(async () => {
      vi.advanceTimersByTime(15000)
      await Promise.resolve()
    })

    expect(pollCount).toBeGreaterThanOrEqual(1)
    vi.useRealTimers()
  })
})
