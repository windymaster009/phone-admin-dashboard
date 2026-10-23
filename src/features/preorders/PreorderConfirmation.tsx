import { dateText, titleStatus } from '../../lib/presentation'

export type PrintablePreorder = {
  preorderNo: string
  customerName: string
  customerPhone: string
  category: string
  productName: string
  quantity: number
  specifications?: string
  status: string
  createdAt: string
  expectedAt?: string
}

function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character)
}

function row(label: string, value: string | number): string {
  return `<div class="receipt-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
}

export function preorderConfirmationMarkup(preorder: PrintablePreorder): string {
  return `<article class="receipt-paper receipt-paper-thermal">
    <header class="receipt-document-header">
      <div class="receipt-shop"><span>PO</span><div><h1>Preorder confirmation</h1><p>Customer copy · not a payment receipt</p></div></div>
      <div class="receipt-title"><strong>Customer preorder</strong><span>${escapeHtml(preorder.preorderNo)}</span></div>
    </header>
    <section class="receipt-grid receipt-meta">
      ${row('Preorder number', preorder.preorderNo)}
      ${row('Requested on', dateText(preorder.createdAt))}
      ${row('Status', titleStatus(preorder.status))}
      ${preorder.expectedAt ? row('Estimated arrival', `${dateText(preorder.expectedAt)} (may change)`) : ''}
    </section>
    <section class="receipt-section">
      <h3>Customer</h3>
      <strong class="receipt-party-name">${escapeHtml(preorder.customerName)}</strong>
      <div class="receipt-party-info"><span>${escapeHtml(preorder.customerPhone)}</span></div>
    </section>
    <section class="receipt-section">
      <h3>Requested product</h3>
      ${row('Product', preorder.productName)}
      ${row('Category', titleStatus(preorder.category))}
      ${row('Quantity', preorder.quantity)}
      ${preorder.specifications ? row('Details', preorder.specifications) : ''}
    </section>
    <footer>
      <strong>Keep this confirmation and quote the preorder number when checking with the shop.</strong>
      <small>This confirms the request only. It does not record a purchase, sale, or payment.</small>
    </footer>
  </article>`
}
