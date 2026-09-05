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
      expect(screen.getByText('SL-2026-0001')).toBeInTheDocument()
      expect(screen.getByText('1 ready')).toBeInTheDocument()
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
      expect(screen.getByText('SL-SAFEGUARD')).toBeInTheDocument()
    })

    const submitBtn = screen.getByRole('button', { name: /Complete refund/i })
    // Initially disabled because reason, disposition, and confirmation are empty
    expect(submitBtn).toBeDisabled()

    // 1. Enter too short reason (< 5 characters)
    const reasonInput = screen.getByPlaceholderText(/Explain why the item is being returned/i)
    await user.type(reasonInput, 'Bad')
    expect(submitBtn).toBeDisabled()

    // Enter valid reason (>= 5 characters)
    await user.type(reasonInput, ' device screen flickering')
    expect(submitBtn).toBeDisabled()

    // 2. Select inventory disposition
    const restockRadio = screen.getByLabelText(/Return to sellable stock/i)
    await user.click(restockRadio)
    expect(submitBtn).toBeDisabled()

    // 3. Enter incorrect confirmation code
    const confirmInput = screen.getByPlaceholderText('Type SL-SAFEGUARD to confirm')
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
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [refundedTrade] }),
    } as Response)

    render(<RefundsPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getByText('SL-RETURNED-ALREADY')).toBeInTheDocument()
    })

    // Should indicate the sale is already refunded
    expect(screen.getByText(/This sale has already been refunded/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Complete refund/i })).not.toBeInTheDocument()
  })
})
