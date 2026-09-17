import { receiptPrintStyles } from './ReceiptDocument'
import type { ReceiptLayout, ReceiptRecord } from './receipt-types'

export type PrintReceiptOptions = {
  markup: string
  layout: ReceiptLayout
  title?: string
}

export function writeReceiptPrintDocument(doc: Document, { markup, layout, title = 'PhoneFlow Receipt' }: PrintReceiptOptions) {
  // Measure only this isolated document, never the responsive or hidden preview.
  const page = layout === 'A4' ? '@page{size:A4;margin:0}' : '@page{margin:0}'
  doc.open()
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>${receiptPrintStyles}</style><style id="receipt-page-size">${page}</style></head><body>${markup}</body></html>`)
  doc.close()
  doc.title = title
}

export async function fitReceiptPrintPage(doc: Document, layout: ReceiptLayout, signal?: AbortSignal) {
  // Fonts and logos can change the receipt height. Bound the wait for offline logos.
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort = () => {}
  try {
    await Promise.race([
      Promise.all([
        doc.fonts?.ready,
        ...Array.from(doc.images).map((image) => image.decode?.().catch(() => {})),
      ]),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, 2000) }),
      new Promise<void>((resolve) => {
        abort = resolve
        if (signal?.aborted) resolve()
        else signal?.addEventListener('abort', abort, { once: true })
      }),
    ])
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
  if (signal?.aborted) return
  if (layout === 'A4') return
  const paper = doc.querySelector<HTMLElement>('.receipt-paper-thermal')
  const pageStyle = doc.getElementById('receipt-page-size')
  if (!paper || !pageStyle) throw new Error('Receipt print layout is unavailable.')
  const heightPx = Math.max(paper.getBoundingClientRect().height, paper.scrollHeight)
  if (!Number.isFinite(heightPx) || heightPx <= 0) throw new Error('Unable to measure receipt paper. Please try again.')
  // 2 mm rounding/feed allowance; no fixed minimum or clipping of long receipts.
  const heightMm = Math.ceil(heightPx * 25.4 / 96) + 2
  pageStyle.textContent = `@page{size:80mm ${heightMm}mm;margin:0}`
}

/**
 * Opens a browser print window for the provided receipt markup.
 * Returns true after requesting the browser print dialog (not proof of printing),
 * or false if the browser blocked the popup.
 */
export async function printReceiptWindow(options: PrintReceiptOptions, signal?: AbortSignal): Promise<boolean> {
  const { markup, layout } = options
  if (!markup || signal?.aborted) return false

  let popup: Window | null = null
  try {
    popup = window.open('', '_blank', 'width=980,height=760')
  } catch {
    popup = null
  }

  if (!popup) {
    return false
  }

  try {
    writeReceiptPrintDocument(popup.document, options)
    await fitReceiptPrintPage(popup.document, layout, signal)
    if (signal?.aborted) {
      popup.close()
      return false
    }
    if (popup.closed) throw new Error('The print window was closed. Please try again.')
    popup.focus()
    popup.print()
  } catch (error) {
    popup.close()
    throw error
  }

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
