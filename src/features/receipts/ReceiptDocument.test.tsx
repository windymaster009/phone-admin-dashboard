import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ReceiptDocument from './ReceiptDocument'
import { SAMPLE_TEST_RECEIPT } from './receipt-print'
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

describe('ReceiptDocument bilingual component', () => {
  it('renders a SALE_RECEIPT with bilingual titles, columns, totals, status, and barcode', () => {
    render(<ReceiptDocument receipt={mockSaleReceipt} layout="A4" />)

    // Bilingual document title
    expect(screen.getByText('Sales Receipt / Invoice / បង្កាន់ដៃលក់ / វិក្កយបត្រ')).toBeInTheDocument()
    expect(screen.getAllByText('SR-2026-9999').length).toBeGreaterThan(0)
    expect(screen.getAllByText('SL-2026-9999').length).toBeGreaterThan(0)
    expect(screen.getByText('PhoneFlow Flagship')).toBeInTheDocument()
    expect(screen.getByText('Customer Sokha')).toBeInTheDocument()

    // Bilingual metadata labels
    expect(screen.getByText('Receipt / បង្កាន់ដៃ')).toBeInTheDocument()
    expect(screen.getByText('Reference / លេខយោង')).toBeInTheDocument()
    expect(screen.getByText('Issued / កាលបរិច្ឆេទចេញ')).toBeInTheDocument()
    expect(screen.getByText('Currency / រូបិយប័ណ្ណ')).toBeInTheDocument()

    // Bilingual party role & National ID
    expect(screen.getByText('Customer / អតិថិជន')).toBeInTheDocument()
    expect(screen.getByText(/National ID \/ លេខអត្តសញ្ញាណប័ណ្ណ: ID-099281/i)).toBeInTheDocument()

    // Item details & bilingual table header
    expect(screen.getByText('iPhone 15 Pro 128GB')).toBeInTheDocument()
    expect(screen.getByText('SKU: IPH-15P-128')).toBeInTheDocument()
    expect(screen.getByText('IMEI: 356987123456789')).toBeInTheDocument()
    expect(screen.getByText('Description / បរិយាយ')).toBeInTheDocument()
    expect(screen.getByText('Qty / បរិមាណ')).toBeInTheDocument()
    expect(screen.getByText('Unit / តម្លៃឯកតា')).toBeInTheDocument()
    expect(screen.getAllByText('Total / សរុប').length).toBeGreaterThan(0)

    // Bilingual financial totals
    expect(screen.getByText('Subtotal / សរុបរង')).toBeInTheDocument()
    expect(screen.getByText('Discount / បញ្ចុះតម្លៃ')).toBeInTheDocument()
    expect(screen.getAllByText('$950').length).toBeGreaterThan(0)
    expect(screen.getByText('-$50')).toBeInTheDocument()
    expect(screen.getAllByText('$900').length).toBeGreaterThan(0)
    expect(screen.getByText('Amount received / ចំនួនប្រាក់បានទទួល')).toBeInTheDocument()
    expect(screen.getByText('$1,000')).toBeInTheDocument()
    expect(screen.getByText('Change / ប្រាក់អាប់')).toBeInTheDocument()
    expect(screen.getByText('$100')).toBeInTheDocument()

    // Bilingual payment & status
    expect(screen.getByText('Payment & status / ការទូទាត់ និងស្ថានភាព')).toBeInTheDocument()
    expect(screen.getByText('Payment method / វិធីទូទាត់')).toBeInTheDocument()
    expect(screen.getByText('Cash / សាច់ប្រាក់')).toBeInTheDocument()
    expect(screen.getByText('Payment status / ស្ថានភាពការទូទាត់')).toBeInTheDocument()
    expect(screen.getByText('Paid / បានបង់')).toBeInTheDocument()
    expect(screen.getByText('Transaction status / ស្ថានភាពប្រតិបត្តិការ')).toBeInTheDocument()
    expect(screen.getByText('Completed / បានបញ្ចប់')).toBeInTheDocument()

    // Sale receipt barcode present, no signatures
    expect(screen.getByLabelText(/Barcode for sale refund SL-2026-9999/i)).toBeInTheDocument()
    expect(screen.queryByText(/Customer acknowledgement/i)).not.toBeInTheDocument()
  })

  it('renders a REFUND_RECEIPT with bilingual titles, returned items, totals, notes, and dual signatures', () => {
    render(<ReceiptDocument receipt={mockRefundReceipt} layout="A4" />)

    expect(screen.getAllByText('RR-2026-8888').length).toBeGreaterThan(0)
    expect(screen.getByText('Refund Receipt / បង្កាន់ដៃសងប្រាក់')).toBeInTheDocument()
    expect(screen.getByText('Returned items / ទំនិញបានប្រគល់ត្រឡប់')).toBeInTheDocument()
    expect(screen.getByText('Samsung Galaxy A55')).toBeInTheDocument()

    // Totals section
    expect(screen.getByText('Refund total / ប្រាក់សងសរុប')).toBeInTheDocument()
    expect(screen.getByText('Refunded / ប្រាក់បានសង')).toBeInTheDocument()
    expect(screen.getByText('Remaining due / ប្រាក់នៅសល់ត្រូវបង់')).toBeInTheDocument()

    // Bilingual generated notes
    expect(screen.getByText(/Refund reason \/ មូលហេតុសងប្រាក់: Customer reported dead pixels/i)).toBeInTheDocument()
    expect(screen.getByText(/Returned items were restored to available stock\. \/ ទំនិញបានប្រគល់ត្រឡប់ត្រូវបានដាក់ចូលស្តុកវិញ។/i)).toBeInTheDocument()

    // Dual bilingual signatures
    expect(screen.getByText('Customer acknowledgement / ការទទួលស្គាល់របស់អតិថិជន')).toBeInTheDocument()
    expect(screen.getByText('Shop representative / តំណាងហាង')).toBeInTheDocument()
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

  it('displays bilingual fallback message when receipt snapshot is missing', () => {
    const brokenReceipt: ReceiptRecord = {
      ...mockSaleReceipt,
      snapshot: undefined as any,
    }

    render(<ReceiptDocument receipt={brokenReceipt} layout="A4" />)
    expect(screen.getByText(/Receipt snapshot is unavailable\. \/ មិនមានទិន្នន័យបង្កាន់ដៃទេ។/i)).toBeInTheDocument()
  })

  it('renders a PAWN_CONTRACT in 80mm THERMAL format with bilingual labels and preserved English legal warning', () => {
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

    expect(screen.getByText('Pawn Shop / ហាងបញ្ចាំ PhoneFlow Pawn')).toBeInTheDocument()
    expect(screen.getByText('Tel / ទូរស័ព្ទ: 023888999')).toBeInTheDocument()
    expect(screen.getByText('Pawn ticket · Part 1 / បង្កាន់ដៃបញ្ចាំ · ផ្នែកទី ១')).toBeInTheDocument()
    expect(screen.getAllByText('PW-2026-0001').length).toBeGreaterThan(0)
    expect(screen.getByText('Receipt / បង្កាន់ដៃ RCP-PW-001')).toBeInTheDocument()
    expect(screen.getByText('Chann Borey')).toBeInTheDocument()

    // Bilingual pawn field labels
    expect(screen.getByText('Customer / អតិថិជន')).toBeInTheDocument()
    expect(screen.getByText('Number of items / ចំនួនទំនិញ')).toBeInTheDocument()
    expect(screen.getByText('Loan amount / ចំនួនប្រាក់កម្ចី')).toBeInTheDocument()
    expect(screen.getByText('Pawn fee at due date / កម្រៃបញ្ចាំនៅថ្ងៃកំណត់បង់')).toBeInTheDocument()
    expect(screen.getByText('Daily pawn fee rate / អត្រាកម្រៃបញ្ចាំប្រចាំថ្ងៃ')).toBeInTheDocument()
    expect(screen.getByText('Contract length / រយៈពេលកិច្ចសន្យា')).toBeInTheDocument()
    expect(screen.getByText('30 days / ថ្ងៃ')).toBeInTheDocument()
    expect(screen.getByText('Pawned / deposited on / កាលបរិច្ឆេទដាក់បញ្ចាំ')).toBeInTheDocument()
    expect(screen.getByText('Date to pay pawn fee / ថ្ងៃកំណត់បង់កម្រៃបញ្ចាំ')).toBeInTheDocument()
    expect(screen.getByText('Grace period ends / ថ្ងៃផុតរយៈពេលអនុគ្រោះ')).toBeInTheDocument()

    // Items & signatures
    expect(screen.getByText('Pawned item / វត្ថុបញ្ចាំ')).toBeInTheDocument()
    expect(screen.getByText('1 x MacBook Pro M2 14-inch')).toBeInTheDocument()
    expect(screen.getByText('Customer signature / thumbprint / ហត្ថលេខា ឬ ស្នាមមេដៃអតិថិជន')).toBeInTheDocument()
    expect(screen.getByText('Shop representative / តំណាងហាង')).toBeInTheDocument()

    // Preserved exact English customer-facing warnings
    expect(screen.getByText(/Pay, redeem, or extend by the fee due date\. Claim review begins only after the grace period ends\./i)).toBeInTheDocument()
    expect(screen.getByText(/If this pawn ticket is lost, the item cannot be collected or redeemed\./i)).toBeInTheDocument()
    expect(screen.getByText(/Important \/ សំខាន់:/i)).toBeInTheDocument()
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
      total: 307,
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

    expect(screen.getByText('Pawn ticket · Part 2 / បង្កាន់ដៃបញ្ចាំ · ផ្នែកទី ២')).toBeInTheDocument()
    expect(screen.getByText('Extension period / រយៈពេលបន្តកិច្ចសន្យា')).toBeInTheDocument()
    expect(screen.getByText('7 days added / ថ្ងៃបន្ថែម')).toBeInTheDocument()
    expect(screen.getByText('Previous due date / ថ្ងៃកំណត់បង់មុន')).toBeInTheDocument()
    expect(screen.getByText('New fee due date / ថ្ងៃកំណត់បង់កម្រៃថ្មី')).toBeInTheDocument()
  })

  it('renders a legacy monthly-interest PAWN_CONTRACT with Interest and Date to pay interest', () => {
    const legacyMonthlyPawn: ReceiptRecord = {
      _id: 'rec-pawn-monthly',
      receiptNo: 'RCP-PW-MONTHLY',
      documentType: 'PAWN_CONTRACT',
      sourceType: 'PAWN',
      sourceId: 'pawn-old-1',
      sourceSubId: 'contract',
      referenceNo: 'PW-2025-0099',
      partyName: 'Sok Vichea',
      currency: 'USD',
      total: 500,
      issuedAt: '2025-05-01T08:00:00.000Z',
      printCount: 1,
      createdAt: '2025-05-01T08:00:00.000Z',
      snapshot: {
        schemaVersion: 1,
        documentType: 'PAWN_CONTRACT',
        title: 'Pawn Contract - Part 1',
        shop: { name: 'PhoneFlow Central' },
        referenceNo: 'PW-2025-0099',
        issuedAt: '2025-05-01T08:00:00.000Z',
        startDate: '2025-05-01T08:00:00.000Z',
        dueDate: '2025-06-01T08:00:00.000Z',
        graceEndsAt: '2025-06-08T08:00:00.000Z',
        ticketPart: 1,
        feeModel: 'LEGACY_MONTHLY',
        interestRate: 3,
        principal: 500,
        estimatedValue: 800,
        pawnPercentage: 62.5,
        total: 500,
        ownershipConfirmed: true,
        identificationVerified: true,
        party: { name: 'Sok Vichea', role: 'Customer' },
        currency: 'USD',
        items: [{ name: 'iPad Air 5', quantity: 1, unitPrice: 500, total: 500 }],
      },
    }

    render(<ReceiptDocument receipt={legacyMonthlyPawn} layout="A4" />)

    expect(screen.getByText('Pawn Contract - Part 1 / កិច្ចសន្យាបញ្ចាំ - ផ្នែកទី ១')).toBeInTheDocument()
    expect(screen.getByText('Agreement details / ព័ត៌មានលម្អិតកិច្ចសន្យា')).toBeInTheDocument()
    expect(screen.getByText('Interest / ការប្រាក់')).toBeInTheDocument()
    expect(screen.getByText('3% per month / ក្នុងមួយខែ')).toBeInTheDocument()
    expect(screen.getByText('Date to pay interest / ថ្ងៃកំណត់បង់ការប្រាក់')).toBeInTheDocument()
    expect(screen.getByText('Ownership / កម្មសិទ្ធិ')).toBeInTheDocument()
    expect(screen.getByText('Confirmed / បានបញ្ជាក់')).toBeInTheDocument()
    expect(screen.getByText('National ID / លេខអត្តសញ្ញាណប័ណ្ណ')).toBeInTheDocument()
    expect(screen.getByText('Verified / បានផ្ទៀងផ្ទាត់')).toBeInTheDocument()
  })

  it('renders PURCHASE_RECEIPT with fallback to Walk-in seller when party name is blank', () => {
    const purchaseReceipt: ReceiptRecord = {
      _id: 'rec-pur-blank',
      receiptNo: 'RCP-PUR-01',
      documentType: 'PURCHASE_RECEIPT',
      sourceType: 'TRADE',
      sourceId: 'trade-buy-1',
      sourceSubId: 'trade',
      referenceNo: 'BY-2026-0001',
      partyName: '',
      currency: 'USD',
      total: 240,
      printCount: 0,
      issuedAt: '2026-09-18T05:00:00.000Z',
      createdAt: '2026-09-18T05:00:00.000Z',
      snapshot: {
        schemaVersion: 1,
        documentType: 'PURCHASE_RECEIPT',
        title: 'Purchase Receipt',
        shop: { name: 'PhoneFlow Central' },
        referenceNo: 'BY-2026-0001',
        issuedAt: '2026-09-18T05:00:00.000Z',
        party: { name: '', role: 'Seller' },
        currency: 'USD',
        subtotal: 240,
        discount: 0,
        total: 240,
        amountPaid: 240,
        balance: 0,
        paymentStatus: 'PAID',
        transactionStatus: 'COMPLETED',
        signatureLabels: ['Seller signature', 'Shop representative'],
        items: [
          {
            name: 'iPhone 15 256GB',
            quantity: 1,
            unitPrice: 240,
            total: 240,
          },
        ],
      },
    }

    render(<ReceiptDocument receipt={purchaseReceipt} layout="A4" />)

    expect(screen.getByText('Purchase Receipt / បង្កាន់ដៃទិញ')).toBeInTheDocument()
    expect(screen.getByText('Walk-in seller / អ្នកលក់ទូទៅ')).toBeInTheDocument()
    expect(screen.getByText('Seller / អ្នកលក់')).toBeInTheDocument()
    expect(screen.getByText('Seller signature / ហត្ថលេខាអ្នកលក់')).toBeInTheDocument()
    expect(screen.getByText('Shop representative / តំណាងហាង')).toBeInTheDocument()
  })

  it('renders PAWN_PAYMENT and PAWN_REDEMPTION with payment allocations and signatures', () => {
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
        signatureLabels: ['Customer signature', 'Cashier signature'],
      },
    }

    const { unmount } = render(<ReceiptDocument receipt={pawnPaymentReceipt} layout="A4" />)

    expect(screen.getByText('Pawn Payment Receipt / បង្កាន់ដៃបង់ប្រាក់បញ្ចាំ')).toBeInTheDocument()
    expect(screen.getByText('Payment details / ព័ត៌មានលម្អិតការទូទាត់')).toBeInTheDocument()
    expect(screen.getByText('Payment type / ប្រភេទការទូទាត់')).toBeInTheDocument()
    expect(screen.getByText('Interest Fee / កម្រៃការប្រាក់')).toBeInTheDocument()
    expect(screen.getByText('Daily pawn fee applied / កម្រៃបញ្ចាំប្រចាំថ្ងៃបានទូទាត់')).toBeInTheDocument()
    expect(screen.getByText('Fees applied / កម្រៃបានទូទាត់')).toBeInTheDocument()
    expect(screen.getByText('Additional amount collected / ចំនួនប្រាក់បន្ថែមបានប្រមូល')).toBeInTheDocument()
    expect(screen.getByText('Remaining balance / ប្រាក់នៅសល់')).toBeInTheDocument()
    expect(screen.getByText('Contract due date / ថ្ងៃកំណត់តាមកិច្ចសន្យា')).toBeInTheDocument()
    expect(screen.getByText('Customer signature / ហត្ថលេខាអតិថិជន')).toBeInTheDocument()
    expect(screen.getByText('Cashier signature / ហត្ថលេខាអ្នកទទួលប្រាក់')).toBeInTheDocument()
    unmount()

    // Pawn Redemption
    const pawnRedemptionReceipt: ReceiptRecord = {
      ...pawnPaymentReceipt,
      documentType: 'PAWN_REDEMPTION',
      snapshot: {
        ...pawnPaymentReceipt.snapshot!,
        documentType: 'PAWN_REDEMPTION',
        title: 'Pawn Redemption Receipt',
        paymentType: 'REDEMPTION',
        signatureLabels: ['Customer confirms collateral received', 'Cashier signature'],
      },
    }

    render(<ReceiptDocument receipt={pawnRedemptionReceipt} layout="A4" />)
    expect(screen.getByText('Pawn Redemption Receipt / បង្កាន់ដៃលោះវត្ថុបញ្ចាំ')).toBeInTheDocument()
    expect(screen.getByText('Redemption / លោះវត្ថុបញ្ចាំ')).toBeInTheDocument()
    expect(screen.getByText('Customer confirms collateral received / អតិថិជនបញ្ជាក់ថាបានទទួលវត្ថុបញ្ចាំត្រឡប់')).toBeInTheDocument()
  })

  it('renders LOAN_AGREEMENT and LOAN_PAYMENT documents with bilingual labels', () => {
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
        signatureLabels: ['Borrower signature / thumbprint', 'Lender signature'],
        items: [{ name: 'Loan principal disbursement', quantity: 1, unitPrice: 1000, total: 1000 }],
      },
    }

    const { unmount } = render(<ReceiptDocument receipt={loanAgreementReceipt} layout="A4" />)
    expect(screen.getByText('Loan Agreement / កិច្ចសន្យាប្រាក់កម្ចី')).toBeInTheDocument()
    expect(screen.getByText('Agreement details / ព័ត៌មានលម្អិតកិច្ចសន្យា')).toBeInTheDocument()
    expect(screen.getByText('Borrower / អ្នកខ្ចី')).toBeInTheDocument()
    expect(screen.getByText('Interest type / ប្រភេទការប្រាក់')).toBeInTheDocument()
    expect(screen.getByText('Percent / ភាគរយ')).toBeInTheDocument()
    expect(screen.getByText('5%')).toBeInTheDocument()
    expect(screen.getByText('Active / សកម្ម')).toBeInTheDocument()
    expect(screen.getByText('Borrower signature / thumbprint / ហត្ថលេខា ឬ ស្នាមមេដៃអ្នកខ្ចី')).toBeInTheDocument()
    expect(screen.getByText('Lender signature / ហត្ថលេខាអ្នកឱ្យខ្ចី')).toBeInTheDocument()
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
        signatureLabels: ['Borrower signature', 'Cashier signature'],
        items: [{ name: 'Repayment installment', quantity: 1, unitPrice: 500, total: 500 }],
      },
    }

    render(<ReceiptDocument receipt={loanPaymentReceipt} layout="A4" />)
    expect(screen.getByText('Loan Repayment Receipt / បង្កាន់ដៃសងប្រាក់កម្ចី')).toBeInTheDocument()
    expect(screen.getByText('Payment details / ព័ត៌មានលម្អិតការទូទាត់')).toBeInTheDocument()
    expect(screen.getAllByText('Bank Transfer / ផ្ទេរតាមធនាគារ').length).toBeGreaterThan(0)
    expect(screen.getByText('$1,050')).toBeInTheDocument()
    expect(screen.getAllByText('$550').length).toBeGreaterThan(0)
    expect(screen.getByText('Borrower signature / ហត្ថលេខាអ្នកខ្ចី')).toBeInTheDocument()
    expect(screen.getByText('Cashier signature / ហត្ថលេខាអ្នកទទួលប្រាក់')).toBeInTheDocument()
  })

  it('renders SERVICE_RECEIPT with bilingual titles, items / purpose, and dual signatures', () => {
    const serviceReceipt: ReceiptRecord = {
      _id: 'rec-svc-01',
      receiptNo: 'SC-2026-0001',
      documentType: 'SERVICE_RECEIPT',
      sourceType: 'SERVICE',
      sourceId: 'svc-1',
      sourceSubId: 'service',
      referenceNo: 'SRV-2026-001',
      partyName: 'Customer Nita',
      currency: 'USD',
      total: 35,
      issuedAt: '2026-09-18T10:00:00.000Z',
      printCount: 0,
      createdAt: '2026-09-18T10:00:00.000Z',
      snapshot: {
        schemaVersion: 1,
        documentType: 'SERVICE_RECEIPT',
        title: 'Service Receipt',
        shop: { name: 'PhoneFlow Flagship' },
        referenceNo: 'SRV-2026-001',
        issuedAt: '2026-09-18T10:00:00.000Z',
        party: { name: 'Customer Nita', role: 'Customer' },
        currency: 'USD',
        subtotal: 35,
        total: 35,
        amountPaid: 35,
        balance: 0,
        paymentStatus: 'PAID',
        transactionStatus: 'COMPLETED',
        signatureLabels: ['Customer acknowledgement', 'Shop representative'],
        items: [{ name: 'Screen protector installation', quantity: 1, unitPrice: 35, total: 35 }],
      },
    }

    render(<ReceiptDocument receipt={serviceReceipt} layout="A4" />)
    expect(screen.getByText('Service Receipt / បង្កាន់ដៃសេវាកម្ម')).toBeInTheDocument()
    expect(screen.getByText('Items / purpose / ទំនិញ / គោលបំណង')).toBeInTheDocument()
    expect(screen.getByText('Customer acknowledgement / ការទទួលស្គាល់របស់អតិថិជន')).toBeInTheDocument()
    expect(screen.getByText('Shop representative / តំណាងហាង')).toBeInTheDocument()
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
    expect(screen.getByText('Loan Agreement / កិច្ចសន្យាប្រាក់កម្ចី')).toBeInTheDocument()
    expect(screen.getAllByText('LN-20260917-SPP3M0').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByLabelText(/Barcode for loan agreement LN-20260917-SPP3M0/i)).toBeInTheDocument()
    expect(screen.getByText('tra')).toBeInTheDocument()
    expect(screen.getByText('Borrower / អ្នកខ្ចី')).toBeInTheDocument()
    expect(screen.getByText(/Notice \/ សេចក្តីជូនដំណឹង:/i)).toBeInTheDocument()
    expect(screen.getByText(/Keep this official 80mm loan receipt/i)).toBeInTheDocument()
    expect(screen.getByText('Borrower signature / thumbprint / ហត្ថលេខា ឬ ស្នាមមេដៃអ្នកខ្ចី')).toBeInTheDocument()
    expect(screen.getByText('Authorized lender / អ្នកឱ្យខ្ចីមានសិទ្ធិ')).toBeInTheDocument()
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
    expect(screen.getByText('Loan Repayment Receipt / បង្កាន់ដៃសងប្រាក់កម្ចី')).toBeInTheDocument()
    expect(screen.getAllByText('LN-20260917-SPP3M0').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByLabelText(/Barcode for loan repayment LN-20260917-SPP3M0/i)).toBeInTheDocument()
    expect(screen.getByText('Cash / សាច់ប្រាក់')).toBeInTheDocument()
    expect(screen.getByText('Paid on / កាលបរិច្ឆេទបានបង់')).toBeInTheDocument()
    expect(screen.queryByText(/Loan date/i)).not.toBeInTheDocument()
    expect(screen.getByText('Total agreement / ប្រាក់សរុបតាមកិច្ចសន្យា').closest('.receipt-row')).toHaveTextContent('$200')
    expect(screen.getByText('Amount paid / ចំនួនប្រាក់បានបង់').closest('.receipt-row')).toHaveTextContent('$100')
    expect(screen.getAllByText('$100').length).toBeGreaterThan(0)
  })

  it('renders historical receipt snapshot with English-only strings without mutating the snapshot object', () => {
    const historicalSnapshot = {
      schemaVersion: 1,
      documentType: 'SALE_RECEIPT' as const,
      title: 'Sales Receipt / Invoice',
      shop: { name: 'Historical Store' },
      referenceNo: 'HIST-001',
      issuedAt: '2025-01-01T00:00:00.000Z',
      party: { name: 'Historical Customer', role: 'Customer' },
      currency: 'USD' as const,
      subtotal: 100,
      total: 100,
      amountPaid: 100,
      balance: 0,
      paymentMethod: 'CASH',
      paymentStatus: 'PAID',
      transactionStatus: 'COMPLETED',
      items: [{ name: 'Historical Phone', quantity: 1, unitPrice: 100, total: 100 }],
    }
    const frozenSnapshot = Object.freeze({ ...historicalSnapshot })
    const receipt: ReceiptRecord = {
      _id: 'rec-hist',
      receiptNo: 'HIST-REC-001',
      documentType: 'SALE_RECEIPT',
      sourceType: 'TRADE',
      sourceId: 'trade-hist',
      sourceSubId: 'trade',
      referenceNo: 'HIST-001',
      currency: 'USD',
      total: 100,
      issuedAt: '2025-01-01T00:00:00.000Z',
      printCount: 5,
      createdAt: '2025-01-01T00:00:00.000Z',
      snapshot: frozenSnapshot as any,
    }

    // Must render without throwing (verifying object was not mutated)
    render(<ReceiptDocument receipt={receipt} layout="A4" />)
    expect(screen.getByText('Sales Receipt / Invoice / បង្កាន់ដៃលក់ / វិក្កយបត្រ')).toBeInTheDocument()
    expect(screen.getByText('Historical Phone')).toBeInTheDocument()
    expect(frozenSnapshot.title).toBe('Sales Receipt / Invoice') // Stored snapshot unchanged
  })

  it('renders SAMPLE_TEST_RECEIPT with prominent test receipt markings', () => {
    render(<ReceiptDocument receipt={SAMPLE_TEST_RECEIPT} layout="THERMAL" />)
    expect(screen.getByText(/TEST RECEIPT — NOT A TRANSACTION \/ បង្កាន់ដៃសាកល្បង — មិនមែនជាប្រតិបត្តិការ/i)).toBeInTheDocument()
    expect(screen.getByText('Test Mode / របៀបសាកល្បង')).toBeInTheDocument()
    expect(screen.getByText('Paid / បានបង់')).toBeInTheDocument()
  })
})
