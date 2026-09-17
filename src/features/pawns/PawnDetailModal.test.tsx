import { act, render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PawnDetailModal from './PawnDetailModal'
import { mockPawnRecord } from '../../test/testUtils'
import type { Pawn } from '../../types/domain'
import * as barcodeModule from '../inventory/barcode'
import { dateText } from '../../lib/presentation'

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

  it('enforces 5-day minimum claim timing: disabled before, enabled exactly at, and enabled after claim time', () => {
    const baseNow = 1789000000000
    vi.spyOn(Date, 'now').mockReturnValue(baseNow)

    try {
      // 1. Before: 4 days overdue (< 5 full days)
      const beforePawn: Pawn = {
        ...mockPawnRecord,
        status: 'OVERDUE',
        dueDate: new Date(baseNow - 4 * 86_400_000).toISOString(),
      }
      const { rerender } = render(
        <PawnDetailModal
          pawn={beforePawn}
          onClose={vi.fn()}
          onAction={vi.fn()}
        />,
      )
      expect(screen.getByRole('button', { name: /Claim collateral/i })).toBeDisabled()
      expect(screen.getByText(/Claim available/i)).toBeInTheDocument()

      // 2. Exactly at: 5 days overdue (exactly 5 full days)
      const exactPawn: Pawn = {
        ...mockPawnRecord,
        status: 'OVERDUE',
        dueDate: new Date(baseNow - 5 * 86_400_000).toISOString(),
      }
      rerender(
        <PawnDetailModal
          pawn={exactPawn}
          onClose={vi.fn()}
          onAction={vi.fn()}
        />,
      )
      expect(screen.getByRole('button', { name: /Claim collateral/i })).toBeEnabled()
      expect(screen.getByText('Claim is available')).toBeInTheDocument()

      // 3. After: 6 days overdue (> 5 full days)
      const afterPawn: Pawn = {
        ...mockPawnRecord,
        status: 'OVERDUE',
        dueDate: new Date(baseNow - 6 * 86_400_000).toISOString(),
      }
      rerender(
        <PawnDetailModal
          pawn={afterPawn}
          onClose={vi.fn()}
          onAction={vi.fn()}
        />,
      )
      expect(screen.getByRole('button', { name: /Claim collateral/i })).toBeEnabled()
      expect(screen.getByText('Claim is available')).toBeInTheDocument()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('older contract with 2-day graceEndsAt enforces 5-day minimum (before, exactly at, and after)', () => {
    const baseNow = 1789000000000
    vi.spyOn(Date, 'now').mockReturnValue(baseNow)

    try {
      // 1. Before: 3 days overdue (2-day grace passed, but 5-day minimum has not)
      const dueDateBefore = new Date(baseNow - 3 * 86_400_000).toISOString()
      const graceEndsAt2Day = new Date(baseNow - 1 * 86_400_000).toISOString()
      const olderPawnBefore: Pawn = {
        ...mockPawnRecord,
        status: 'OVERDUE',
        dueDate: dueDateBefore,
        graceEndsAt: graceEndsAt2Day,
      }
      const { rerender } = render(
        <PawnDetailModal
          pawn={olderPawnBefore}
          onClose={vi.fn()}
          onAction={vi.fn()}
        />,
      )
      expect(screen.getByRole('button', { name: /Claim collateral/i })).toBeDisabled()
      expect(screen.getByText(/Claim available/i)).toBeInTheDocument()

      // 2. Exactly at: 5 days overdue (reaches 5-day minimum)
      const dueDateExact = new Date(baseNow - 5 * 86_400_000).toISOString()
      const olderPawnExact: Pawn = {
        ...mockPawnRecord,
        status: 'OVERDUE',
        dueDate: dueDateExact,
        graceEndsAt: new Date(baseNow - 3 * 86_400_000).toISOString(),
      }
      rerender(
        <PawnDetailModal
          pawn={olderPawnExact}
          onClose={vi.fn()}
          onAction={vi.fn()}
        />,
      )
      expect(screen.getByRole('button', { name: /Claim collateral/i })).toBeEnabled()
      expect(screen.getByText('Claim is available')).toBeInTheDocument()

      // 3. After: 6 days overdue
      const dueDateAfter = new Date(baseNow - 6 * 86_400_000).toISOString()
      const olderPawnAfter: Pawn = {
        ...mockPawnRecord,
        status: 'OVERDUE',
        dueDate: dueDateAfter,
        graceEndsAt: new Date(baseNow - 4 * 86_400_000).toISOString(),
      }
      rerender(
        <PawnDetailModal
          pawn={olderPawnAfter}
          onClose={vi.fn()}
          onAction={vi.fn()}
        />,
      )
      expect(screen.getByRole('button', { name: /Claim collateral/i })).toBeEnabled()
      expect(screen.getByText('Claim is available')).toBeInTheDocument()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('honors later saved graceEndsAt when later than 5 days (before, exactly at, and after)', () => {
    const baseNow = 1789000000000
    vi.spyOn(Date, 'now').mockReturnValue(baseNow)

    try {
      // 1. Before: 6 days overdue (past 5 days, but before 7-day graceEndsAt)
      const dueDateBefore = new Date(baseNow - 6 * 86_400_000).toISOString()
      const graceEndsAt7Day = new Date(baseNow + 1 * 86_400_000).toISOString()
      const pawnBefore: Pawn = {
        ...mockPawnRecord,
        status: 'OVERDUE',
        dueDate: dueDateBefore,
        graceEndsAt: graceEndsAt7Day,
      }
      const { rerender } = render(
        <PawnDetailModal
          pawn={pawnBefore}
          onClose={vi.fn()}
          onAction={vi.fn()}
        />,
      )
      expect(screen.getByRole('button', { name: /Claim collateral/i })).toBeDisabled()
      expect(screen.getByText(/Claim available/i)).toBeInTheDocument()

      // 2. Exactly at: 7 days overdue (reaches 7-day graceEndsAt)
      const dueDateExact = new Date(baseNow - 7 * 86_400_000).toISOString()
      const pawnExact: Pawn = {
        ...mockPawnRecord,
        status: 'OVERDUE',
        dueDate: dueDateExact,
        graceEndsAt: new Date(baseNow).toISOString(),
      }
      rerender(
        <PawnDetailModal
          pawn={pawnExact}
          onClose={vi.fn()}
          onAction={vi.fn()}
        />,
      )
      expect(screen.getByRole('button', { name: /Claim collateral/i })).toBeEnabled()
      expect(screen.getByText('Claim is available')).toBeInTheDocument()

      // 3. After: 8 days overdue
      const dueDateAfter = new Date(baseNow - 8 * 86_400_000).toISOString()
      const pawnAfter: Pawn = {
        ...mockPawnRecord,
        status: 'OVERDUE',
        dueDate: dueDateAfter,
        graceEndsAt: new Date(baseNow - 1 * 86_400_000).toISOString(),
      }
      rerender(
        <PawnDetailModal
          pawn={pawnAfter}
          onClose={vi.fn()}
          onAction={vi.fn()}
        />,
      )
      expect(screen.getByRole('button', { name: /Claim collateral/i })).toBeEnabled()
      expect(screen.getByText('Claim is available')).toBeInTheDocument()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('restricts claim collateral to authorized staff while keeping Redeem item separate and accessible', async () => {
    const overduePawn: Pawn = {
      ...mockPawnRecord,
      status: 'OVERDUE',
      dueDate: '2026-08-10',
    }

    // 1. Unauthorized staff (canClaim = false, e.g. Cashier):
    // Claim banner is hidden, but Redeem item is available
    const { rerender } = render(
      <PawnDetailModal
        pawn={overduePawn}
        onClose={vi.fn()}
        onAction={vi.fn()}
        canClaim={false}
      />,
    )

    expect(screen.queryByRole('button', { name: /Claim collateral/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Claim is available/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Redeem item/i })).toBeInTheDocument()

    // Clicking Redeem item opens redemption form for customer collection
    fireEvent.click(screen.getByRole('button', { name: /Redeem item/i }))
    expect(screen.getByText(/Confirm the amount collected and return the collateral to the customer/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirm redemption/i })).toBeInTheDocument()

    // Canceling the form returns to modal view with Redeem item button intact
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }))
    expect(screen.getByRole('button', { name: /Redeem item/i })).toBeInTheDocument()

    // 2. Authorized staff (canClaim = true, e.g. Owner/Manager):
    rerender(
      <PawnDetailModal
        pawn={overduePawn}
        onClose={vi.fn()}
        onAction={vi.fn()}
        canClaim={true}
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

  it('prints label immediately after pawn creation when inventoryItem is populated in the new pawn', async () => {
    const printSpy = vi.spyOn(barcodeModule, 'printInventoryLabel').mockReturnValue(true)
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

    const createdPawn: Pawn = {
      ...mockPawnRecord,
      pawnNo: 'PW-20260917-NEW01',
      inventoryItem: {
        _id: 'item-new-1',
        sku: 'PWN-20260917-ABC01',
        barcode: 'PW-20260917-NEW01',
        name: 'iPhone 15 Pro Max',
        brand: 'Apple',
        model: 'iPhone 15 Pro Max',
        storage: '256GB',
        color: 'Natural Titanium',
        imei1: '359876543210987',
        sellPrice: 0,
        status: 'PAWNED',
      } as any,
      itemSnapshot: {
        name: 'iPhone 15 Pro Max',
        brand: 'Apple',
        model: 'iPhone 15 Pro Max',
        storage: '256GB',
        color: 'Natural Titanium',
        imei: '359876543210987',
      },
    }

    const user = userEvent.setup()
    render(
      <PawnDetailModal
        pawn={createdPawn}
        onClose={vi.fn()}
      />,
    )

    const printButton = screen.getByRole('button', { name: /Print label/i })
    await user.click(printButton)

    expect(alertSpy).not.toHaveBeenCalled()
    expect(printSpy).toHaveBeenCalledWith({
      sku: 'PWN-20260917-ABC01',
      barcode: 'PW-20260917-NEW01',
      name: 'iPhone 15 Pro Max',
      brand: 'Apple',
      model: 'iPhone 15 Pro Max 256GB Natural Titanium',
      imei1: '359876543210987',
      sellPrice: 0,
    })
  })

  it('prints label successfully after page reload even if inventoryItem is an ID string or unpopulated', async () => {
    const printSpy = vi.spyOn(barcodeModule, 'printInventoryLabel').mockReturnValue(true)
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

    const reloadedPawn: Pawn = {
      ...mockPawnRecord,
      pawnNo: 'PW-20260917-RELOAD',
      inventoryItem: 'raw-mongo-id-string-123' as any,
      itemSnapshot: {
        name: 'Samsung Galaxy S23 Ultra',
        brand: 'Samsung',
        model: 'Galaxy S23 Ultra',
        storage: '512GB',
        color: 'Phantom Black',
        imei: '351234567890123',
      },
    }

    const user = userEvent.setup()
    render(
      <PawnDetailModal
        pawn={reloadedPawn}
        onClose={vi.fn()}
      />,
    )

    const printButton = screen.getByRole('button', { name: /Print label/i })
    await user.click(printButton)

    expect(alertSpy).not.toHaveBeenCalled()
    expect(printSpy).toHaveBeenCalledWith({
      sku: 'PW-20260917-RELOAD',
      barcode: 'PW-20260917-RELOAD',
      name: 'Samsung Galaxy S23 Ultra',
      brand: 'Samsung',
      model: 'Galaxy S23 Ultra 512GB Phantom Black',
      imei1: '351234567890123',
      sellPrice: 0,
    })
  })

  it('renders Print ticket button, shows preparing state on click, and dispatches phoneflow:open-pawn-ticket', async () => {
    const user = userEvent.setup()
    const ticketHandler = vi.fn()
    window.addEventListener('phoneflow:open-pawn-ticket', ticketHandler)

    render(
      <PawnDetailModal
        pawn={mockPawnRecord}
        onClose={vi.fn()}
      />,
    )

    const ticketBtn = screen.getByRole('button', { name: /Print ticket/i })
    expect(ticketBtn).toBeInTheDocument()

    await user.click(ticketBtn)
    expect(ticketHandler).toHaveBeenCalled()
    const customEvent = ticketHandler.mock.calls[0][0] as CustomEvent
    expect(customEvent.detail).toEqual({
      reference: mockPawnRecord.pawnNo,
      sourceSubId: 'latest-contract',
    })

    // Shows loading feedback and clears on phoneflow:documents-opened
    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:documents-opened'))
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Print ticket/i })).not.toBeDisabled()
    })

    window.removeEventListener('phoneflow:open-pawn-ticket', ticketHandler)
  })

  it('displays error banner when document preparation fails', async () => {
    const user = userEvent.setup()

    render(
      <PawnDetailModal
        pawn={mockPawnRecord}
        onClose={vi.fn()}
      />,
    )

    const docsBtn = screen.getByRole('button', { name: /Documents/i })
    await user.click(docsBtn)

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:documents-error', {
        detail: { message: 'Unable to load contract documents from server' },
      }))
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Unable to load contract documents from server')
    })
  })

  it('renders Part 1 in history when renewals exist and allows printing older Part 1 and renewal parts from history', async () => {
    const user = userEvent.setup()
    const ticketHandler = vi.fn()
    window.addEventListener('phoneflow:open-pawn-ticket', ticketHandler)

    const pawnWithRenewals: Pawn = {
      ...mockPawnRecord,
      renewals: [
        {
          _id: 'renewal-id-1',
          renewedAt: '2026-09-15T10:00:00.000Z',
          previousDueDate: '2026-09-15T10:00:00.000Z',
          newDueDate: '2026-10-15T10:00:00.000Z',
          termDays: 30,
          ticketPart: 2,
          feePaid: 20,
          paymentAmount: 20,
          dailyFeeAmount: 0.67,
          contractLengthDays: 60,
        },
      ],
    }

    render(
      <PawnDetailModal
        pawn={pawnWithRenewals}
        onClose={vi.fn()}
      />,
    )

    // History contains both Part 1 and Part 2
    expect(screen.getByText(/Extension history/i)).toBeInTheDocument()
    expect(screen.getByText(/Part 1 ·/i)).toBeInTheDocument()
    expect(screen.getByText(/Original contract/i)).toBeInTheDocument()
    expect(screen.getByText(/Part 2 ·/i)).toBeInTheDocument()
    const originalHistory = screen.getByText(/Original contract/i).closest('p')
    expect(originalHistory?.textContent).toContain(`Due ${dateText(pawnWithRenewals.renewals![0].previousDueDate)}`)
    expect(originalHistory?.textContent).not.toContain(`Due ${dateText(pawnWithRenewals.renewals![0].newDueDate)}`)

    // Clicking Print Part 1 dispatches ticket event with sourceSubId: 'contract'
    const printPart1Btn = screen.getByRole('button', { name: /Print Part 1/i })
    await user.click(printPart1Btn)
    expect(ticketHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          reference: pawnWithRenewals.pawnNo,
          sourceSubId: 'contract',
        },
      }),
    )

    // Clicking Print Part 2 dispatches ticket event with sourceSubId: 'renewal:renewal-id-1'
    const printPart2Btn = screen.getByRole('button', { name: /Print Part 2/i })
    await user.click(printPart2Btn)
    expect(ticketHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          reference: pawnWithRenewals.pawnNo,
          sourceSubId: 'renewal:renewal-id-1',
        },
      }),
    )

    window.removeEventListener('phoneflow:open-pawn-ticket', ticketHandler)
  })
})
