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
})
