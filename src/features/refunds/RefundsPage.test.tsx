import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RefundsPage from './RefundsPage'
import { mockCashierUser, mockOwnerUser, mockTradeRecord } from '../../test/testUtils'
import type { Trade } from '../../types/domain'

describe('RefundsPage feature integration & safeguards', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('blocks unauthorized users and displays manager access requirement message', () => {
    render(<RefundsPage user={mockCashierUser} />)

    expect(screen.getByRole('heading', { level: 3, name: 'Manager access required' })).toBeInTheDocument()
    expect(screen.getByText(/Only owners and managers can review or record refunds/i)).toBeInTheDocument()
  })

  it('allows OWNER and loads eligible trades queue', async () => {
    const saleTrade: Trade = {
      ...mockTradeRecord,
      _id: 'tr-sale-1',
      tradeNo: 'SL-2026-0001',
      status: 'COMPLETED',
      warrantyDays: 30,
      createdAt: new Date().toISOString(),
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [saleTrade] }),
    } as Response)

    render(<RefundsPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getAllByText('SL-2026-0001').length).toBeGreaterThan(0)
      expect(screen.getByText(/ready/i)).toBeInTheDocument()
    })
  })

  it('enforces multi-step safeguard before enabling refund submission button', async () => {
    const saleTrade: Trade = {
      ...mockTradeRecord,
      _id: 'tr-sale-2',
      tradeNo: 'SL-SAFEGUARD',
      status: 'COMPLETED',
      warrantyDays: 14,
      createdAt: new Date().toISOString(),
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [saleTrade] }),
    } as Response)

    const user = userEvent.setup()
    render(<RefundsPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getAllByText('SL-SAFEGUARD').length).toBeGreaterThan(0)
    })

    const submitBtn = screen.getByRole('button', { name: /Record full refund/i })
    // Initially disabled because reason, disposition, and confirmation are empty
    expect(submitBtn).toBeDisabled()

    // 1. Enter too short reason (< 5 characters)
    const reasonInput = screen.getByPlaceholderText(/Example: Item is faulty/i)
    await user.type(reasonInput, 'Bad')
    expect(submitBtn).toBeDisabled()

    // Enter valid reason (>= 5 characters)
    await user.type(reasonInput, ' device screen flickering')
    expect(submitBtn).toBeDisabled()

    // 2. Select inventory disposition
    const selectDisposition = screen.getByRole('combobox')
    await user.selectOptions(selectDisposition, 'RESTOCK')
    expect(submitBtn).toBeDisabled()

    // 3. Enter incorrect confirmation code
    const confirmInput = screen.getByPlaceholderText('Type SL-SAFEGUARD')
    await user.type(confirmInput, 'WRONG-CODE')
    expect(submitBtn).toBeDisabled()

    // 4. Enter exact matching trade number
    await user.clear(confirmInput)
    await user.type(confirmInput, 'SL-SAFEGUARD')

    // Now all safeguards are satisfied -> submit button must be enabled
    expect(submitBtn).toBeEnabled()
  })

  it('prevents double refund on already returned sales', async () => {
    const refundedTrade: Trade = {
      ...mockTradeRecord,
      _id: 'tr-returned-1',
      tradeNo: 'SL-RETURNED-ALREADY',
      status: 'RETURNED',
      createdAt: new Date().toISOString(),
      refund: {
        amount: 1150,
        refundedAt: new Date().toISOString(),
        reason: 'Customer returned item',
        inventoryDisposition: 'RESTOCK',
        refundedBy: { _id: 'u-1', name: 'Manager' },
      },
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [refundedTrade] }),
    } as Response)

    render(<RefundsPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getAllByText('SL-RETURNED-ALREADY').length).toBeGreaterThan(0)
    })

    // Should indicate the sale is already refunded
    expect(screen.getByText(/Refund already recorded/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Complete refund/i })).not.toBeInTheDocument()
  })
})
