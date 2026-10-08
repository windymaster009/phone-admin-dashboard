import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ExpensePage from './ExpensePage'

const expense = {
  _id: 'expense-1', expenseNo: 'EX-20261009-ONE', title: 'Electricity bill', category: 'UTILITIES',
  amount: 41, currency: 'USD', exchangeRate: 1, paymentMethod: 'CASH', expenseDate: '2026-10-09T00:00:00.000Z',
  payee: 'Electric company', status: 'RECORDED', createdBy: { _id: 'user-1', name: 'Yuto', role: 'OWNER' },
  createdAt: '2026-10-09T01:00:00.000Z', updatedAt: '2026-10-09T01:00:00.000Z',
} as const

describe('ExpensePage', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('reuses the ledger, summary, mobile-card, and audited detail patterns', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200, headers: new Headers(), json: async () => ({
        expenses: [expense], summary: { totalUsd: 41, totals: { USD: 41, KHR: 0 }, recorded: 1, voided: 0 }, exchangeRate: 4100,
      }),
    } as Response)
    const user = userEvent.setup()
    render(<ExpensePage />)

    await screen.findAllByText('Electricity bill')
    expect(screen.getByLabelText('Expense summary')).toHaveTextContent('$41')
    expect(screen.getAllByText('Electricity bill').length).toBeGreaterThan(0)
    expect(document.querySelector('.expense-mobile-list')).not.toBeNull()
    for (const label of ['Expense category', 'Payment method', 'Expense currency', 'Expense status']) {
      expect(screen.getByLabelText(label)).toHaveClass('ghost-button', 'filter-select')
    }

    const desktopRow = screen.getByText('EX-20261009-ONE').closest('tr')
    await user.click(desktopRow as HTMLElement)
    const dialog = await screen.findByRole('dialog', { name: 'EX-20261009-ONE' })
    expect(dialog.querySelector('.operation-form.expense-detail-shell')).not.toBeNull()
    expect(dialog.querySelector('.operation-modal-actions.expense-modal-actions')).not.toBeNull()
    expect(within(dialog).getByText('Electric company')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Void expense' })).toBeDisabled()
  })

  it('opens the record form with today-safe fields and an explicit create action', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200, headers: new Headers(), json: async () => ({ expenses: [], summary: { totalUsd: 0, totals: { USD: 0, KHR: 0 }, recorded: 0, voided: 0 }, exchangeRate: 4100 }),
    } as Response)
    const user = userEvent.setup()
    render(<ExpensePage />)
    await waitFor(() => expect(screen.queryByText('Loading expenses')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Record expense' }))

    const dialog = await screen.findByRole('dialog', { name: 'Record expense' })
    expect(dialog.querySelector('form.operation-form.expense-form')).not.toBeNull()
    expect(dialog.querySelector('.operation-form-grid.expense-form-grid')).not.toBeNull()
    expect(dialog.querySelector('.operation-modal-actions.expense-modal-actions')).not.toBeNull()
    expect(within(dialog).getByLabelText('Description')).toBeRequired()
    expect(within(dialog).getByLabelText('Expense date')).toHaveAttribute('max')
    expect(within(dialog).getByRole('button', { name: 'Record expense' })).toBeInTheDocument()
  })
})
