import { act, render, screen, waitFor, fireEvent } from '@testing-library/react'
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

    // Utility actions render in the utility region
    const docsBtn = screen.getByRole('button', { name: /Documents/i })
    const printBtn = screen.getByRole('button', { name: /Print label/i })
    expect(docsBtn.closest('.detail-modal-utility-group')).toBeInTheDocument()
    expect(printBtn.closest('.detail-modal-utility-group')).toBeInTheDocument()

    // Transaction actions render in the transaction region
    const dueBtn = screen.getByRole('button', { name: /Due payment/i })
    const extendBtn = screen.getByRole('button', { name: /Extend pawn/i })
    const redeemBtn = screen.getByRole('button', { name: /Redeem item/i })
    expect(dueBtn.closest('.detail-modal-transaction-group')).toBeInTheDocument()
    expect(extendBtn.closest('.detail-modal-transaction-group')).toBeInTheDocument()
    expect(redeemBtn.closest('.detail-modal-transaction-group')).toBeInTheDocument()
    expect(redeemBtn).toHaveClass('primary-button')

    // Destructive action renders in a separate danger region
    const deleteBtn = screen.getByRole('button', { name: /Delete contract/i })
    expect(deleteBtn.closest('.detail-modal-danger-group')).toBeInTheDocument()
    expect(deleteBtn.closest('.detail-modal-utility-group')).toBeNull()

    // Redundant footer close button is NOT rendered
    expect(screen.queryByRole('button', { name: /^Close$/i })).not.toBeInTheDocument()
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

  it('prevents duplicate submissions by disabling the Delete button while request is running', async () => {
    let resolveDeletePromise!: () => void
    const deletePromise = new Promise<void>((resolve) => {
      resolveDeletePromise = resolve
    })
    const handleDelete = vi.fn().mockImplementation(() => deletePromise)
    const handleClose = vi.fn()
    const user = userEvent.setup()

    render(
      <PawnDetailModal
        pawn={mockPawnRecord}
        onClose={handleClose}
        canDelete={true}
        onDelete={handleDelete}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Delete contract/i }))
    const deletePermanentBtn = screen.getByRole('button', { name: /Delete permanently/i })

    // Click once to initiate deletion
    await user.click(deletePermanentBtn)
    expect(handleDelete).toHaveBeenCalledTimes(1)

    // Button should now be disabled with busy state
    expect(deletePermanentBtn).toBeDisabled()
    expect(deletePermanentBtn).toHaveTextContent(/Deleting\.\.\./i)

    // Attempting another click while busy should NOT trigger handleDelete again
    await user.click(deletePermanentBtn)
    expect(handleDelete).toHaveBeenCalledTimes(1)

    // Complete the request
    resolveDeletePromise()
    await waitFor(() => {
      expect(handleClose).toHaveBeenCalledTimes(1)
    })
  })

  it('keeps modal open and shows error alert when deletion fails', async () => {
    const handleDelete = vi.fn().mockRejectedValue(new Error('Pawn record is locked in active audit'))
    const handleClose = vi.fn()
    const user = userEvent.setup()

    render(
      <PawnDetailModal
        pawn={mockPawnRecord}
        onClose={handleClose}
        canDelete={true}
        onDelete={handleDelete}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Delete contract/i }))
    const deletePermanentBtn = screen.getByRole('button', { name: /Delete permanently/i })
    await user.click(deletePermanentBtn)

    await waitFor(() => {
      expect(handleDelete).toHaveBeenCalledTimes(1)
    })

    // Modal should NOT be closed
    expect(handleClose).not.toHaveBeenCalled()

    // Confirmation dialog should still be present with error alert
    const errorAlert = screen.getByRole('alert')
    expect(errorAlert).toBeInTheDocument()
    expect(errorAlert).toHaveTextContent(/Pawn record is locked in active audit/i)

    // Button should be re-enabled for user to retry or cancel
    expect(deletePermanentBtn).toBeEnabled()
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

  it('disables Due payment when no fee is due and disables Extend pawn when fee must be paid first', () => {
    // 1. When due payment is 0
    const zeroFeePawn: Pawn = {
      ...mockPawnRecord,
      accruedInterest: 0,
      fees: 0,
    }

    const { rerender } = render(
      <PawnDetailModal
        pawn={zeroFeePawn}
        onClose={vi.fn()}
        onAction={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /Due payment/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Extend pawn/i })).toBeEnabled()

    // 2. When DAILY_SIMPLE fee model has fee due, Extend pawn requires fee to be paid first
    const dailyFeeDuePawn: Pawn = {
      ...mockPawnRecord,
      feeModel: 'DAILY_SIMPLE',
      feeSummary: {
        feeModel: 'DAILY_SIMPLE',
        termDays: 30,
        accruedDays: 10,
        accruedFee: 20,
        dailyFeeAmount: 2,
        dailyFeeRate: 0.33,
        contractLengthDays: 30,
        feeAtDueDate: 60,
        totalAtDueDate: 660,
        redemptionTotal: 620,
        remainingPrincipal: 600,
      },
    }

    rerender(
      <PawnDetailModal
        pawn={dailyFeeDuePawn}
        onClose={vi.fn()}
        onAction={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /Due payment/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Extend pawn/i })).toBeDisabled()
  })

  it('generates an idempotency key on renewal preparation, reuses it on retry, and generates a new key after cancel', async () => {
    let callCount = 0
    const capturedPayloads: Array<Record<string, unknown>> = []
    const handleAction = vi.fn().mockImplementation(async (action, payload) => {
      callCount++
      capturedPayloads.push({ ...payload })
      if (callCount === 1) {
        throw new Error('Network timeout: please retry')
      }
      return undefined
    })

    const user = userEvent.setup()
    const dailyZeroFeePawn: Pawn = {
      ...mockPawnRecord,
      feeModel: 'DAILY_SIMPLE',
      termDays: 7,
      accruedInterest: 0,
      fees: 0,
      feeSummary: {
        feeModel: 'DAILY_SIMPLE',
        termDays: 7,
        accruedDays: 0,
        accruedFee: 0,
        dailyFeeAmount: 1,
        dailyFeeRate: 0.2,
        contractLengthDays: 7,
        feeAtDueDate: 7,
        totalAtDueDate: 107,
        redemptionTotal: 100,
        remainingPrincipal: 100,
      },
    }

    render(
      <PawnDetailModal
        pawn={dailyZeroFeePawn}
        onClose={vi.fn()}
        onAction={handleAction}
      />,
    )

    // 1. Open renewal form
    await user.click(screen.getByRole('button', { name: /Extend pawn/i }))
    expect(screen.getByRole('button', { name: /Confirm extension/i })).toBeInTheDocument()

    // 2. Submit initial renewal (fails on first attempt)
    await user.click(screen.getByRole('button', { name: /Confirm extension/i }))
    await waitFor(() => {
      expect(handleAction).toHaveBeenCalledTimes(1)
      expect(screen.getByText(/Network timeout: please retry/i)).toBeInTheDocument()
    })

    const initialKey = capturedPayloads[0].idempotencyKey
    expect(typeof initialKey).toBe('string')
    expect((initialKey as string).length).toBeGreaterThan(5)

    // 3. Retry the same submission: MUST reuse the exact same idempotency key
    await user.click(screen.getByRole('button', { name: /Confirm extension/i }))
    await waitFor(() => {
      expect(handleAction).toHaveBeenCalledTimes(2)
    })

    const retryKey = capturedPayloads[1].idempotencyKey
    expect(retryKey).toBe(initialKey)

    // After success, modal form closes
    expect(screen.queryByRole('button', { name: /Confirm extension/i })).not.toBeInTheDocument()

    // 4. Open extension a second time for a genuinely new renewal -> must get a new key
    await user.click(screen.getByRole('button', { name: /Extend pawn/i }))
    await user.click(screen.getByRole('button', { name: /Confirm extension/i }))
    await waitFor(() => {
      expect(handleAction).toHaveBeenCalledTimes(3)
    })

    const secondRenewalKey = capturedPayloads[2].idempotencyKey
    expect(secondRenewalKey).not.toBe(initialKey)
  })

  it('guards onAction against rapid double clicks before React rerenders', async () => {
    let actionCount = 0
    let resolveAction: () => void
    const actionPromise = new Promise<void>((resolve) => {
      resolveAction = resolve
    })
    const handleAction = vi.fn().mockImplementation(() => {
      actionCount++
      return actionPromise
    })

    const user = userEvent.setup()
    render(
      <PawnDetailModal
        pawn={mockPawnRecord}
        onClose={vi.fn()}
        onAction={handleAction}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Redeem item/i }))
    const confirmButton = screen.getByRole('button', { name: /Confirm redemption/i })

    // Rapid double click in one act()
    act(() => {
      fireEvent.click(confirmButton)
      fireEvent.click(confirmButton)
    })

    // Before fix, actionCount is 2. Must be 1.
    expect(actionCount).toBe(1)
    await act(async () => { resolveAction!() })
  })

  it('preserves entered inputs on action failure and allows retry after releasing guard', async () => {
    let attempt = 0
    const handleAction = vi.fn().mockImplementation(() => {
      attempt++
      if (attempt === 1) {
        return Promise.reject(new Error('Network error: please try again'))
      }
      return Promise.resolve()
    })

    const user = userEvent.setup()
    render(
      <PawnDetailModal
        pawn={mockPawnRecord}
        onClose={vi.fn()}
        onAction={handleAction}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Redeem item/i }))
    const noteInput = screen.getByPlaceholderText(/Add a reference or payment note/i)
    await user.type(noteInput, 'Paid in cash with note')

    const confirmButton = screen.getByRole('button', { name: /Confirm redemption/i })
    await user.click(confirmButton)

    await waitFor(() => {
      expect(screen.getByText('Network error: please try again')).toBeInTheDocument()
    })

    // Input preserved
    expect(screen.getByDisplayValue('Paid in cash with note')).toBeInTheDocument()

    // Retry succeeds because guard was released
    await user.click(confirmButton)
    await waitFor(() => {
      expect(handleAction).toHaveBeenCalledTimes(2)
    })
  })

  it('guards onDelete against rapid double clicks before React rerenders', async () => {
    let deleteCount = 0
    let resolveDelete: () => void
    const deletePromise = new Promise<void>((resolve) => {
      resolveDelete = resolve
    })
    const handleDelete = vi.fn().mockImplementation(() => {
      deleteCount++
      return deletePromise
    })

    const user = userEvent.setup()
    render(
      <PawnDetailModal
        pawn={mockPawnRecord}
        onClose={vi.fn()}
        canDelete={true}
        onDelete={handleDelete}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Delete contract/i }))
    const confirmDeleteBtn = screen.getByRole('button', { name: /Delete permanently/i })

    act(() => {
      fireEvent.click(confirmDeleteBtn)
      fireEvent.click(confirmDeleteBtn)
    })

    expect(deleteCount).toBe(1)
    await act(async () => { resolveDelete!() })
  })
})
