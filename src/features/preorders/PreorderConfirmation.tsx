import { dateText, titleStatus } from '../../lib/presentation'
import { confirmationRow, escapeConfirmationHtml } from '../receipts/confirmation-markup'

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

export function preorderConfirmationMarkup(preorder: PrintablePreorder): string {
  return `<article class="receipt-paper receipt-paper-thermal">
    <header class="receipt-document-header">
      <div class="receipt-shop"><span>PO</span><div><h1>Preorder confirmation</h1><p>Customer copy · not a payment receipt</p></div></div>
      <div class="receipt-title"><strong>Customer preorder</strong><span>${escapeConfirmationHtml(preorder.preorderNo)}</span></div>
    </header>
    <section class="receipt-grid receipt-meta">
      ${confirmationRow('Preorder number', preorder.preorderNo)}
      ${confirmationRow('Requested on', dateText(preorder.createdAt))}
      ${confirmationRow('Status', titleStatus(preorder.status))}
      ${preorder.expectedAt ? confirmationRow('Estimated arrival', `${dateText(preorder.expectedAt)} (may change)`) : ''}
    </section>
    <section class="receipt-section">
      <h3>Customer</h3>
      <strong class="receipt-party-name">${escapeConfirmationHtml(preorder.customerName)}</strong>
      <div class="receipt-party-info"><span>${escapeConfirmationHtml(preorder.customerPhone)}</span></div>
    </section>
    <section class="receipt-section">
      <h3>Requested product</h3>
      ${confirmationRow('Product', preorder.productName)}
      ${confirmationRow('Category', titleStatus(preorder.category))}
      ${confirmationRow('Quantity', preorder.quantity)}
      ${preorder.specifications ? confirmationRow('Details', preorder.specifications) : ''}
    </section>
    <footer>
      <strong>Keep this confirmation and quote the preorder number when checking with the shop.</strong>
      <small>This confirms the request only. It does not record a purchase, sale, or payment.</small>
    </footer>
  </article>`
}
