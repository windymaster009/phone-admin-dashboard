import { dateText, titleStatus } from '../../lib/presentation'
import { confirmationRow, escapeConfirmationHtml } from '../receipts/confirmation-markup'

export type PrintableRepair = {
  repairNo: string
  customerName: string
  customerPhone?: string
  device: string
  issue: string
  status: string
  createdAt: string
}

export function repairClaimTicketMarkup(repair: PrintableRepair): string {
  const cancelled = repair.status === 'CANCELLED'
  return `<article class="receipt-paper receipt-paper-thermal">
    <header class="receipt-document-header">
      <div class="receipt-shop"><span>RP</span><div><h1>Device claim ticket</h1><p>Customer copy · not a payment receipt</p></div></div>
      <div class="receipt-title"><strong>Repair job</strong><span>${escapeConfirmationHtml(repair.repairNo)}</span></div>
    </header>
    <section class="receipt-grid receipt-meta">
      ${confirmationRow('Repair number', repair.repairNo)}
      ${confirmationRow('Received on', dateText(repair.createdAt))}
      ${confirmationRow('Status when printed', titleStatus(repair.status))}
    </section>
    <section class="receipt-section">
      <h3>Customer</h3>
      <strong class="receipt-party-name">${escapeConfirmationHtml(repair.customerName)}</strong>
      ${repair.customerPhone ? `<div class="receipt-party-info"><span>${escapeConfirmationHtml(repair.customerPhone)}</span></div>` : ''}
    </section>
    <section class="receipt-section">
      <h3>Device</h3>
      ${confirmationRow('Device', repair.device)}
      ${confirmationRow('Reported issue', repair.issue)}
    </section>
    <footer>
      <strong>${cancelled ? 'This repair was cancelled. Bring this ticket when collecting your device.' : 'Bring this ticket when collecting your device.'}</strong>
      <small>This ticket does not confirm handover or payment. Staff will confirm pickup separately.</small>
    </footer>
  </article>`
}
