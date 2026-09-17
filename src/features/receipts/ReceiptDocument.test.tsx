import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ReceiptDocument from './ReceiptDocument'
import type { ReceiptRecord } from './receipt-types'

const mockSaleReceipt: ReceiptRecord = {
  _id: 'rec-sale-doc',
  receiptNo: 'SR-2026-9999',
  documentType: 'SALE_RECEIPT',
  sourceType: 'TRADE',
  sourceId: 'trade-9999',
  sourceSubId: 'trade',
  referenceNo: 'SL-2026-9999',
  partyName: 'Customer Sokha',
  partyPhone: '098111222',
  currency: 'USD',
  total: 900,
  issuedAt: '2026-09-01T10:00:00.000Z',
  printCount: 2,
  createdAt: '2026-09-01T10:00:00.000Z',
  snapshot: {
    schemaVersion: 1,
    documentType: 'SALE_RECEIPT',
    title: 'Sales Receipt / Invoice',
    shop: {
      name: 'PhoneFlow Flagship',
      subtitle: 'Premium Electronics',
      phone: '012-000-111',
      address: 'Street 2004, Phnom Penh',
      footer: 'All sales subject to warranty terms.',
    },
    referenceNo: 'SL-2026-9999',
    issuedAt: '2026-09-01T10:00:00.000Z',
    party: {
      name: 'Customer Sokha',
      phone: '098111222',
      nationalIdNumber: 'ID-099281',
      role: 'Customer',
    },
    currency: 'USD',
    exchangeRate: 4100,
    items: [
      {
        name: 'iPhone 15 Pro 128GB',
        quantity: 1,
        unitPrice: 950,
        total: 950,
        sku: 'IPH-15P-128',
        imei: '356987123456789',
        description: 'Apple iPhone 15 Pro Natural Titanium',
      },
    ],
    subtotal: 950,
    discount: 50,
    total: 900,
    amountPaid: 900,
    amountReceived: 1000,
    changeDue: 100,
    balance: 0,
    paymentMethod: 'CASH',
    paymentStatus: 'PAID',
    transactionStatus: 'COMPLETED',
    signatureLabels: [],
  },
}

const mockRefundReceipt: ReceiptRecord = {
  _id: 'rec-refund-doc',
  receiptNo: 'RR-2026-8888',
  documentType: 'REFUND_RECEIPT',
  sourceType: 'TRADE',
  sourceId: 'trade-8888',
  sourceSubId: 'refund',
  referenceNo: 'SL-2026-8888',
  partyName: 'Customer Dara',
  partyPhone: '097555444',
  currency: 'USD',
  total: 450,
  issuedAt: '2026-09-02T14:00:00.000Z',
  printCount: 1,
  createdAt: '2026-09-02T14:00:00.000Z',
  snapshot: {
    schemaVersion: 1,
    documentType: 'REFUND_RECEIPT',
    title: 'Refund Receipt',
    shop: {
      name: 'PhoneFlow Flagship',
      phone: '012-000-111',
      footer: 'Thank you for your business.',
    },
    referenceNo: 'SL-2026-8888',
    issuedAt: '2026-09-02T14:00:00.000Z',
    party: {
      name: 'Customer Dara',
      phone: '097555444',
      role: 'Customer',
    },
    currency: 'USD',
    exchangeRate: 4100,
    items: [
      {
        name: 'Samsung Galaxy A55',
        quantity: 1,
        unitPrice: 450,
        total: 450,
        imei: '354111222333444',
      },
    ],
    total: 450,
    amountPaid: 450,
    balance: 0,
    paymentStatus: 'REFUNDED',
    transactionStatus: 'RETURNED',
    notes: 'Refund reason: Customer reported dead pixels\nReturned items were restored to available stock.',
    signatureLabels: ['Customer acknowledgement', 'Shop representative'],
  },
}

describe('ReceiptDocument component', () => {
  it('renders a SALE_RECEIPT with item identifiers, amounts, barcode, and no customer signature block', () => {
    render(<ReceiptDocument receipt={mockSaleReceipt} layout="A4" />)

    expect(screen.getAllByText('SR-2026-9999').length).toBeGreaterThan(0)
    expect(screen.getAllByText('SL-2026-9999').length).toBeGreaterThan(0)
    expect(screen.getByText('PhoneFlow Flagship')).toBeInTheDocument()
    expect(screen.getByText('Customer Sokha')).toBeInTheDocument()

    // Item details
    expect(screen.getByText('iPhone 15 Pro 128GB')).toBeInTheDocument()
    expect(screen.getByText('SKU: IPH-15P-128')).toBeInTheDocument()
    expect(screen.getByText('IMEI: 356987123456789')).toBeInTheDocument()

    // Financial totals
    expect(screen.getAllByText('$950').length).toBeGreaterThan(0)
    expect(screen.getByText('-$50')).toBeInTheDocument()
    expect(screen.getAllByText('$900').length).toBeGreaterThan(0)
    expect(screen.getByText('$1,000')).toBeInTheDocument()
    expect(screen.getByText('$100')).toBeInTheDocument()

    // Sale receipt has barcode and no signature block
    expect(screen.getByLabelText(/Barcode for sale refund SL-2026-9999/i)).toBeInTheDocument()
    expect(screen.queryByText('Customer acknowledgement')).not.toBeInTheDocument()
  })

  it('renders a REFUND_RECEIPT with Returned items heading, Refund total, notes, and dual signature lines', () => {
    render(<ReceiptDocument receipt={mockRefundReceipt} layout="A4" />)

    expect(screen.getAllByText('RR-2026-8888').length).toBeGreaterThan(0)
    expect(screen.getByText('Refund Receipt')).toBeInTheDocument()
    expect(screen.getByText('Returned items')).toBeInTheDocument()
    expect(screen.getByText('Samsung Galaxy A55')).toBeInTheDocument()

    // Totals section
    expect(screen.getByText('Refund total')).toBeInTheDocument()
    expect(screen.getAllByText('Refunded').length).toBeGreaterThan(0)
    expect(screen.getByText('Remaining due')).toBeInTheDocument()

    // Notes
    expect(screen.getByText(/Customer reported dead pixels/i)).toBeInTheDocument()
    expect(screen.getByText(/Returned items were restored to available stock/i)).toBeInTheDocument()

    // Signatures
    expect(screen.getByText('Customer acknowledgement')).toBeInTheDocument()
    expect(screen.getByText('Shop representative')).toBeInTheDocument()
  })

  it('renders KHR amounts with 100 Riel rounding and ៛ currency symbol', () => {
    const khrReceipt: ReceiptRecord = {
      ...mockRefundReceipt,
      receiptNo: 'RR-KHR-123',
      currency: 'KHR',
      total: 410050,
      snapshot: {
        ...mockRefundReceipt.snapshot!,
        currency: 'KHR',
        total: 410050,
        amountPaid: 410050,
        balance: 0,
        items: [
          { name: 'Phone Case', quantity: 1, unitPrice: 410050, total: 410050 },
        ],
      },
    }

    render(<ReceiptDocument receipt={khrReceipt} layout="A4" />)

    // 410,050 rounded to nearest 100 is 410,100
    expect(screen.getAllByText(/410,100\s*៛/).length).toBeGreaterThan(0)
  })

  it('renders appropriate layout classes for A4 vs 80mm THERMAL layout', () => {
    const { container: a4Container } = render(<ReceiptDocument receipt={mockSaleReceipt} layout="A4" />)
    expect(a4Container.querySelector('.receipt-paper-a4')).toBeInTheDocument()

    const { container: thermalContainer } = render(<ReceiptDocument receipt={mockSaleReceipt} layout="THERMAL" />)
    expect(thermalContainer.querySelector('.receipt-paper-thermal')).toBeInTheDocument()
  })

  it('displays fallback message when receipt snapshot is missing', () => {
    const brokenReceipt: ReceiptRecord = {
      ...mockSaleReceipt,
      snapshot: undefined as any,
    }

    render(<ReceiptDocument receipt={brokenReceipt} layout="A4" />)
    expect(screen.getByText(/Receipt snapshot is unavailable/i)).toBeInTheDocument()
  })

  it('renders a PAWN_CONTRACT in 80mm THERMAL format with barcode, shop info, and warnings', () => {
    const pawnThermalReceipt: ReceiptRecord = {
      _id: 'rec-pawn-thermal',
      receiptNo: 'RCP-PW-001',
      documentType: 'PAWN_CONTRACT',
      sourceType: 'PAWN',
      sourceId: 'pawn-1',
      sourceSubId: 'contract-1',
      referenceNo: 'PW-2026-0001',
      partyName: 'Chann Borey',
      partyPhone: '012999888',
      currency: 'USD',
      total: 330,
      issuedAt: '2026-09-10T08:00:00.000Z',
      printCount: 0,
      createdAt: '2026-09-10T08:00:00.000Z',
      snapshot: {
        schemaVersion: 1,
        documentType: 'PAWN_CONTRACT',
        title: 'Pawn Contract',
        shop: {
          name: 'PhoneFlow Pawn',
          phone: '023888999',
          address: 'Corner St. 271, Phnom Penh',
        },
        referenceNo: 'PW-2026-0001',
        issuedAt: '2026-09-10T08:00:00.000Z',
        startDate: '2026-09-10T08:00:00.000Z',
        dueDate: '2026-10-10T08:00:00.000Z',
        graceEndsAt: '2026-10-17T08:00:00.000Z',
        ticketPart: 1,
        feeModel: 'DAILY_SIMPLE',
        contractLengthDays: 30,
        principal: 300,
        dailyFeeRate: 0.33,
        dailyFeeAmount: 1,
        pawnFeeAtDue: 30,
        total: 330,
        party: {
          name: 'Chann Borey',
          phone: '012999888',
          role: 'Customer',
        },
        currency: 'USD',
        items: [
          {
            name: 'MacBook Pro M2 14-inch',
            quantity: 1,
            unitPrice: 300,
            total: 300,
            description: 'Silver, 512GB SSD',
            imei: 'SERIAL-MBP-9922',
          },
        ],
      },
    }

    render(<ReceiptDocument receipt={pawnThermalReceipt} layout="THERMAL" />)

    expect(screen.getByText('Pawn Shop PhoneFlow Pawn')).toBeInTheDocument()
    expect(screen.getByText('Tel: 023888999')).toBeInTheDocument()
    expect(screen.getByText(/Pawn ticket · Part 1/i)).toBeInTheDocument()
    expect(screen.getAllByText('PW-2026-0001').length).toBeGreaterThan(0)
    expect(screen.getByText('Receipt RCP-PW-001')).toBeInTheDocument()
    expect(screen.getByText('Chann Borey')).toBeInTheDocument()
    expect(screen.getByText('1 x MacBook Pro M2 14-inch')).toBeInTheDocument()
    expect(screen.getByText('Silver, 512GB SSD')).toBeInTheDocument()
    expect(screen.getByText('IMEI: SERIAL-MBP-9922')).toBeInTheDocument()
    expect(screen.getByText('Customer signature / thumbprint')).toBeInTheDocument()
    expect(screen.getByText('Shop representative')).toBeInTheDocument()
    expect(screen.getByText(/If this pawn ticket is lost/i)).toBeInTheDocument()
  })

  it('renders a PAWN_CONTRACT in 80mm THERMAL format with shop logo when configured', () => {
    const pawnThermalWithLogo: ReceiptRecord = {
      _id: 'rec-pawn-logo',
      receiptNo: 'RCP-PW-LOGO',
      documentType: 'PAWN_CONTRACT',
      sourceType: 'PAWN',
      sourceId: 'pawn-logo',
      sourceSubId: 'contract',
      referenceNo: 'PW-2026-LOGO',
      partyName: 'Chann Borey',
      currency: 'USD',
      total: 330,
      issuedAt: '2026-09-10T08:00:00.000Z',
      printCount: 0,
      createdAt: '2026-09-10T08:00:00.000Z',
      snapshot: {
        schemaVersion: 1,
        documentType: 'PAWN_CONTRACT',
        title: 'Pawn Contract',
        shop: {
          name: 'PhoneFlow Pawn',
          phone: '023888999',
          address: 'Corner St. 271, Phnom Penh',
          logoUrl: 'https://example.com/shop-logo.png',
        },
        referenceNo: 'PW-2026-LOGO',
        issuedAt: '2026-09-10T08:00:00.000Z',
        startDate: '2026-09-10T08:00:00.000Z',
        dueDate: '2026-10-10T08:00:00.000Z',
        graceEndsAt: '2026-10-17T08:00:00.000Z',
        ticketPart: 1,
        feeModel: 'DAILY_SIMPLE',
        contractLengthDays: 30,
        principal: 300,
        dailyFeeRate: 0.33,
        dailyFeeAmount: 1,
        pawnFeeAtDue: 30,
        total: 330,
        party: {
          name: 'Chann Borey',
        },
        currency: 'USD',
        items: [
          {
            name: 'iPhone 15 Pro',
            quantity: 1,
            unitPrice: 300,
            total: 300,
          },
        ],
      },
    }

    render(<ReceiptDocument receipt={pawnThermalWithLogo} layout="THERMAL" />)

    const logo = screen.getByRole('img', { name: /PhoneFlow Pawn/i })
    expect(logo).toBeInTheDocument()
    expect(logo).toHaveAttribute('src', 'https://example.com/shop-logo.png')
    expect(logo).toHaveClass('pawn-ticket-logo')
  })

  it('renders an extension PAWN_CONTRACT (Part 2) in 80mm THERMAL format with extension period, previous due date, and new fee due date', () => {
    const pawnPart2Thermal: ReceiptRecord = {
      _id: 'rec-pawn-part2',
      receiptNo: 'RCP-PW-PART2',
      documentType: 'PAWN_CONTRACT',
      sourceType: 'PAWN',
      sourceId: 'pawn-1',
      sourceSubId: 'renewal:renewal-123',
      referenceNo: 'PW-2026-0001',
      partyName: 'Chann Borey',
      partyPhone: '012999888',
      currency: 'USD',
      total: 345,
      issuedAt: '2026-09-17T08:00:00.000Z',
      printCount: 0,
      createdAt: '2026-09-17T08:00:00.000Z',
      snapshot: {
        schemaVersion: 1,
        documentType: 'PAWN_CONTRACT',
        title: 'Pawn Contract - Part 2',
        shop: {
          name: 'PhoneFlow Pawn',
          phone: '023888999',
          address: 'Corner St. 271, Phnom Penh',
        },
        referenceNo: 'PW-2026-0001',
        issuedAt: '2026-09-17T08:00:00.000Z',
        startDate: '2026-09-10T08:00:00.000Z',
        previousDueDate: '2026-09-17T08:00:00.000Z',
        dueDate: '2026-09-24T08:00:00.000Z',
        graceEndsAt: '2026-09-29T08:00:00.000Z',
        ticketPart: 2,
        feeModel: 'DAILY_SIMPLE',
        termDays: 7,
        extensionTermDays: 7,
        contractLengthDays: 14,
        principal: 300,
        dailyFeeRate: 0.33,
        dailyFeeAmount: 1,
        pawnFeeAtDue: 7,
        total: 307,
        party: {
          name: 'Chann Borey',
          phone: '012999888',
        },
        currency: 'USD',
        items: [
          {
            name: 'MacBook Pro M2 14-inch',
            quantity: 1,
            unitPrice: 300,
            total: 300,
            imei: 'SERIAL-MBP-9922',
          },
        ],
      },
    }

    render(<ReceiptDocument receipt={pawnPart2Thermal} layout="THERMAL" />)

    expect(screen.getByText(/Pawn ticket · Part 2/i)).toBeInTheDocument()
    expect(screen.getByText('Extension period')).toBeInTheDocument()
    expect(screen.getByText('7 days added')).toBeInTheDocument()
    expect(screen.getByText('Previous due date')).toBeInTheDocument()
    expect(screen.getByText('New fee due date')).toBeInTheDocument()
  })

  it('renders PAWN_CONTRACT in A4 layout with agreement details and optional national ID status', () => {
    const pawnA4Receipt: ReceiptRecord = {
      _id: 'rec-pawn-a4',
      receiptNo: 'RCP-PW-A4-002',
      documentType: 'PAWN_CONTRACT',
      sourceType: 'PAWN',
      sourceId: 'pawn-2',
      sourceSubId: 'contract-2',
      referenceNo: 'PW-2026-0002',
      currency: 'USD',
      total: 500,
      issuedAt: '2026-09-10T08:00:00.000Z',
      printCount: 1,
      createdAt: '2026-09-10T08:00:00.000Z',
      snapshot: {
        schemaVersion: 1,
        documentType: 'PAWN_CONTRACT',
        title: 'Pawn Agreement',
        shop: { name: 'PhoneFlow Central' },
        referenceNo: 'PW-2026-0002',
        issuedAt: '2026-09-10T08:00:00.000Z',
        party: { name: '', role: 'Customer' }, // Empty name tests Walk-in customer fallback
        currency: 'USD',
        principal: 500,
        estimatedValue: 800,
        pawnPercentage: 62.5,
        feeModel: 'DAILY_SIMPLE',
        dailyFeeRate: 0.25,
        dailyFeeAmount: 1.25,
        contractLengthDays: 15,
        pawnFeeAtDue: 18.75,
        total: 518.75,
        ownershipConfirmed: true,
        identificationVerified: false,
        items: [
          {
            name: 'iPad Pro 11',
            quantity: 1,
            unitPrice: 500,
            total: 500,
            serialNumber: 'SN-IPAD-001',
            imei2: 'IMEI2-9988',
            accessories: ['charger', 'apple_pencil'],
          },
        ],
      },
    }

    render(<ReceiptDocument receipt={pawnA4Receipt} layout="A4" />)

    expect(screen.getAllByText('Walk-in customer').length).toBeGreaterThan(0)
    expect(screen.getByText('Agreement details')).toBeInTheDocument()
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
    expect(screen.getByText('Not provided (optional)')).toBeInTheDocument()
    expect(screen.getByText('Serial: SN-IPAD-001')).toBeInTheDocument()
    expect(screen.getByText('IMEI 2: IMEI2-9988')).toBeInTheDocument()
    expect(screen.getByText(/Included: Charger, Apple Pencil/i)).toBeInTheDocument()
  })

  it('renders PAWN_PAYMENT with payment allocations and balance', () => {
    const pawnPaymentReceipt: ReceiptRecord = {
      _id: 'rec-pawn-pay',
      receiptNo: 'RCP-PW-PAY-01',
      documentType: 'PAWN_PAYMENT',
      sourceType: 'PAWN',
      sourceId: 'pawn-1',
      sourceSubId: 'pay-1',
      referenceNo: 'PW-2026-0001',
      currency: 'USD',
      total: 50,
      issuedAt: '2026-09-12T10:00:00.000Z',
      printCount: 0,
      createdAt: '2026-09-12T10:00:00.000Z',
      snapshot: {
        schemaVersion: 1,
        documentType: 'PAWN_PAYMENT',
        title: 'Pawn Payment Receipt',
        shop: { name: 'PhoneFlow' },
        referenceNo: 'PW-2026-0001',
        issuedAt: '2026-09-12T10:00:00.000Z',
        party: { name: 'Sophea', role: 'Customer' },
        currency: 'USD',
        paymentType: 'INTEREST_FEE',
        allocation: {
          principal: 0,
          interest: 0,
          pawnFee: 40,
          fees: 10,
          additionalCollected: 5,
        },
        balance: 300,
        total: 50,
        dueDate: '2026-10-10T08:00:00.000Z',
        items: [{ name: 'Pawn Fee Payment', quantity: 1, unitPrice: 50, total: 50 }],
      },
    }

    render(<ReceiptDocument receipt={pawnPaymentReceipt} layout="A4" />)

    expect(screen.getByText('Payment details')).toBeInTheDocument()
    expect(screen.getByText('Interest Fee')).toBeInTheDocument()
    expect(screen.getByText('Daily pawn fee applied')).toBeInTheDocument()
    expect(screen.getByText('Additional amount collected')).toBeInTheDocument()
  })

  it('renders LOAN_AGREEMENT and LOAN_PAYMENT documents', () => {
    const loanAgreementReceipt: ReceiptRecord = {
      _id: 'rec-loan-agr',
      receiptNo: 'RCP-LN-AGR-01',
      documentType: 'LOAN_AGREEMENT',
      sourceType: 'LOAN',
      sourceId: 'loan-1',
      sourceSubId: 'agreement',
      referenceNo: 'LN-2026-0001',
      currency: 'USD',
      total: 1050,
      issuedAt: '2026-09-01T08:00:00.000Z',
      printCount: 0,
      createdAt: '2026-09-01T08:00:00.000Z',
      snapshot: {
        schemaVersion: 1,
        documentType: 'LOAN_AGREEMENT',
        title: 'Loan Agreement',
        shop: { name: 'PhoneFlow' },
        referenceNo: 'LN-2026-0001',
        issuedAt: '2026-09-01T08:00:00.000Z',
        party: { name: 'Vannak', role: 'Borrower' },
        currency: 'USD',
        principal: 1000,
        interestType: 'PERCENT',
        interestValue: 5,
        total: 1050,
        dueDate: '2026-10-01T08:00:00.000Z',
        status: 'ACTIVE',
        items: [{ name: 'Loan principal disbursement', quantity: 1, unitPrice: 1000, total: 1000 }],
      },
    }

    const { unmount } = render(<ReceiptDocument receipt={loanAgreementReceipt} layout="A4" />)
    expect(screen.getByText('Agreement details')).toBeInTheDocument()
    expect(screen.getByText('Borrower')).toBeInTheDocument()
    expect(screen.getByText('Percent')).toBeInTheDocument()
    expect(screen.getByText('5%')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    unmount()

    const loanPaymentReceipt: ReceiptRecord = {
      _id: 'rec-loan-pay',
      receiptNo: 'RCP-LN-PAY-01',
      documentType: 'LOAN_PAYMENT',
      sourceType: 'LOAN',
      sourceId: 'loan-1',
      sourceSubId: 'repay-1',
      referenceNo: 'LN-2026-0001',
      currency: 'USD',
      total: 500,
      issuedAt: '2026-09-15T08:00:00.000Z',
      printCount: 0,
      createdAt: '2026-09-15T08:00:00.000Z',
      snapshot: {
        schemaVersion: 1,
        documentType: 'LOAN_PAYMENT',
        title: 'Loan Repayment Receipt',
        shop: { name: 'PhoneFlow' },
        referenceNo: 'LN-2026-0001',
        issuedAt: '2026-09-15T08:00:00.000Z',
        party: { name: 'Vannak', role: 'Borrower' },
        currency: 'USD',
        paymentMethod: 'BANK_TRANSFER',
        contractTotal: 1050,
        amountPaid: 500,
        balance: 550,
        dueDate: '2026-10-01T08:00:00.000Z',
        status: 'ACTIVE',
        total: 500,
        items: [{ name: 'Repayment installment', quantity: 1, unitPrice: 500, total: 500 }],
      },
    }

    render(<ReceiptDocument receipt={loanPaymentReceipt} layout="A4" />)
    expect(screen.getByText('Payment details')).toBeInTheDocument()
    expect(screen.getAllByText('Bank Transfer').length).toBeGreaterThan(0)
    expect(screen.getByText('$1,050')).toBeInTheDocument()
    expect(screen.getAllByText('$550').length).toBeGreaterThan(0)
  })

  it('renders 80mm thermal LOAN_AGREEMENT with barcode and ticket layout', () => {
    const loanAgreementReceipt: ReceiptRecord = {
      _id: 'rec-loan-thermal',
      receiptNo: 'RCP-LN-TH-01',
      documentType: 'LOAN_AGREEMENT',
      sourceType: 'LOAN',
      sourceId: 'loan-1',
      sourceSubId: 'agreement',
      referenceNo: 'LN-20260917-SPP3M0',
      currency: 'USD',
      total: 200,
      issuedAt: '2026-09-17T08:00:00.000Z',
      printCount: 0,
      createdAt: '2026-09-17T08:00:00.000Z',
      snapshot: {
        schemaVersion: 1,
        documentType: 'LOAN_AGREEMENT',
        title: 'Loan Agreement',
        shop: { name: 'PhoneFlow Shop', phone: '012345678' },
        referenceNo: 'LN-20260917-SPP3M0',
        issuedAt: '2026-09-17T08:00:00.000Z',
        party: { name: 'tra', role: 'Borrower' },
        currency: 'USD',
        principal: 200,
        interestType: 'NONE',
        total: 200,
        balance: 200,
        dueDate: '2026-10-23T08:00:00.000Z',
        status: 'ACTIVE',
        items: [{ name: 'Money loan', quantity: 1, unitPrice: 200, total: 200 }],
      },
    }

    render(<ReceiptDocument receipt={loanAgreementReceipt} layout="THERMAL" />)
    expect(screen.getByText('Loan Agreement')).toBeInTheDocument()
    expect(screen.getAllByText('LN-20260917-SPP3M0').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByLabelText(/Barcode for loan agreement LN-20260917-SPP3M0/i)).toBeInTheDocument()
    expect(screen.getByText('tra')).toBeInTheDocument()
    expect(screen.getByText(/Keep this official 80mm loan receipt/i)).toBeInTheDocument()
    expect(screen.getByText('Borrower signature / thumbprint')).toBeInTheDocument()
  })

  it('renders 80mm thermal LOAN_PAYMENT with barcode and ticket layout', () => {
    const loanPaymentReceipt: ReceiptRecord = {
      _id: 'rec-loan-pay-th',
      receiptNo: 'RCP-LN-TH-PAY-01',
      documentType: 'LOAN_PAYMENT',
      sourceType: 'LOAN',
      sourceId: 'loan-1',
      sourceSubId: 'pay-1',
      referenceNo: 'LN-20260917-SPP3M0',
      currency: 'USD',
      total: 100,
      issuedAt: '2026-09-18T08:00:00.000Z',
      printCount: 0,
      createdAt: '2026-09-18T08:00:00.000Z',
      snapshot: {
        schemaVersion: 1,
        documentType: 'LOAN_PAYMENT',
        title: 'Loan Repayment Receipt',
        shop: { name: 'PhoneFlow Shop', phone: '012345678' },
        referenceNo: 'LN-20260917-SPP3M0',
        paymentReference: 'LP-001',
        issuedAt: '2026-09-18T08:00:00.000Z',
        party: { name: 'tra', role: 'Borrower' },
        currency: 'USD',
        paymentMethod: 'CASH',
        contractPrincipal: 200,
        contractTotal: 200,
        amountPaid: 100,
        balance: 100,
        dueDate: '2026-10-23T08:00:00.000Z',
        status: 'ACTIVE',
        total: 100,
        items: [{ name: 'Loan repayment', quantity: 1, unitPrice: 100, total: 100 }],
      },
    }

    render(<ReceiptDocument receipt={loanPaymentReceipt} layout="THERMAL" />)
    expect(screen.getByText('Loan Repayment Receipt')).toBeInTheDocument()
    expect(screen.getAllByText('LN-20260917-SPP3M0').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByLabelText(/Barcode for loan repayment LN-20260917-SPP3M0/i)).toBeInTheDocument()
    expect(screen.getByText('Cash')).toBeInTheDocument()
    expect(screen.getByText('Paid on')).toBeInTheDocument()
    expect(screen.queryByText('Loan date')).not.toBeInTheDocument()
    expect(screen.getByText('Total agreement').closest('.receipt-row')).toHaveTextContent('$200')
    expect(screen.getByText('Amount paid').closest('.receipt-row')).toHaveTextContent('$100')
    expect(screen.getAllByText('$100').length).toBeGreaterThan(0)
  })
})
