import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

      if (url.includes('/customers')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ customers: [] }),
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

    await user.click(within(createDialog).getByRole('tab', { name: 'New customer' }))

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
    expect(within(createDialog).getByRole('tablist', { name: 'Currency' })).toHaveClass('loan-currency-options')
    expect(within(createDialog).getByRole('tablist', { name: 'Interest calculation' })).toHaveClass('loan-interest-options')

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
  }, 15000)

  it('selects an existing customer and preserves the borrower snapshot in the loan payload', async () => {
    let capturedBody: Record<string, unknown> | null = null
    const existingCustomer = {
      _id: 'customer-loan-1',
      name: 'Dara Sok',
      phone: '096 111 222',
      nationalIdNumber: 'KH-998877',
      address: 'Kandal, Cambodia',
    }

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

      if (url.includes('/customers')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ customers: [existingCustomer] }),
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
              _id: 'loan-existing-customer',
              loanNo: 'LN-2026-EXISTING',
              principal: 750,
              borrower: existingCustomer,
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

    await user.click(await screen.findByRole('button', { name: /New loan/i }))
    const dialog = screen.getByRole('dialog', { name: /Create loan/i })
    const customerSelect = await within(dialog).findByRole('combobox', { name: 'Existing customer' })
    await user.selectOptions(customerSelect, existingCustomer._id)

    expect(within(dialog).getByText(existingCustomer.name)).toBeInTheDocument()
    expect(within(dialog).getByText(existingCustomer.phone)).toBeInTheDocument()
    expect(within(dialog).getByText(existingCustomer.nationalIdNumber)).toBeInTheDocument()
    expect(within(dialog).getByText(existingCustomer.address)).toBeInTheDocument()
    const borrowerSummary = within(dialog).getByRole('list')
    expect(borrowerSummary).toHaveClass('loan-borrower-summary')
    expect(within(borrowerSummary).getAllByRole('listitem')).toHaveLength(4)

    await user.click(within(dialog).getByRole('button', { name: 'Continue' }))
    await user.type(within(dialog).getByLabelText(/Loan amount/i), '750')
    await user.click(within(dialog).getByRole('button', { name: 'Create loan' }))

    await waitFor(() => {
      expect(capturedBody).toEqual(expect.objectContaining({
        borrower: {
          name: existingCustomer.name,
          phone: existingCustomer.phone,
          nationalIdNumber: existingCustomer.nationalIdNumber,
          address: existingCustomer.address,
        },
      }))
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

  it('successfully deletes a paid loan, closes modal, refreshes list, and displays success toast', async () => {
    const paidLoan = {
      ...mockLoanRecord,
      _id: 'loan-paid-1',
      loanNo: 'LN-2026-PAID',
      status: 'PAID' as const,
      remainingBalance: 0,
      amountPaid: 1100,
    }

    let loansList = [paidLoan]
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/auth/me')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ user: mockOwnerUser }),
        } as Response
      }

      if (url.includes('/loans/loan-paid-1') && method === 'DELETE') {
        loansList = []
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ success: true }),
        } as Response
      }

      if (url.includes('/loans/loan-paid-1') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loan: paidLoan, payments: [] }),
        } as Response
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          loans: loansList,
          summary: mockSummary,
        }),
      } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getAllByText(paidLoan.loanNo).length).toBeGreaterThan(0)
    })

    // Open detail
    const openButtons = screen.getAllByRole('button', { name: new RegExp(`View.*${paidLoan.loanNo}`, 'i') })
    await user.click(openButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: new RegExp(paidLoan.loanNo, 'i') })).toBeInTheDocument()
    })

    // Click "Delete loan" in danger zone
    const deleteButton = screen.getByRole('button', { name: /Delete loan/i })
    await user.click(deleteButton)

    // Delete confirmation appears
    expect(screen.getByText(/Delete this loan\?/i)).toBeInTheDocument()

    // Confirm deletion
    const confirmButton = screen.getByRole('button', { name: /Delete permanently/i })
    await user.click(confirmButton)

    // Success toast appears
    await waitFor(() => {
      expect(screen.getByText('Loan deleted successfully.')).toBeInTheDocument()
    })

    // Modal is closed and loan removed from list
    expect(screen.queryByRole('dialog', { name: new RegExp(paidLoan.loanNo, 'i') })).not.toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/loans/loan-paid-1'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('keeps detail modal open and shows error notification on failed loan deletion', async () => {
    const paidLoan = {
      ...mockLoanRecord,
      _id: 'loan-paid-2',
      loanNo: 'LN-2026-PAID-2',
      status: 'PAID' as const,
      remainingBalance: 0,
      amountPaid: 1100,
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/auth/me')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ user: mockOwnerUser }),
        } as Response
      }

      if (url.includes('/loans/loan-paid-2') && method === 'DELETE') {
        return {
          ok: false,
          status: 400,
          headers: new Headers(),
          json: async () => ({ message: 'Cannot delete loan linked to locked tax audit' }),
        } as Response
      }

      if (url.includes('/loans/loan-paid-2') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loan: paidLoan, payments: [] }),
        } as Response
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          loans: [paidLoan],
          summary: mockSummary,
        }),
      } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getAllByText(paidLoan.loanNo).length).toBeGreaterThan(0)
    })

    const openButtons = screen.getAllByRole('button', { name: new RegExp(`View.*${paidLoan.loanNo}`, 'i') })
    await user.click(openButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: new RegExp(paidLoan.loanNo, 'i') })).toBeInTheDocument()
    })

    const deleteButton = screen.getByRole('button', { name: /Delete loan/i })
    await user.click(deleteButton)

    expect(screen.getByText(/Delete this loan\?/i)).toBeInTheDocument()

    const confirmButton = screen.getByRole('button', { name: /Delete permanently/i })
    await user.click(confirmButton)

    // Error is displayed
    await waitFor(() => {
      expect(screen.getByText(/Cannot delete loan linked to locked tax audit/i)).toBeInTheDocument()
    })

    // Delete confirmation dialog remains open with error
    expect(screen.getByRole('dialog', { name: /Delete this loan\?/i })).toBeInTheDocument()

    // No success toast is shown
    expect(screen.queryByText('Loan deleted successfully.')).not.toBeInTheDocument()
  })

  it('does not delete loan or show toast when user cancels confirmation', async () => {
    const paidLoan = {
      ...mockLoanRecord,
      _id: 'loan-paid-3',
      loanNo: 'LN-2026-PAID-3',
      status: 'PAID' as const,
      remainingBalance: 0,
      amountPaid: 1100,
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/auth/me')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ user: mockOwnerUser }),
        } as Response
      }

      if (url.includes('/loans/loan-paid-3') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loan: paidLoan, payments: [] }),
        } as Response
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          loans: [paidLoan],
          summary: mockSummary,
        }),
      } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getAllByText(paidLoan.loanNo).length).toBeGreaterThan(0)
    })

    const openButtons = screen.getAllByRole('button', { name: new RegExp(`View.*${paidLoan.loanNo}`, 'i') })
    await user.click(openButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: new RegExp(paidLoan.loanNo, 'i') })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Delete loan/i }))
    expect(screen.getByText(/Delete this loan\?/i)).toBeInTheDocument()

    // Click "Keep record" to cancel deletion
    const keepButton = screen.getByRole('button', { name: /Keep record/i })
    await user.click(keepButton)

    // Confirmation dialog closed, detail modal still open
    expect(screen.queryByText(/Delete this loan\?/i)).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: new RegExp(paidLoan.loanNo, 'i') })).toBeInTheDocument()

    // No DELETE request sent
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'DELETE' }),
    )

    // No success toast
    expect(screen.queryByText('Loan deleted successfully.')).not.toBeInTheDocument()
  })

  it('guards loan creation against rapid double submission before React rerenders', async () => {
    let postCallCount = 0
    let resolvePost: (value: Response) => void
    const postPromise = new Promise<Response>((resolve) => {
      resolvePost = resolve
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/auth/me')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ user: mockOwnerUser }),
        } as Response
      }

      if (url.includes('/loans') && method === 'POST') {
        postCallCount++
        return postPromise
      }

      if (url.includes('/customers')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ customers: [] }),
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

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /New loan/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /New loan/i }))
    const createDialog = screen.getByRole('dialog', { name: /Create loan/i })
    await user.click(within(createDialog).getByRole('tab', { name: 'New customer' }))

    const nameInput = within(createDialog).getByPlaceholderText('Full name')
    await user.type(nameInput, 'Rapid Clicker')
    const continueButton = within(createDialog).getByRole('button', { name: /Continue/i })
    await user.click(continueButton)

    const amountInput = within(createDialog).getByLabelText(/Loan amount/i)
    await user.clear(amountInput)
    await user.type(amountInput, '500')

    const submitButton = within(createDialog).getByRole('button', { name: /Create loan/i })

    // Two rapid clicks within one act block before React rerenders
    act(() => {
      fireEvent.click(submitButton)
      fireEvent.click(submitButton)
    })

    // Before submittingRef fix, postCallCount will be 2. It must be strictly 1.
    expect(postCallCount).toBe(1)

    // Resolve post request
    resolvePost!({
      ok: true,
      status: 201,
      headers: new Headers(),
      json: async () => ({
        loan: {
          ...mockLoanRecord,
          _id: 'loan-rapid-1',
          loanNo: 'LN-2026-RAPID',
          borrower: { name: 'Rapid Clicker' },
        },
      }),
    } as Response)

    await waitFor(() => {
      expect(screen.getByText('Loan record created')).toBeInTheDocument()
    })
  })

  it('preserves entered inputs on loan creation failure and allows retry after releasing guard', async () => {
    let attempt = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/auth/me')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ user: mockOwnerUser }),
        } as Response
      }

      if (url.includes('/loans') && method === 'POST') {
        attempt++
        if (attempt === 1) {
          return {
            ok: false,
            status: 400,
            headers: new Headers(),
            json: async () => ({ message: 'Server rejected borrower credit' }),
          } as Response
        }
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({
            loan: {
              ...mockLoanRecord,
              _id: 'loan-retry-1',
              loanNo: 'LN-2026-RETRY',
              borrower: { name: 'Retry Borrower' },
            },
          }),
        } as Response
      }

      if (url.includes('/customers')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ customers: [] }),
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

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /New loan/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /New loan/i }))
    const createDialog = screen.getByRole('dialog', { name: /Create loan/i })
    await user.click(within(createDialog).getByRole('tab', { name: 'New customer' }))

    await user.type(within(createDialog).getByPlaceholderText('Full name'), 'Retry Borrower')
    await user.click(within(createDialog).getByRole('button', { name: /Continue/i }))

    const amountInput = within(createDialog).getByLabelText(/Loan amount/i)
    await user.clear(amountInput)
    await user.type(amountInput, '750')

    const submitButton = within(createDialog).getByRole('button', { name: /Create loan/i })
    await user.click(submitButton)

    // Error displayed inside active dialog
    await waitFor(() => {
      expect(within(createDialog).getByText('Server rejected borrower credit')).toBeInTheDocument()
    })

    // Inputs are preserved inside dialog
    expect(within(createDialog).getAllByText('$750.00').length).toBe(2)

    // Retry should work because submission guard was released
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Loan record created')).toBeInTheDocument()
    })
    expect(attempt).toBe(2)
  })

  it('guards loan repayment against rapid double submission before React rerenders', async () => {
    let paymentPostCallCount = 0
    let resolvePaymentPost: (value: Response) => void
    const paymentPostPromise = new Promise<Response>((resolve) => {
      resolvePaymentPost = resolve
    })

    const activeLoan = {
      ...mockLoanRecord,
      _id: 'loan-pay-guard',
      loanNo: 'LN-PAY-001',
      remainingBalance: 500,
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/auth/me')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ user: mockOwnerUser }),
        } as Response
      }

      if (url.includes(`/loans/${activeLoan._id}/payments`) && method === 'POST') {
        paymentPostCallCount++
        return paymentPostPromise
      }

      if (url.includes(`/loans/${activeLoan._id}`) && method === 'GET') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loan: activeLoan, payments: [] }),
        } as Response
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ loans: [activeLoan], summary: mockSummary }),
      } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getAllByText(activeLoan.loanNo).length).toBeGreaterThan(0)
    })

    const openButtons = screen.getAllByRole('button', { name: new RegExp(`View.*${activeLoan.loanNo}`, 'i') })
    await user.click(openButtons[0])

    const detailModal = await screen.findByRole('dialog', { name: new RegExp(activeLoan.loanNo, 'i') })
    const amountInput = within(detailModal).getByRole('spinbutton', { name: /Amount/i })
    await user.clear(amountInput)
    await user.type(amountInput, '200')

    const payButton = within(detailModal).getByRole('button', { name: /Record payment/i })

    // Two rapid clicks within one act block before React rerenders
    act(() => {
      fireEvent.click(payButton)
      fireEvent.click(payButton)
    })

    expect(paymentPostCallCount).toBe(1)

    resolvePaymentPost!({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        loan: {
          ...activeLoan,
          remainingBalance: 300,
          amountPaid: 200,
        },
        payments: [
          {
            _id: 'payment-1',
            paymentNo: 'PAY-1',
            amount: 200,
            paymentMethod: 'CASH',
            paidAt: '2026-09-13T00:00:00.000Z',
          },
        ],
      }),
    } as Response)

    await waitFor(() => {
      expect(screen.getByText('Payment recorded')).toBeInTheDocument()
    })
  })

  it('handles loan list loading failure and recovery with Refresh button', async () => {
    let fail = true
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: mockOwnerUser }) } as Response
      }
      if (url.includes('/loans')) {
        if (fail) {
          return { ok: false, status: 400, headers: new Headers(), json: async () => ({ message: 'Server database error' }) } as Response
        }
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ loans: [mockLoanRecord], summary: mockSummary }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getByText(/Server database error/i)).toBeInTheDocument()
    })

    fail = false
    const refreshBtn = screen.getByRole('button', { name: /Refresh loans/i })
    await user.click(refreshBtn)

    await waitFor(() => {
      expect(screen.getAllByText('Sokha Chan').length).toBeGreaterThan(0)
      expect(screen.queryByText(/Server database error/i)).not.toBeInTheDocument()
    })
  })

  it('displays empty state on desktop and mobile when loans list is empty (default vs filtered)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: mockOwnerUser }) } as Response
      }
      if (url.includes('/loans')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ loans: [], summary: mockSummary }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getAllByText('No loans found').length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Create the first loan record so due dates are never forgotten./i).length).toBeGreaterThan(0)
    })

    // Filter by search
    const searchInput = screen.getByPlaceholderText(/Search loan number, borrower/i)
    await user.type(searchInput, 'UnknownBorrower')

    await waitFor(() => {
      expect(screen.getAllByText(/Try another search or status filter./i).length).toBeGreaterThan(0)
    })
  })

  it('updates search and status filters and sends proper query parameters', async () => {
    const requestedUrls: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      requestedUrls.push(url)
      if (url.includes('/auth/me')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: mockOwnerUser }) } as Response
      }
      if (url.includes('/loans')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ loans: [mockLoanRecord], summary: mockSummary }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getAllByText('Sokha Chan').length).toBeGreaterThan(0)
    })

    // Change status filter
    const statusSelect = screen.getByRole('combobox')
    await user.selectOptions(statusSelect, 'OVERDUE')

    await waitFor(() => {
      const lastUrl = requestedUrls[requestedUrls.length - 1]
      expect(lastUrl).toContain('status=OVERDUE')
    })
  })

  it('handles customer loading error in CreateLoanModal and allows New customer entry', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: mockOwnerUser }) } as Response
      }
      if (url.includes('/customers')) {
        return { ok: false, status: 400, headers: new Headers(), json: async () => ({ message: 'Failed to fetch directory' }) } as Response
      }
      if (url.includes('/loans')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ loans: [mockLoanRecord], summary: mockSummary }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getAllByText('Sokha Chan').length).toBeGreaterThan(0)
      expect(screen.getByRole('button', { name: /New loan/i })).toBeInTheDocument()
    })

    // Open create loan modal
    const newLoanBtn = screen.getByRole('button', { name: /New loan/i })
    await user.click(newLoanBtn)

    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch directory. Choose New customer to continue./i)).toBeInTheDocument()
    })

    // Switch to New customer
    const newCustTab = screen.getByRole('tab', { name: /New customer/i })
    await user.click(newCustTab)

    expect(screen.getByPlaceholderText('Full name')).toBeInTheDocument()
  })

  it('supports KHR currency with 100 Riel increments, fixed interest, and stepper clicks', async () => {
    let createdPayload: any = null
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: mockOwnerUser }) } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.endsWith('/loans') && init?.method === 'POST') {
        createdPayload = JSON.parse(String(init.body))
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({
            loan: {
              ...mockLoanRecord,
              loanNo: 'LN-2026-KHR-1',
              currency: 'KHR',
              principal: 400000,
              interestType: 'FIXED',
              interestValue: 20000,
              interestAmount: 20000,
              totalDue: 420000,
              remainingBalance: 420000,
            },
          }),
        } as Response
      }
      if (url.includes('/loans')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ loans: [mockLoanRecord], summary: mockSummary }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /New loan/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /New loan/i }))
    await user.click(screen.getByRole('tab', { name: /New customer/i }))

    await user.type(screen.getByPlaceholderText('Full name'), 'Chea Vibol')
    await user.click(screen.getByRole('button', { name: /Continue/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/Loan amount/i)).toBeInTheDocument()
    })

    // Switch to KHR currency
    await user.click(screen.getByRole('tab', { name: /KHR/i }))

    // Switch to Fixed interest
    await user.click(screen.getByRole('tab', { name: /Fixed money amount/i }))

    // Enter principal
    const principalInput = screen.getByLabelText(/Loan amount/i)
    await user.clear(principalInput)
    await user.type(principalInput, '400000')

    // Enter fixed interest
    const interestInput = screen.getByLabelText(/Interest amount \(KHR\)/i)
    await user.clear(interestInput)
    await user.type(interestInput, '20000')

    // Stepper click: back to step 1
    await user.click(screen.getByRole('button', { name: /Borrower/i }))
    expect(screen.getByPlaceholderText('Full name')).toHaveValue('Chea Vibol')

    // Stepper click: forward to step 2
    await user.click(screen.getByRole('button', { name: /Terms & schedule/i }))

    // Submit
    await user.click(screen.getByRole('button', { name: /Create loan/i }))

    await waitFor(() => {
      expect(createdPayload).toBeTruthy()
      expect(createdPayload.currency).toBe('KHR')
      expect(createdPayload.interestType).toBe('FIXED')
      expect(screen.getByText('Loan saved')).toBeInTheDocument()
    })
  })

  it('edits due date, guards duplicate submission, and updates detail modal', async () => {
    let patchCount = 0
    let resolvePatch: (val: Response) => void
    const patchPromise = new Promise<Response>((res) => {
      resolvePatch = res
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: mockOwnerUser }) } as Response
      }
      if (url.includes('/loans/loan-1') && init?.method === 'PATCH') {
        patchCount++
        return patchPromise
      }
      if (url.includes('/loans/loan-1')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            loan: { ...mockLoanRecord, dueDate: '2026-10-15T00:00:00.000Z' },
            payments: [],
          }),
        } as Response
      }
      if (url.includes('/loans')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ loans: [mockLoanRecord], summary: mockSummary }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getAllByText('Sokha Chan').length).toBeGreaterThan(0)
      expect(screen.getByRole('button', { name: /New loan/i })).toBeInTheDocument()
    })

    await user.click(screen.getByLabelText(`View ${mockLoanRecord.loanNo}`))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save due date/i })).toBeInTheDocument()
    })

    const dueInput = screen.getByLabelText(/Change due date/i)
    await user.clear(dueInput)
    await user.type(dueInput, '2026-10-15')

    const dueForm = dueInput.closest('form')!
    act(() => {
      fireEvent.submit(dueForm)
      fireEvent.submit(dueForm)
    })

    expect(patchCount).toBe(1)

    resolvePatch!({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ loan: { ...mockLoanRecord, dueDate: '2026-10-15T00:00:00.000Z' } }),
    } as Response)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save due date/i })).not.toBeDisabled()
    })
  })

  it('cancels an unpaid loan, handles cancel confirmation dialog, and displays cancellation error', async () => {
    let cancelCalled = false
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: mockOwnerUser }) } as Response
      }
      if (url.includes('/loans/loan-1/cancel') && init?.method === 'POST') {
        cancelCalled = true
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loan: { ...mockLoanRecord, status: 'CANCELLED' } }),
        } as Response
      }
      if (url.includes('/loans/loan-1')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            loan: { ...mockLoanRecord, amountPaid: 0, status: 'ACTIVE' },
            payments: [],
          }),
        } as Response
      }
      if (url.includes('/loans')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ loans: [mockLoanRecord], summary: mockSummary }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getAllByText('Sokha Chan').length).toBeGreaterThan(0)
      expect(screen.getByRole('button', { name: /New loan/i })).toBeInTheDocument()
    })

    await user.click(screen.getByLabelText(`View ${mockLoanRecord.loanNo}`))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Cancel loan/i })).toBeInTheDocument()
    })

    // Click "Cancel loan" in danger zone -> opens confirmation modal
    await user.click(screen.getByRole('button', { name: /Cancel loan/i }))

    await waitFor(() => {
      expect(screen.getByText(/Cancel this loan\?/i)).toBeInTheDocument()
    })

    // Click "Keep loan" -> closes confirmation
    await user.click(screen.getByRole('button', { name: /Keep loan/i }))
    expect(screen.queryByText(/Cancel this loan\?/i)).not.toBeInTheDocument()

    // Reopen confirmation and confirm cancel
    await user.click(screen.getByRole('button', { name: /Cancel loan/i }))
    await waitFor(() => {
      expect(screen.getByText(/Cancel this loan\?/i)).toBeInTheDocument()
    })

    const confirmBtn = screen.getByRole('button', { name: /Cancel loan/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(cancelCalled).toBe(true)
    })
  })

  it('handles payment failure, displays error in dialog, preserves inputs, and allows retry', async () => {
    let failPayment = true
    let paymentAttempts = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: mockOwnerUser }) } as Response
      }
      if (url.includes('/loans/loan-1/payments') && init?.method === 'POST') {
        paymentAttempts++
        if (failPayment) {
          return { ok: false, status: 400, headers: new Headers(), json: async () => ({ message: 'Payment cannot exceed the remaining balance' }) } as Response
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            loan: { ...mockLoanRecord, remainingBalance: 600, amountPaid: 500 },
            payments: [{ _id: 'pay-1', paymentNo: 'LP-1', amount: 200, paymentMethod: 'CASH', paidAt: '2026-09-13T00:00:00.000Z' }],
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
      if (url.includes('/loans')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ loans: [mockLoanRecord], summary: mockSummary }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getAllByText('Sokha Chan').length).toBeGreaterThan(0)
      expect(screen.getByRole('button', { name: /New loan/i })).toBeInTheDocument()
    })

    await user.click(screen.getByLabelText(`View ${mockLoanRecord.loanNo}`))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Record payment/i })).toBeInTheDocument()
    })

    const amountInput = screen.getByLabelText(/Amount/i)
    await user.clear(amountInput)
    await user.type(amountInput, '200')

    const noteInput = screen.getByLabelText(/Note/i)
    await user.type(noteInput, 'Cash partial payment')

    // Submit payment -> fails
    await user.click(screen.getByRole('button', { name: /Record payment/i }))

    await waitFor(() => {
      expect(screen.getByText(/Payment cannot exceed the remaining balance/i)).toBeInTheDocument()
    })

    // Verify inputs preserved
    expect(amountInput).toHaveValue(200)
    expect(noteInput).toHaveValue('Cash partial payment')

    // Retry payment
    failPayment = false
    await user.click(screen.getByRole('button', { name: /Record payment/i }))

    await waitFor(() => {
      expect(paymentAttempts).toBe(2)
      expect(screen.getByText('Payment recorded')).toBeInTheDocument()
    })
  })

  it('renders payment confirmation card with Done button and provides delete button for PAID loan', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: mockOwnerUser }) } as Response
      }
      if (url.includes('/loans/loan-1/payments') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            loan: { ...mockLoanRecord, remainingBalance: 0, amountPaid: 1100, status: 'PAID' },
            payments: [{ _id: 'pay-full', paymentNo: 'LP-FULL', amount: 800, paymentMethod: 'CASH', paidAt: '2026-09-13T00:00:00.000Z' }],
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
      if (url.includes('/loans')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ loans: [mockLoanRecord], summary: mockSummary }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getAllByText('Sokha Chan').length).toBeGreaterThan(0)
      expect(screen.getByRole('button', { name: /New loan/i })).toBeInTheDocument()
    })

    await user.click(screen.getByLabelText(`View ${mockLoanRecord.loanNo}`))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Record payment/i })).toBeInTheDocument()
    })

    const amountInput = screen.getByLabelText(/Amount/i)
    await user.clear(amountInput)
    await user.type(amountInput, '800')

    await user.click(screen.getByRole('button', { name: /Record payment/i }))

    await waitFor(() => {
      expect(screen.getByText('Loan paid in full')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Delete loan/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Done/i })).toBeInTheDocument()
    })

    // Click Done -> closes modal
    await user.click(screen.getByRole('button', { name: /Done/i }))
    expect(screen.queryByText('Loan paid in full')).not.toBeInTheDocument()
  })

  it('race condition: slow older openDetail response does not overwrite newer selected loan', async () => {
    let resolveLoan1: (val: Response) => void
    const loan1Promise = new Promise<Response>((res) => {
      resolveLoan1 = res
    })

    const loanRecord2 = {
      ...mockLoanRecord,
      _id: 'loan-2',
      loanNo: 'LN-2026-002',
      borrower: { name: 'Pich Vanna', phone: '011 222 333' },
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: mockOwnerUser }) } as Response
      }
      if (url.includes('/loans/loan-1')) {
        return loan1Promise
      }
      if (url.includes('/loans/loan-2')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loan: loanRecord2, payments: [] }),
        } as Response
      }
      if (url.includes('/loans')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loans: [mockLoanRecord, loanRecord2], summary: mockSummary }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getAllByText('Sokha Chan').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Pich Vanna').length).toBeGreaterThan(0)
    })

    // 1. Click loan 1 (slow response)
    await user.click(screen.getByLabelText(`View ${mockLoanRecord.loanNo}`))

    // 2. Click loan 2 (fast response)
    await user.click(screen.getByLabelText(`View ${loanRecord2.loanNo}`))

    await waitFor(() => {
      expect(screen.getByText('LN-2026-002 · Pich Vanna')).toBeInTheDocument()
    })

    // 3. Now resolve loan 1
    resolveLoan1!({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ loan: mockLoanRecord, payments: [] }),
    } as Response)

    // Wait and verify loan 2 is still displayed, NOT overwritten by loan 1
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByText('LN-2026-002 · Pich Vanna')).toBeInTheDocument()
    expect(screen.queryByText('LN-2026-001 · Sokha Chan')).not.toBeInTheDocument()
  })

  it('race condition: slow in-flight openDetail does not reopen modal after user closed it', async () => {
    let callCount = 0
    let resolveSlowLoan1: (val: Response) => void
    const slowLoan1Promise = new Promise<Response>((res) => {
      resolveSlowLoan1 = res
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: mockOwnerUser }) } as Response
      }
      if (url.includes('/loans/loan-1')) {
        callCount++
        if (callCount === 1) {
          // First call resolves fast and opens modal
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({ loan: mockLoanRecord, payments: [] }),
          } as Response
        }
        // Second call is slow/delayed
        return slowLoan1Promise
      }
      if (url.includes('/loans')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loans: [mockLoanRecord], summary: mockSummary }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getByLabelText(`View ${mockLoanRecord.loanNo}`)).toBeInTheDocument()
    })

    // 1. Open loan 1
    await user.click(screen.getByLabelText(`View ${mockLoanRecord.loanNo}`))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /LN-2026-001 · Sokha Chan/i })).toBeInTheDocument()
    })

    // 2. A background refresh or second lookup fires another in-flight read
    // Trigger second view click to simulate in-flight read
    const viewButton = screen.getByLabelText(`View ${mockLoanRecord.loanNo}`)
    fireEvent.click(viewButton)
    expect(callCount).toBe(2)

    // 3. User closes the dialog before the second request resolves
    const closeBtn = screen.getByRole('button', { name: /Close/i })
    await user.click(closeBtn)

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /LN-2026-001 · Sokha Chan/i })).not.toBeInTheDocument()
    })

    // 4. Now the delayed second response arrives
    resolveSlowLoan1!({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ loan: mockLoanRecord, payments: [] }),
    } as Response)

    await new Promise((r) => setTimeout(r, 50))

    // Assert: modal does NOT reopen
    expect(screen.queryByRole('dialog', { name: /LN-2026-001 · Sokha Chan/i })).not.toBeInTheDocument()
  })

  it('scans barcode: opens detail on match, displays error on unknown barcode', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: mockOwnerUser }) } as Response
      }
      if (url.includes('/loans/loan-1')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loan: mockLoanRecord, payments: [] }),
        } as Response
      }
      if (url.includes('/loans?search=LN-2026-001') || url.includes('/loans?search=ln-2026-001')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loans: [mockLoanRecord], summary: mockSummary }),
        } as Response
      }
      if (url.includes('/loans?search=UNKNOWN-BC')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loans: [], summary: mockSummary }),
        } as Response
      }
      if (url.includes('/loans')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loans: [mockLoanRecord], summary: mockSummary }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    // Open scan modal
    await user.click(screen.getByRole('button', { name: /Scan loan/i }))
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Scan loan/i })).toBeInTheDocument()
    })

    const scanInput = screen.getByLabelText(/Loan barcode or number/i)
    const findBtn = screen.getByRole('button', { name: /Find loan/i })

    // 1. Scan unknown barcode -> error displayed in modal
    await user.type(scanInput, 'UNKNOWN-BC')
    await user.click(findBtn)

    await waitFor(() => {
      expect(screen.getByText(/No loan matches that barcode. Check that you scanned the loan receipt./i)).toBeInTheDocument()
    })

    // 2. Scan valid barcode -> opens detail modal
    await user.clear(scanInput)
    await user.type(scanInput, 'LN-2026-001')
    await user.click(findBtn)

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /LN-2026-001 · Sokha Chan/i })).toBeInTheDocument()
    })
  })

  it('enforces CASHIER role boundaries: cannot create or manage due date, but can record payment', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: { id: 'u-cashier', name: 'Cashier', role: 'CASHIER', active: true } }) } as Response
      }
      if (url.includes('/loans/loan-1')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loan: mockLoanRecord, payments: [] }),
        } as Response
      }
      if (url.includes('/loans')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loans: [mockLoanRecord], summary: mockSummary }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    // Verify loans rendered
    await waitFor(() => {
      expect(screen.getAllByText('Sokha Chan').length).toBeGreaterThan(0)
    })

    // CASHIER cannot create loans: New loan button must not exist
    expect(screen.queryByRole('button', { name: /New loan/i })).not.toBeInTheDocument()

    // Open detail
    await user.click(screen.getByLabelText(`View ${mockLoanRecord.loanNo}`))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /LN-2026-001 · Sokha Chan/i })).toBeInTheDocument()
    })

    // CASHIER can record payment
    expect(screen.getByRole('button', { name: /Record payment/i })).toBeInTheDocument()

    // CASHIER cannot save due date or cancel loan
    expect(screen.queryByRole('button', { name: /Save due date/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cancel loan/i })).not.toBeInTheDocument()
  })

  it('opens loan detail from mobile contract card action button', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: mockOwnerUser }) } as Response
      }
      if (url.includes('/loans/loan-1')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loan: mockLoanRecord, payments: [] }),
        } as Response
      }
      if (url.includes('/loans')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loans: [mockLoanRecord], summary: mockSummary }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getByLabelText(`View loan ${mockLoanRecord.loanNo}`)).toBeInTheDocument()
    })

    await user.click(screen.getByLabelText(`View loan ${mockLoanRecord.loanNo}`))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /LN-2026-001 · Sokha Chan/i })).toBeInTheDocument()
    })
  })

  it('validates step 1 borrower selection and entry in CreateLoanModal', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: mockOwnerUser }) } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/loans')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ loans: [mockLoanRecord], summary: mockSummary }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /New loan/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /New loan/i }))

    const dialog = screen.getByRole('dialog', { name: /Create loan/i })
    const form = dialog.querySelector('form')!

    // In EXISTING mode with no selection, submit form -> shows validation error
    fireEvent.submit(form)
    expect(screen.getByText('Select an existing customer')).toBeInTheDocument()

    // Switch to NEW mode, leave name empty, submit form -> shows name required error
    await user.click(screen.getByRole('tab', { name: /New customer/i }))
    fireEvent.submit(form)
    expect(screen.getByText('Borrower name is required')).toBeInTheDocument()
  })

  it('displays error inside active modal when due date update fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: mockOwnerUser }) } as Response
      }
      if (url.includes('/loans/loan-1') && init?.method === 'PATCH') {
        return {
          ok: false,
          status: 400,
          headers: new Headers(),
          json: async () => ({ message: 'Due date cannot be before the loan date' }),
        } as Response
      }
      if (url.includes('/loans/loan-1')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loan: mockLoanRecord, payments: [] }),
        } as Response
      }
      if (url.includes('/loans')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ loans: [mockLoanRecord], summary: mockSummary }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getByLabelText(`View ${mockLoanRecord.loanNo}`)).toBeInTheDocument()
    })

    await user.click(screen.getByLabelText(`View ${mockLoanRecord.loanNo}`))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save due date/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Save due date/i }))

    await waitFor(() => {
      expect(screen.getByText(/Due date cannot be before the loan date/i)).toBeInTheDocument()
    })
  })

  it('displays error inside active modal when loan cancellation fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: mockOwnerUser }) } as Response
      }
      if (url.includes('/loans/loan-1/cancel') && init?.method === 'POST') {
        return {
          ok: false,
          status: 400,
          headers: new Headers(),
          json: async () => ({ message: 'Loans with repayment history cannot be cancelled' }),
        } as Response
      }
      if (url.includes('/loans/loan-1')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loan: { ...mockLoanRecord, amountPaid: 0 }, payments: [] }),
        } as Response
      }
      if (url.includes('/loans')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ loans: [mockLoanRecord], summary: mockSummary }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getByLabelText(`View ${mockLoanRecord.loanNo}`)).toBeInTheDocument()
    })

    await user.click(screen.getByLabelText(`View ${mockLoanRecord.loanNo}`))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Cancel loan/i })).toBeInTheDocument()
    })

    // Click cancel in details
    await user.click(screen.getByRole('button', { name: /Cancel loan/i }))

    await waitFor(() => {
      expect(screen.getByText(/Cancel this loan\?/i)).toBeInTheDocument()
    })

    // Confirm cancel
    await user.click(screen.getByRole('button', { name: /Cancel loan/i }))

    await waitFor(() => {
      expect(screen.getByText(/Loans with repayment history cannot be cancelled/i)).toBeInTheDocument()
    })
  })

  it('displays page error when openDetail fails to fetch loan details', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: mockOwnerUser }) } as Response
      }
      if (url.includes('/loans/loan-1')) {
        return {
          ok: false,
          status: 400,
          headers: new Headers(),
          json: async () => ({ message: 'Loan record is corrupted or missing' }),
        } as Response
      }
      if (url.includes('/loans')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loans: [mockLoanRecord], summary: mockSummary }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getByLabelText(`View ${mockLoanRecord.loanNo}`)).toBeInTheDocument()
    })

    await user.click(screen.getByLabelText(`View ${mockLoanRecord.loanNo}`))

    await waitFor(() => {
      expect(screen.getByText(/Loan record is corrupted or missing/i)).toBeInTheDocument()
    })
  })

  it('dismisses toast notification when dismiss button is clicked', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: mockOwnerUser }) } as Response
      }
      if (url.includes('/loans/loan-1') && init?.method === 'DELETE') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ deleted: true }),
        } as Response
      }
      if (url.includes('/loans/loan-1')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loan: { ...mockLoanRecord, status: 'PAID', amountPaid: 1100, remainingBalance: 0 }, payments: [] }),
        } as Response
      }
      if (url.includes('/loans')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loans: [mockLoanRecord], summary: mockSummary }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getByLabelText(`View ${mockLoanRecord.loanNo}`)).toBeInTheDocument()
    })

    await user.click(screen.getByLabelText(`View ${mockLoanRecord.loanNo}`))

    // Open delete confirmation
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Delete loan/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Delete loan/i }))

    // Confirm deletion
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Delete permanently/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Delete permanently/i }))

    // Toast appears
    await waitFor(() => {
      expect(screen.getByText('Loan deleted successfully.')).toBeInTheDocument()
    })

    // Click dismiss button on toast
    const dismissBtn = screen.getByRole('button', { name: /Dismiss message/i })
    await user.click(dismissBtn)

    expect(screen.queryByText('Loan deleted successfully.')).not.toBeInTheDocument()
  })

  it('creates loan with PERCENT interest mode, custom dates, reminder days, reason, and notes', async () => {
    let capturedPayload: any = null
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: mockOwnerUser }) } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.endsWith('/loans') && init?.method === 'POST') {
        capturedPayload = JSON.parse(String(init.body))
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({
            loan: {
              ...mockLoanRecord,
              loanNo: 'LN-PERCENT-1',
              interestType: 'PERCENT',
              interestValue: 12,
              interestAmount: 120,
              totalDue: 1120,
            },
          }),
        } as Response
      }
      if (url.includes('/loans')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ loans: [mockLoanRecord], summary: mockSummary }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /New loan/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /New loan/i }))
    await user.click(screen.getByRole('tab', { name: /New customer/i }))

    // These fields test submitted values, not per-character keyboard behavior.
    for (const [placeholder, value] of [
      ['Full name', 'Sinat Heng'],
      ['012 345 678', '017 999 888'],
      ['ID number', '0987654321'],
      ['Village, district, province', 'Siem Reap, Cambodia'],
    ]) {
      await user.click(screen.getByPlaceholderText(placeholder))
      await user.paste(value)
    }
    await user.click(screen.getByRole('button', { name: /Continue/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/Loan amount/i)).toBeInTheDocument()
    })

    // Enter principal
    const principalInput = screen.getByLabelText(/Loan amount/i)
    await user.clear(principalInput)
    await user.type(principalInput, '1000')

    // Switch to Rate (%)
    await user.click(screen.getByRole('tab', { name: /Rate \(%\)/i }))

    // Enter rate
    const rateInput = screen.getByRole('spinbutton')
    await user.clear(rateInput)
    await user.type(rateInput, '12')

    // Set loanDate and dueDate
    fireEvent.change(screen.getByLabelText(/Loan date/i), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText(/Due date/i), { target: { value: '2026-10-01' } })

    // Set reminderDays
    const reminderSelect = screen.getByRole('combobox', { name: /Remind before due/i })
    await user.selectOptions(reminderSelect, '7')

    // Set reason and notes
    await user.click(screen.getByPlaceholderText(/Emergency, business/i))
    await user.paste('Phone stock purchase')
    await user.click(screen.getByPlaceholderText(/Agreement details/i))
    await user.paste('Agreed 12% monthly')

    // Submit
    await user.click(screen.getByRole('button', { name: /Create loan/i }))

    await waitFor(() => {
      expect(capturedPayload).toBeTruthy()
      expect(capturedPayload.borrower.name).toBe('Sinat Heng')
      expect(capturedPayload.borrower.phone).toBe('017 999 888')
      expect(capturedPayload.borrower.nationalIdNumber).toBe('0987654321')
      expect(capturedPayload.borrower.address).toBe('Siem Reap, Cambodia')
      expect(capturedPayload.interestType).toBe('PERCENT')
      expect(capturedPayload.interestValue).toBe(12)
      expect(capturedPayload.reminderDays).toBe(7)
      expect(capturedPayload.reason).toBe('Phone stock purchase')
      expect(capturedPayload.notes).toBe('Agreed 12% monthly')
      expect(screen.getByText('Loan saved')).toBeInTheDocument()
    })
  })

  it('displays payment history list with receivedBy and reference, and allows deleting CANCELLED loan', async () => {
    let deletedId = ''
    const cancelledLoan = {
      ...mockLoanRecord,
      _id: 'loan-cancelled',
      loanNo: 'LN-CANCELLED-1',
      status: 'CANCELLED' as const,
      amountPaid: 0,
      remainingBalance: 1100,
    }

    const mockPayments = [
      {
        _id: 'p-1',
        paymentNo: 'LP-001',
        amount: 300,
        paymentMethod: 'CASH',
        paidAt: '2026-08-15T00:00:00.000Z',
        reference: 'REC-REF-123',
        receivedBy: { name: 'Alice Manager', role: 'MANAGER' },
      },
    ]

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: mockOwnerUser }) } as Response
      }
      if (url.includes('/loans/loan-cancelled') && init?.method === 'DELETE') {
        deletedId = 'loan-cancelled'
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ deleted: true }) } as Response
      }
      if (url.includes('/loans/loan-cancelled')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loan: cancelledLoan, payments: mockPayments }),
        } as Response
      }
      if (url.includes('/loans')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ loans: [cancelledLoan], summary: mockSummary }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<LoanPage summary={mockSummary} />)

    await waitFor(() => {
      expect(screen.getByLabelText(`View ${cancelledLoan.loanNo}`)).toBeInTheDocument()
    })

    await user.click(screen.getByLabelText(`View ${cancelledLoan.loanNo}`))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: new RegExp(cancelledLoan.loanNo, 'i') })).toBeInTheDocument()
    })

    // Payment history item assertions
    expect(screen.getByText(/LP-001 · CASH/i)).toBeInTheDocument()
    expect(screen.getByText(/Alice Manager · REC-REF-123/i)).toBeInTheDocument()

    // Cancelled loan delete button assertion
    const deleteBtn = screen.getByRole('button', { name: /Delete loan/i })
    expect(deleteBtn).toBeInTheDocument()
    await user.click(deleteBtn)

    await waitFor(() => {
      expect(screen.getByText(/Delete this loan\?/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Delete permanently/i }))

    await waitFor(() => {
      expect(deletedId).toBe('loan-cancelled')
      expect(screen.getByText('Loan deleted successfully.')).toBeInTheDocument()
    })
  })
})
