import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PawnManagementPage from './PawnManagementPage'
import { mockOwnerUser, mockPawnRecord } from '../../test/testUtils'

describe('PawnManagementPage feature integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders loading state initially while fetching pawns', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))

    render(<PawnManagementPage user={mockOwnerUser} />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/Loading pawn contracts/i)).toBeInTheDocument()
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
      expect(screen.getByText(mockPawnRecord.pawnNo)).toBeInTheDocument()
      expect(screen.getByText(mockPawnRecord.customer!.name)).toBeInTheDocument()
      expect(screen.getByText(mockPawnRecord.itemSnapshot.name)).toBeInTheDocument()
      expect(screen.getByText('Active')).toBeInTheDocument()
    })
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
      expect(screen.getByText(mockPawnRecord.pawnNo)).toBeInTheDocument()
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
})
