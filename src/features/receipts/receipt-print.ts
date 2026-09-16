import { receiptPrintStyles } from './ReceiptDocument'
import type { ReceiptLayout, ReceiptRecord } from './receipt-types'

export type PrintReceiptOptions = {
  markup: string
  layout: ReceiptLayout
  title?: string
  thermalHeightMm?: number
}

/**
 * Opens a browser print window for the provided receipt markup.
 * Returns true if the popup was opened and printing scheduled after load,
 * or false if the browser blocked the popup.
 */
export function printReceiptWindow({
  markup,
  layout,
  title = 'PhoneFlow Receipt',
  thermalHeightMm,
}: PrintReceiptOptions): boolean {
  if (!markup) return false

  let popup: Window | null = null
  try {
    popup = window.open('', '_blank', 'width=980,height=760')
  } catch {
    popup = null
  }

  if (!popup) {
    return false
  }

  const height = thermalHeightMm || 110
  const page = layout === 'THERMAL'
    ? `@page{size:80mm ${height}mm;margin:0}`
    : '@page{size:A4;margin:0}'

  popup.document.open()
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${page}\n${receiptPrintStyles}</style></head><body>${markup}<script>window.onload=()=>{try{window.print()}catch(e){}}</script></body></html>`)
  popup.document.close()
  popup.focus()

  return true
}

/**
 * Sample fake receipt used purely for test printing in browser print dialogs.
 * Visibly marked "TEST RECEIPT — NOT A TRANSACTION" across all document fields.
 * Never persists to database or increments any receipt print count.
 */
export const SAMPLE_TEST_RECEIPT: ReceiptRecord = {
  _id: 'test-receipt-sample',
  receiptNo: 'TEST-RECEIPT-0000',
  documentType: 'SALE_RECEIPT',
  sourceType: 'TRADE',
  sourceId: 'test-source',
  sourceSubId: 'test-sub',
  referenceNo: 'TEST-RECEIPT-0000',
  partyName: 'Sample Customer',
  partyPhone: '000-000-0000',
  currency: 'USD',
  total: 0,
  issuedAt: '2026-01-01T00:00:00.000Z',
  printCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  snapshot: {
    schemaVersion: 1,
    documentType: 'SALE_RECEIPT',
    title: 'TEST RECEIPT — NOT A TRANSACTION',
    shop: {
      name: 'PhoneFlow Test Store',
      subtitle: 'TEST RECEIPT — NOT A TRANSACTION',
      phone: '012 345 678',
      address: 'Sample Street, Phnom Penh',
      footer: 'TEST RECEIPT — NOT A TRANSACTION',
    },
    referenceNo: 'TEST-RECEIPT-0000',
    issuedAt: '2026-01-01T00:00:00.000Z',
    party: {
      name: 'Test Customer (Sample)',
      phone: '000-000-0000',
      role: 'Customer',
    },
    currency: 'USD',
    items: [
      {
        name: 'Test Item / Sample Device',
        sku: 'TEST-SAMPLE-01',
        quantity: 1,
        unitPrice: 0,
        total: 0,
        description: 'TEST RECEIPT — NOT A TRANSACTION',
      },
    ],
    subtotal: 0,
    total: 0,
    amountPaid: 0,
    paymentMethod: 'TEST_MODE',
    paymentStatus: 'PAID',
    transactionStatus: 'COMPLETED',
    notes: 'TEST RECEIPT — NOT A TRANSACTION. Browser printer verification only.',
  },
}
