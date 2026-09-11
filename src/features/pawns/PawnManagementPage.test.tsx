import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PawnManagementPage from './PawnManagementPage'
import { mockOwnerUser, mockPawnRecord } from '../../test/testUtils'
import { PAWN_CREATED_EVENT, type PawnCreatedEventDetail } from './pawnEvents'

function mockPawnFetch(options?: { deleteError?: string; pawns?: typeof mockPawnRecord[] }) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = (init?.method || 'GET').toUpperCase()

    if (url.includes('/exchange-rates')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ usdKhr: 4100 }),
      } as Response
    }

    if (url.includes('/pawns') && method === 'GET') {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ pawns: options?.pawns || [mockPawnRecord] }),
      } as Response
    }

    if (url.includes('/pawns') && method === 'DELETE') {
      if (options?.deleteError) {
        return {
          ok: false,
          status: 400,
          headers: new Headers({ 'Content-Type': 'application/json', 'X-Request-ID': 'req-err' }),
          json: async () => ({ message: options.deleteError, requestId: 'req-err' }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ deleted: true, pawnNo: mockPawnRecord.pawnNo }),
      } as Response
    }

    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({}),
    } as Response
  })
}

describe('PawnManagementPage feature integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders loading state initially while fetching pawns', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))

    render(<PawnManagementPage user={mockOwnerUser} />)

    expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Loading pawn contracts/i).length).toBeGreaterThan(0)
  })

  it('renders pawn contracts when API returns pawns', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ pawns: [mockPawnRecord] }),
    } as Response)

    render(<PawnManagementPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getAllByText(mockPawnRecord.pawnNo).length).toBeGreaterThan(0)
      expect(screen.getAllByText(mockPawnRecord.customer!.name).length).toBeGreaterThan(0)
      expect(screen.getAllByText(mockPawnRecord.itemSnapshot.name).length).toBeGreaterThan(0)
      expect(screen.getAllByText('Active').length).toBeGreaterThan(0)
    })
  })

  it('shows a newly created pawn immediately without refreshing the page', async () => {
    const fetchSpy = mockPawnFetch({ pawns: [] })
    render(<PawnManagementPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getAllByText(/No pawn contracts match these filters/i).length).toBeGreaterThan(0)
    })

    act(() => {
      window.dispatchEvent(new CustomEvent<PawnCreatedEventDetail>(PAWN_CREATED_EVENT, {
        detail: { pawn: mockPawnRecord },
      }))
    })

    expect(screen.getAllByText(mockPawnRecord.pawnNo).length).toBeGreaterThan(0)
    expect(screen.getAllByText(mockPawnRecord.customer!.name).length).toBeGreaterThan(0)

    const pawnGetRequests = fetchSpy.mock.calls.filter(([input, init]) => (
      String(input).includes('/pawns') && (init?.method || 'GET').toUpperCase() === 'GET'
    ))
    expect(pawnGetRequests).toHaveLength(1)
  })

  it('filters visible contracts by search query', async () => {
    const pawn1 = { ...mockPawnRecord, _id: 'p-1', pawnNo: 'PW-ALPHA', customer: { _id: 'c-1', name: 'Alpha Customer' } }
    const pawn2 = { ...mockPawnRecord, _id: 'p-2', pawnNo: 'PW-BETA', customer: { _id: 'c-2', name: 'Beta Customer' } }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ pawns: [pawn1, pawn2] }),
    } as Response)

    const user = userEvent.setup()
    render(<PawnManagementPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getByText('PW-ALPHA')).toBeInTheDocument()
      expect(screen.getByText('PW-BETA')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/Search contract, customer/i)
    await user.type(searchInput, 'BETA')

    expect(screen.queryByText('PW-ALPHA')).not.toBeInTheDocument()
    expect(screen.getByText('PW-BETA')).toBeInTheDocument()
  })

  it('opens pawn detail modal when contract action is clicked', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ pawns: [mockPawnRecord] }),
    } as Response)

    const user = userEvent.setup()
    render(<PawnManagementPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getAllByText(mockPawnRecord.pawnNo).length).toBeGreaterThan(0)
    })

    const openButtons = screen.getAllByRole('button', { name: new RegExp(`View.*${mockPawnRecord.pawnNo}`, 'i') })
    await user.click(openButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 3, name: mockPawnRecord.pawnNo })).toBeInTheDocument()
    })
  })

  it('displays error state when API request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ 'X-Request-ID': 'req-pawn-err' }),
      json: async () => ({ message: 'Pawn service offline', requestId: 'req-pawn-err' }),
    } as Response)

    render(<PawnManagementPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getByText(/Pawn service offline/i)).toBeInTheDocument()
    })
  })

  it('successfully deletes a pawn contract, closes modal, refreshes list, and displays success toast', async () => {
    const fetchSpy = mockPawnFetch()

    const user = userEvent.setup()
    render(<PawnManagementPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getAllByText(mockPawnRecord.pawnNo).length).toBeGreaterThan(0)
    })

    // Open detail modal
    const openButtons = screen.getAllByRole('button', { name: new RegExp(`View.*${mockPawnRecord.pawnNo}`, 'i') })
    await user.click(openButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Click delete contract to show confirmation
    await user.click(screen.getByRole('button', { name: /Delete contract/i }))
    expect(screen.getByText(/Delete this pawn\?/i)).toBeInTheDocument()

    // Confirm deletion
    const deletePermanentBtn = screen.getByRole('button', { name: /Delete permanently/i })
    await user.click(deletePermanentBtn)

    // Verify DELETE request was made
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining(`/pawns/${mockPawnRecord._id}`),
        expect.objectContaining({ method: 'DELETE' }),
      )
    })

    // 1. Detail modal should be closed
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // 2. Pawn should be removed from the list
    expect(screen.queryByText(mockPawnRecord.pawnNo)).not.toBeInTheDocument()

    // 3. Success toast should appear on the page
    const toast = screen.getByRole('status')
    expect(toast).toBeInTheDocument()
    expect(toast).toHaveTextContent('Pawn contract deleted successfully.')

    // 4. Manually dismiss the toast
    const dismissBtn = screen.getByRole('button', { name: /Dismiss message/i })
    await user.click(dismissBtn)
    expect(screen.queryByText('Pawn contract deleted successfully.')).not.toBeInTheDocument()
  })

  it('automatically dismisses success toast after timeout', async () => {
    let timerCallback: (() => void) | null = null
    let timerDelay: number | null = null
    const originalSetTimeout = window.setTimeout
    vi.spyOn(window, 'setTimeout').mockImplementation(((callback: () => void, delay?: number) => {
      if (typeof callback === 'function' && delay === 4000) {
        timerCallback = callback
        timerDelay = delay
        return 9999 as unknown as number
      }
      return originalSetTimeout(callback, delay)
    }) as typeof window.setTimeout)

    mockPawnFetch()
    const user = userEvent.setup()
    render(<PawnManagementPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getAllByText(mockPawnRecord.pawnNo).length).toBeGreaterThan(0)
    })

    const openButtons = screen.getAllByRole('button', { name: new RegExp(`View.*${mockPawnRecord.pawnNo}`, 'i') })
    await user.click(openButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Delete contract/i }))
    await user.click(screen.getByRole('button', { name: /Delete permanently/i }))

    await waitFor(() => {
      expect(screen.getByText('Pawn contract deleted successfully.')).toBeInTheDocument()
    })

    // Verify 4000ms timer was scheduled and execute its dismiss callback
    expect(timerDelay).toBe(4000)
    expect(timerCallback).toBeTypeOf('function')

    act(() => {
      timerCallback?.()
    })

    expect(screen.queryByText('Pawn contract deleted successfully.')).not.toBeInTheDocument()
  })

  it('keeps detail modal open, preserves list item, and shows error notification on failed deletion', async () => {
    mockPawnFetch({ deleteError: 'Collateral item is locked in judicial custody' })

    const user = userEvent.setup()
    render(<PawnManagementPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getAllByText(mockPawnRecord.pawnNo).length).toBeGreaterThan(0)
    })

    // Open detail modal
    const openButtons = screen.getAllByRole('button', { name: new RegExp(`View.*${mockPawnRecord.pawnNo}`, 'i') })
    await user.click(openButtons[0])

    // Trigger delete flow
    await user.click(screen.getByRole('button', { name: /Delete contract/i }))
    await user.click(screen.getByRole('button', { name: /Delete permanently/i }))

    // Error alert should be displayed in the modal
    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/Collateral item is locked in judicial custody/i)
    })

    // Modal remains open
    expect(screen.getAllByRole('dialog').length).toBeGreaterThan(0)

    // No success toast is displayed
    expect(screen.queryByText('Pawn contract deleted successfully.')).not.toBeInTheDocument()

    // Close confirmation and modal
    await user.click(screen.getByRole('button', { name: /Keep contract/i }))
    await user.click(screen.getByRole('button', { name: new RegExp(`Close.*${mockPawnRecord.pawnNo}`, 'i') }))

    // Contract is still present in the list
    expect(screen.getAllByText(mockPawnRecord.pawnNo).length).toBeGreaterThan(0)
  })

  it('does not delete contract or show toast when user cancels confirmation', async () => {
    const fetchSpy = mockPawnFetch()

    const user = userEvent.setup()
    render(<PawnManagementPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getAllByText(mockPawnRecord.pawnNo).length).toBeGreaterThan(0)
    })

    const openButtons = screen.getAllByRole('button', { name: new RegExp(`View.*${mockPawnRecord.pawnNo}`, 'i') })
    await user.click(openButtons[0])

    // Open delete confirmation
    await user.click(screen.getByRole('button', { name: /Delete contract/i }))
    expect(screen.getByText(/Delete this pawn\?/i)).toBeInTheDocument()

    // Cancel deletion
    await user.click(screen.getByRole('button', { name: /Keep contract/i }))
    expect(screen.queryByText(/Delete this pawn\?/i)).not.toBeInTheDocument()

    // Detail modal remains open
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // No DELETE request was sent
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'DELETE' }),
    )

    // No success toast is shown
    expect(screen.queryByText('Pawn contract deleted successfully.')).not.toBeInTheDocument()
  })
})
