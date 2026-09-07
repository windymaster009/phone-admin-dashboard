import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoanPage, { type LoanSummary } from './LoanPage'
import { mockOwnerUser } from '../../test/testUtils'

const mockSummary: LoanSummary = {
  byCurrency: {
    USD: {
      lent: 15000,
      expected: 16500,
      paid: 5000,
      outstanding: 11500,
      dueSoon: 3500,
      overdue: 2000,
    },
    KHR: {
      lent: 60000000,
      expected: 66000000,
      paid: 20000000,
      outstanding: 46000000,
      dueSoon: 14000000,
      overdue: 8000000,
    },
  },
  counts: {
    total: 12,
    open: 8,
    dueSoon: 3,
    overdue: 2,
    paid: 4,
  },
}

const mockLoanRecord = {
  _id: 'loan-1',
  loanNo: 'LN-2026-001',
  borrower: {
    name: 'Sokha Chan',
    phone: '012 345 678',
    nationalIdNumber: '0102030405',
    address: 'Phnom Penh, Cambodia',
  },
  principal: 1000,
  interestType: 'PERCENT' as const,
  interestValue: 10,
  interestAmount: 100,
  totalDue: 1100,
  amountPaid: 300,
  remainingBalance: 800,
  currency: 'USD' as const,
  loanDate: '2026-08-01T00:00:00.000Z',
  dueDate: '2026-09-01T00:00:00.000Z',
  reminderDays: 3,
  status: 'ACTIVE' as const,
  reason: 'Shop expansion inventory',
  notes: 'Customer promises to pay via KHQR',
  createdAt: '2026-08-01T00:00:00.000Z',
}

describe('LoanPage component and shared component adoption', () => {
  beforeEach(() => {
    vi.restoreAllMocks()

    // Default mock responses for auth and loan list
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/auth/me')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ user: mockOwnerUser }),
        } as Response
      }

      if (url.includes('/loans') && (!init || init.method === 'GET' || !init.method)) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            loans: [mockLoanRecord],
            summary: mockSummary,
          }),
        } as Response
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
      } as Response
    })
  })

  it('renders shared SummaryStats with page-level metrics', async () => {
    render(<LoanPage summary={mockSummary} />)

    // SummaryStats label
    const summaryRegion = screen.getByLabelText('Loan summary')
    expect(summaryRegion).toBeInTheDocument()

    // Metric items rendered by shared SummaryStats
    expect(within(summaryRegion).getByText('Total lent')).toBeInTheDocument()
    expect(within(summaryRegion).getByText('Outstanding')).toBeInTheDocument()
    expect(within(summaryRegion).getByText('Due soon')).toBeInTheDocument()
    expect(within(summaryRegion).getByText('Overdue')).toBeInTheDocument()

    // Currency values
    expect(within(summaryRegion).getByText('$15,000.00')).toBeInTheDocument()
    expect(within(summaryRegion).getByText('$11,500.00')).toBeInTheDocument()
  })

  it('uses ScannerTriggerButton for scan loan and opens OperationModalShell scanner dialog', async () => {
    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    // ScannerTriggerButton is in the toolbar
    const scanTrigger = screen.getByRole('button', { name: /Scan loan/i })
    expect(scanTrigger).toBeInTheDocument()
    expect(scanTrigger.classList.contains('secondary-button')).toBe(true)

    // Click to open scan loan modal
    await user.click(scanTrigger)

    // OperationModalShell renders with dialog role and title
    const dialog = screen.getByRole('dialog', { name: /Scan loan/i })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('Loan lookup')).toBeInTheDocument()
    expect(screen.getByText(/Scan the loan barcode/i)).toBeInTheDocument()

    // Close dialog
    const closeButton = screen.getByRole('button', { name: /Close/i })
    await user.click(closeButton)

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Scan loan/i })).not.toBeInTheDocument()
    })
  })

  it('supports multi-step loan creation with OperationWorkflowStepper, validation, and submission', async () => {
    let capturedBody: Record<string, unknown> | null = null

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ user: mockOwnerUser }),
        } as Response
      }

      if (url.includes('/loans') && init?.method === 'POST') {
        capturedBody = JSON.parse(String(init.body))
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({
            loan: {
              ...mockLoanRecord,
              _id: 'loan-new-1',
              loanNo: 'LN-2026-999',
              principal: 500,
              currency: 'USD',
              borrower: { name: 'Vannak Heng' },
            },
          }),
        } as Response
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ loans: [mockLoanRecord], summary: mockSummary }),
      } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    // Wait for auth to resolve
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /New loan/i })).toBeInTheDocument()
    })

    // Click "New loan"
    await user.click(screen.getByRole('button', { name: /New loan/i }))

    // Dialog opens with OperationModalShell
    const createDialog = screen.getByRole('dialog', { name: /Create loan/i })
    expect(createDialog).toBeInTheDocument()

    // OperationWorkflowStepper is rendered inside the dialog
    const stepper = within(createDialog).getByRole('group', { name: /Loan creation steps/i })
    expect(stepper).toBeInTheDocument()
    expect(within(stepper).getByText('Borrower')).toBeInTheDocument()
    expect(within(stepper).getByText('Terms & schedule')).toBeInTheDocument()

    // Step 1: Borrower validation - clicking Continue without borrower name fails
    const continueButton = within(createDialog).getByRole('button', { name: /Continue/i })
    expect(continueButton).toBeDisabled() // disabled when empty

    // Enter borrower name
    const nameInput = within(createDialog).getByPlaceholderText('Full name')
    await user.type(nameInput, 'Vannak Heng')

    // Optional fields
    const phoneInput = within(createDialog).getByPlaceholderText('012 345 678')
    await user.type(phoneInput, '098 765 432')

    const idInput = within(createDialog).getByPlaceholderText('ID number')
    await user.type(idInput, '99887766')

    const addressInput = within(createDialog).getByPlaceholderText(/Village, district/i)
    await user.type(addressInput, 'Siem Reap, Cambodia')

    // Continue button is now enabled
    expect(continueButton).not.toBeDisabled()
    await user.click(continueButton)

    // Now on Step 2: Terms & schedule
    expect(within(createDialog).getByText('Loan amount')).toBeInTheDocument()
    expect(within(createDialog).getByRole('tablist', { name: 'Currency' })).toBeInTheDocument()
    expect(within(createDialog).getByRole('tablist', { name: 'Interest calculation' })).toBeInTheDocument()

    // Enter loan amount via MoneyInput
    const amountInput = within(createDialog).getByLabelText(/Loan amount/i)
    await user.type(amountInput, '500')

    // KeyValueSummary preview shows calculated amounts (both Principal and Total expected are $500.00)
    expect(within(createDialog).getAllByText('$500.00').length).toBe(2)

    // Test Back button preserves Step 1 inputs
    const backButton = within(createDialog).getByRole('button', { name: /Back/i })
    await user.click(backButton)

    // Verify Step 1 fields retained their values
    expect(within(createDialog).getByDisplayValue('Vannak Heng')).toBeInTheDocument()
    expect(within(createDialog).getByDisplayValue('098 765 432')).toBeInTheDocument()
    expect(within(createDialog).getByDisplayValue('99887766')).toBeInTheDocument()
    expect(within(createDialog).getByDisplayValue('Siem Reap, Cambodia')).toBeInTheDocument()

    // Continue back to Step 2
    await user.click(within(createDialog).getByRole('button', { name: /Continue/i }))

    // Create loan
    const createButton = within(createDialog).getByRole('button', { name: /Create loan/i })
    expect(createButton).not.toBeDisabled()
    await user.click(createButton)

    // Verify API payload matches exactly
    await waitFor(() => {
      expect(capturedBody).not.toBeNull()
      expect(capturedBody).toEqual(
        expect.objectContaining({
          borrower: {
            name: 'Vannak Heng',
            phone: '098 765 432',
            nationalIdNumber: '99887766',
            address: 'Siem Reap, Cambodia',
          },
          principal: 500,
          currency: 'USD',
          interestType: 'NONE',
        }),
      )
    })

    // Confirmation state is rendered using OperationModalShell and KeyValueSummary
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Loan saved/i })).toBeInTheDocument()
      expect(screen.getByText('Loan record created')).toBeInTheDocument()
      expect(screen.getByText('LN-2026-999')).toBeInTheDocument()
    })

    // Close confirmation
    await user.click(screen.getByRole('button', { name: /Done/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Loan saved/i })).not.toBeInTheDocument()
    })
  })

  it('opens loan detail modal with KeyValueSummary, OperationSectionCard, and allows payment recording', async () => {
    let capturedPayment: Record<string, unknown> | null = null

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/auth/me')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ user: mockOwnerUser }),
        } as Response
      }

      if (url.includes('/loans/loan-1/payments') && init?.method === 'POST') {
        capturedPayment = JSON.parse(String(init.body))
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({
            loan: {
              ...mockLoanRecord,
              amountPaid: 800,
              remainingBalance: 300,
            },
            payments: [
              {
                _id: 'pay-1',
                paymentNo: 'PM-001',
                amount: 500,
                paymentMethod: 'KHQR',
                paidAt: '2026-09-02T10:00:00.000Z',
                reference: 'QR-123456',
              },
            ],
          }),
        } as Response
      }

      if (url.includes('/loans/loan-1')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            loan: mockLoanRecord,
            payments: [],
          }),
        } as Response
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          loans: [mockLoanRecord],
          summary: mockSummary,
        }),
      } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    // Find and click view loan button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /View LN-2026-001/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /View LN-2026-001/i }))

    // Loan detail dialog opens with OperationModalShell
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /LN-2026-001 · Sokha Chan/i })).toBeInTheDocument()
    })

    const detailDialog = screen.getByRole('dialog', { name: /LN-2026-001 · Sokha Chan/i })

    // KeyValueSummary summary values rendered inside dialog
    expect(within(detailDialog).getByText('Sokha Chan')).toBeInTheDocument()
    expect(within(detailDialog).getByText('$1,000.00')).toBeInTheDocument()
    expect(within(detailDialog).getByText('$1,100.00')).toBeInTheDocument()
    expect(within(detailDialog).getByText('$800.00')).toBeInTheDocument()

    // OperationSectionCards rendered inside dialog
    expect(within(detailDialog).getByRole('heading', { level: 3, name: 'Loan details' })).toBeInTheDocument()
    expect(within(detailDialog).getByRole('heading', { level: 3, name: 'Record payment' })).toBeInTheDocument()

    // Record payment form inside OperationSectionCard
    const amountInput = within(detailDialog).getByPlaceholderText('800')
    await user.type(amountInput, '500')

    const referenceInput = within(detailDialog).getByPlaceholderText(/Receipt or transfer reference/i)
    await user.type(referenceInput, 'QR-123456')

    const recordPaymentButton = within(detailDialog).getByRole('button', { name: /Record payment/i })
    await user.click(recordPaymentButton)

    // Verify payment was submitted correctly
    await waitFor(() => {
      expect(capturedPayment).not.toBeNull()
      expect(capturedPayment).toEqual(
        expect.objectContaining({
          amount: 500,
          paymentMethod: 'CASH',
          reference: 'QR-123456',
        }),
      )
    })

    // Confirmation dialog rendered
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Payment recorded/i })).toBeInTheDocument()
      expect(screen.getByText('Loan payment recorded')).toBeInTheDocument()
    })
  })

  it('safely handles large KHR amounts and long borrower names', async () => {
    const largeLoan = {
      ...mockLoanRecord,
      _id: 'loan-large',
      loanNo: 'LN-2026-KHR-999',
      borrower: {
        name: 'Samnang Vorakneath Cheachanthou Buntheoun Kongkea Rattanak',
        phone: '012 345 678 / 098 765 432',
      },
      principal: 250000000,
      interestType: 'FIXED' as const,
      interestValue: 12500000,
      interestAmount: 12500000,
      totalDue: 262500000,
      amountPaid: 62500000,
      remainingBalance: 200000000,
      currency: 'KHR' as const,
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ user: mockOwnerUser }),
        } as Response
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          loans: [largeLoan],
          summary: mockSummary,
        }),
      } as Response
    })

    render(<LoanPage summary={mockSummary} />)

    // Check long name rendered in table/cards
    await waitFor(() => {
      expect(screen.getAllByText(largeLoan.borrower.name).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('200,000,000 ៛').length).toBeGreaterThanOrEqual(1)
    })
  })
})
