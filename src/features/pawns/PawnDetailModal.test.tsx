import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PawnDetailModal from './PawnDetailModal'
import { mockPawnRecord } from '../../test/testUtils'
import type { Pawn } from '../../types/domain'

describe('PawnDetailModal component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders contract header, customer details, item info, and balance summary', () => {
    const handleClose = vi.fn()

    render(
      <PawnDetailModal
        pawn={mockPawnRecord}
        onClose={handleClose}
      />,
    )

    // Heading and identity
    expect(screen.getByRole('heading', { level: 3, name: mockPawnRecord.pawnNo })).toBeInTheDocument()
    expect(screen.getByText(/Pawn contract/i)).toBeInTheDocument()
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0)

    // Customer & Item info
    expect(screen.getByText(mockPawnRecord.customer!.name)).toBeInTheDocument()
    expect(screen.getByText(mockPawnRecord.customer!.phone)).toBeInTheDocument()
    expect(screen.getByText(mockPawnRecord.itemSnapshot.name)).toBeInTheDocument()
    expect(screen.getByText(mockPawnRecord.itemSnapshot.imei!)).toBeInTheDocument()

    // Financial balance
    expect(screen.getByText(/Amount to redeem today/i)).toBeInTheDocument()
  })

  it('renders long customer name, item name, and reference without errors', () => {
    const longPawn: Pawn = {
      ...mockPawnRecord,
      pawnNo: 'PW-2026-LONG-REF-1234567890-VERY-LONG-IDENTIFIER',
      customer: {
        _id: 'cust-long',
        name: 'Alexander Bartholomew Montgomery-Smith The Third Longname',
        phone: '+855 (0) 12 345 678 ext 9999',
        nationalIdNumber: 'ID-999888777666555444',
      },
      itemSnapshot: {
        name: 'Samsung Galaxy S24 Ultra Enterprise Titanium Grey Edition Special Package',
        brand: 'Samsung Electronics International',
        model: 'Galaxy S24 Ultra Extra Storage',
        imei: '35432109876543210987',
        condition: 'FAIR',
      },
      notes: 'Customer requested special safe storage and extended terms documentation with signature',
    }

    render(
      <PawnDetailModal
        pawn={longPawn}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { level: 3, name: longPawn.pawnNo })).toBeInTheDocument()
    expect(screen.getByText(longPawn.customer!.name)).toBeInTheDocument()
    expect(screen.getByText(longPawn.itemSnapshot.name)).toBeInTheDocument()
  })

  it('renders organized footer action groups (utility, transaction, destructive, dismiss)', () => {
    const handleAction = vi.fn()
    const handleDelete = vi.fn()

    render(
      <PawnDetailModal
        pawn={mockPawnRecord}
        onClose={vi.fn()}
        onAction={handleAction}
        canDelete={true}
        onDelete={handleDelete}
      />,
    )

    // Utility actions
    expect(screen.getByRole('button', { name: /Documents/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Print label/i })).toBeInTheDocument()

    // Transaction actions
    expect(screen.getByRole('button', { name: /Due payment/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Extend pawn/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Redeem item/i })).toBeInTheDocument()

    // Destructive action for owner
    expect(screen.getByRole('button', { name: /Delete contract/i })).toBeInTheDocument()

    // Neutral dismiss action
    expect(screen.getByRole('button', { name: /^Close$/i })).toBeInTheDocument()
  })

  it('supports dashboard reuse with onOpenAll action', async () => {
    const handleClose = vi.fn()
    const handleOpenAll = vi.fn()
    const user = userEvent.setup()

    render(
      <PawnDetailModal
        pawn={mockPawnRecord}
        onClose={handleClose}
        onOpenAll={handleOpenAll}
      />,
    )

    const navBtn = screen.getByRole('button', { name: /Open pawn management/i })
    expect(navBtn).toBeInTheDocument()

    await user.click(navBtn)
    expect(handleOpenAll).toHaveBeenCalledTimes(1)
  })

  it('triggers onOpenDocuments callback when provided, or dispatches phoneflow:open-documents event', async () => {
    const handleOpenDocs = vi.fn()
    const user = userEvent.setup()

    const { rerender } = render(
      <PawnDetailModal
        pawn={mockPawnRecord}
        onClose={vi.fn()}
        onOpenDocuments={handleOpenDocs}
      />,
    )

    const docsBtn = screen.getByRole('button', { name: /Documents/i })
    await user.click(docsBtn)
    expect(handleOpenDocs).toHaveBeenCalledTimes(1)

    // Fallback event when onOpenDocuments is not provided
    const eventHandler = vi.fn()
    window.addEventListener('phoneflow:open-documents', eventHandler)

    rerender(
      <PawnDetailModal
        pawn={mockPawnRecord}
        onClose={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Documents/i }))
    expect(eventHandler).toHaveBeenCalled()
    const customEvent = eventHandler.mock.calls[0][0] as CustomEvent
    expect(customEvent.detail).toEqual({
      sourceType: 'PAWN',
      reference: mockPawnRecord.pawnNo,
    })

    window.removeEventListener('phoneflow:open-documents', eventHandler)
  })

  it('opens and closes payment, extend, and redeem forms', async () => {
    const user = userEvent.setup()
    const handleAction = vi.fn()

    const activePawnWithFee: Pawn = { ...mockPawnRecord, accruedInterest: 21 }

    render(
      <PawnDetailModal
        pawn={activePawnWithFee}
        onClose={vi.fn()}
        onAction={handleAction}
      />,
    )

    // Open Due Payment form
    await user.click(screen.getByRole('button', { name: /Due payment/i }))
    expect(screen.getByRole('button', { name: /Save due payment/i })).toBeInTheDocument()

    // Cancel form
    await user.click(screen.getByRole('button', { name: /^Cancel$/i }))
    expect(screen.queryByRole('button', { name: /Save due payment/i })).not.toBeInTheDocument()

    // Open Extend Pawn form
    await user.click(screen.getByRole('button', { name: /Extend pawn/i }))
    expect(screen.getByRole('button', { name: /Confirm extension/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Cancel$/i }))
    expect(screen.queryByRole('button', { name: /Confirm extension/i })).not.toBeInTheDocument()

    // Open Redeem Item form
    await user.click(screen.getByRole('button', { name: /Redeem item/i }))
    expect(screen.getByRole('button', { name: /Confirm redemption/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Cancel$/i }))
    expect(screen.queryByRole('button', { name: /Confirm redemption/i })).not.toBeInTheDocument()
  })

  it('hides delete action when canDelete is false or onDelete is missing', () => {
    const { rerender } = render(
      <PawnDetailModal
        pawn={mockPawnRecord}
        onClose={vi.fn()}
        canDelete={false}
      />,
    )

    expect(screen.queryByRole('button', { name: /Delete contract/i })).not.toBeInTheDocument()

    rerender(
      <PawnDetailModal
        pawn={mockPawnRecord}
        onClose={vi.fn()}
        canDelete={true}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /Delete contract/i })).toBeInTheDocument()
  })

  it('handles delete flow: confirmation prompt, cancel, and permanent delete execution', async () => {
    const handleClose = vi.fn()
    const handleDelete = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(
      <PawnDetailModal
        pawn={mockPawnRecord}
        onClose={handleClose}
        canDelete={true}
        onDelete={handleDelete}
      />,
    )

    // Click delete contract
    await user.click(screen.getByRole('button', { name: /Delete contract/i }))

    // Confirmation dialog should be visible
    expect(screen.getByText(/Delete this pawn\?/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Keep contract/i })).toBeInTheDocument()

    // Test cancelling
    await user.click(screen.getByRole('button', { name: /Keep contract/i }))
    expect(screen.queryByText(/Delete this pawn\?/i)).not.toBeInTheDocument()

    // Reopen and confirm delete
    await user.click(screen.getByRole('button', { name: /Delete contract/i }))
    const deletePermanentBtn = screen.getByRole('button', { name: /Delete permanently/i })
    await user.click(deletePermanentBtn)

    await waitFor(() => {
      expect(handleDelete).toHaveBeenCalledTimes(1)
      expect(handleClose).toHaveBeenCalledTimes(1)
    })
  })

  it('closes modal when close button is clicked or Escape key is pressed', async () => {
    const handleClose = vi.fn()
    const user = userEvent.setup()

    render(
      <PawnDetailModal
        pawn={mockPawnRecord}
        onClose={handleClose}
      />,
    )

    // Click close icon in header
    const closeHeaderBtn = screen.getByRole('button', { name: `Close ${mockPawnRecord.pawnNo}` })
    await user.click(closeHeaderBtn)
    expect(handleClose).toHaveBeenCalledTimes(1)

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(handleClose).toHaveBeenCalledTimes(2)
  })

  it('shows claim banner when pawn is overdue and allows claim flow when eligible', async () => {
    const overduePawn: Pawn = {
      ...mockPawnRecord,
      status: 'OVERDUE',
      dueDate: '2026-08-10',
    }

    render(
      <PawnDetailModal
        pawn={overduePawn}
        onClose={vi.fn()}
        onAction={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /Claim collateral/i })).toBeInTheDocument()
  })
})
