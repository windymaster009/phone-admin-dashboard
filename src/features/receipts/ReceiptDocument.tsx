import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import type { ReceiptLayout, ReceiptRecord, ReceiptSnapshot } from './receipt-types'
import {
  bilingual,
  bilingualDocumentTitle,
  bilingualFooter,
  bilingualInterestType,
  bilingualNotes,
  bilingualPartyFallback,
  bilingualPartyRole,
  bilingualPaymentMethod,
  bilingualPaymentType,
  bilingualSignatureLabel,
  bilingualStatus,
  toKhmerNumerals,
} from './receipt-bilingual'

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const riel = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function money(value: number | undefined, currency: 'USD' | 'KHR') {
  const amount = Number(value || 0)
  return currency === 'KHR' ? `${riel.format(Math.round(amount / 100) * 100)} ៛` : `$${number.format(amount)}`
}

function dateTime(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function dateOnly(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(date)
}

function title(value?: string) {
  return String(value || '—').replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="receipt-row"><span>{label}</span><strong>{value}</strong></div>
}

function ReferenceBarcode({ reference, label, thermal = false }: { reference: string; label: string; thermal?: boolean }) {
  const barcodeRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!barcodeRef.current) return
    try {
      JsBarcode(barcodeRef.current, reference, {
        format: 'CODE128',
        width: thermal ? 1.05 : 1.35,
        height: thermal ? 32 : 42,
        displayValue: false,
        margin: 0,
        lineColor: '#111827',
        background: '#ffffff',
      })
    } catch {
      barcodeRef.current.replaceChildren()
    }
  }, [reference, thermal])

  return (
    <section className={`pawn-ticket-barcode receipt-reference-barcode${thermal ? ' pawn-ticket-barcode-thermal' : ''}`} aria-label={`Barcode for ${label.toLowerCase()} ${reference}`}>
      <svg ref={barcodeRef} aria-hidden="true" />
      <strong>{reference}</strong>
    </section>
  )
}

function ContractDetails({ snapshot }: { snapshot: ReceiptSnapshot }) {
  const pawn = snapshot.documentType === 'PAWN_CONTRACT'
  const pawnPayment = ['PAWN_PAYMENT', 'PAWN_REDEMPTION'].includes(snapshot.documentType)
  const loan = snapshot.documentType === 'LOAN_AGREEMENT'
  const loanPayment = snapshot.documentType === 'LOAN_PAYMENT'
  if (!pawn && !pawnPayment && !loan && !loanPayment) return null
  const itemCount = snapshot.items.reduce((total, item) => total + Number(item.quantity || 0), 0)

  return (
    <section className="receipt-section">
      <h3>{bilingual(pawn || loan ? 'Agreement details' : 'Payment details')}</h3>
      <div className="receipt-grid">
        {pawn && <>
          <Row label={bilingual('Number of items')} value={String(itemCount)} />
          <Row label={bilingual('Estimated value')} value={money(snapshot.estimatedValue, snapshot.currency)} />
          <Row label={bilingual('Loan amount')} value={money(snapshot.principal, snapshot.currency)} />
          <Row label={bilingual('Pawn percentage')} value={`${Number(snapshot.pawnPercentage || 0)}%`} />
          {snapshot.feeModel === 'DAILY_SIMPLE'
            ? <Row label={bilingual('Daily pawn fee')} value={`${Number(snapshot.dailyFeeRate || 0)}% · ${money(snapshot.dailyFeeAmount, snapshot.currency)} / day / ក្នុងមួយថ្ងៃ`} />
            : <Row label={bilingual('Interest')} value={`${Number(snapshot.interestRate || 0)}% per month / ក្នុងមួយខែ`} />}
          {snapshot.feeModel === 'DAILY_SIMPLE' && <Row label={bilingual('Contract length')} value={`${Number(snapshot.contractLengthDays || snapshot.termDays || 0)} days / ថ្ងៃ`} />}
          {snapshot.feeModel === 'DAILY_SIMPLE' && Number(snapshot.ticketPart || 1) > 1 && <Row label={bilingual('Extension period')} value={`${Number(snapshot.extensionTermDays || snapshot.termDays || 0)} days added / ថ្ងៃបន្ថែម`} />}
          <Row label={bilingual('Pawned / deposited on')} value={dateOnly(snapshot.startDate || snapshot.issuedAt)} />
          {snapshot.feeModel === 'DAILY_SIMPLE' && <Row label={bilingual('Fee at due date')} value={money(snapshot.pawnFeeAtDue, snapshot.currency)} />}
          {snapshot.feeModel === 'DAILY_SIMPLE' && <Row label={bilingual('Total at due date')} value={money(snapshot.total, snapshot.currency)} />}
          <Row label={bilingual(snapshot.feeModel === 'DAILY_SIMPLE' ? 'Date to pay pawn fee' : 'Date to pay interest')} value={dateOnly(snapshot.dueDate)} />
          <Row label={bilingual('Grace period ends')} value={dateOnly(snapshot.graceEndsAt || snapshot.dueDate)} />
          <Row label={bilingual('Ownership')} value={bilingual(snapshot.ownershipConfirmed ? 'Confirmed' : 'Legacy record')} />
          <Row label={bilingual('National ID')} value={bilingual(snapshot.identificationVerified ? 'Verified' : 'Not provided (optional)')} />
        </>}
        {loan && <>
          <Row label={bilingual('Principal')} value={money(snapshot.principal, snapshot.currency)} />
          <Row label={bilingual('Interest type')} value={bilingualInterestType(snapshot.interestType)} />
          <Row label={bilingual('Interest')} value={snapshot.interestType === 'PERCENT' ? `${number.format(Number(snapshot.interestValue || 0))}%` : money(snapshot.interestAmount, snapshot.currency)} />
          <Row label={bilingual('Total expected')} value={money(snapshot.total, snapshot.currency)} />
          <Row label={bilingual('Due date')} value={dateOnly(snapshot.dueDate)} />
          <Row label={bilingual('Status')} value={bilingualStatus(snapshot.status)} />
        </>}
        {pawnPayment && <>
          <Row label={bilingual('Payment type')} value={bilingualPaymentType(snapshot.paymentType)} />
          <Row label={bilingual('Principal applied')} value={money(snapshot.allocation?.principal, snapshot.currency)} />
          <Row label={bilingual('Interest applied')} value={money(snapshot.allocation?.interest, snapshot.currency)} />
          {Number(snapshot.allocation?.pawnFee || 0) > 0 && <Row label={bilingual('Daily pawn fee applied')} value={money(snapshot.allocation?.pawnFee, snapshot.currency)} />}
          <Row label={bilingual('Fees applied')} value={money(snapshot.allocation?.fees, snapshot.currency)} />
          {Number(snapshot.allocation?.additionalCollected || 0) > 0 && <Row label={bilingual('Additional amount collected')} value={money(snapshot.allocation?.additionalCollected, snapshot.currency)} />}
          <Row label={bilingual('Remaining balance')} value={money(snapshot.balance, snapshot.currency)} />
          <Row label={bilingual('Contract due date')} value={dateOnly(snapshot.dueDate)} />
        </>}
        {loanPayment && <>
          <Row label={bilingual('Payment method')} value={bilingualPaymentMethod(snapshot.paymentMethod)} />
          <Row label={bilingual('Agreement total')} value={money(snapshot.contractTotal, snapshot.currency)} />
          <Row label={bilingual('Payment amount')} value={money(snapshot.amountPaid, snapshot.currency)} />
          <Row label={bilingual('Remaining balance')} value={money(snapshot.balance, snapshot.currency)} />
          <Row label={bilingual('Due date')} value={dateOnly(snapshot.dueDate)} />
          <Row label={bilingual('Status')} value={bilingualStatus(snapshot.status)} />
        </>}
      </div>
    </section>
  )
}

function Totals({ snapshot }: { snapshot: ReceiptSnapshot }) {
  const refund = snapshot.documentType === 'REFUND_RECEIPT'
  return (
    <section className="receipt-totals">
      {snapshot.subtotal !== undefined && <Row label={bilingual('Subtotal')} value={money(snapshot.subtotal, snapshot.currency)} />}
      {Number(snapshot.discount || 0) > 0 && <Row label={bilingual('Discount')} value={`-${money(snapshot.discount, snapshot.currency)}`} />}
      <div className="receipt-grand-total"><span>{bilingual(refund ? 'Refund total' : 'Total')}</span><strong>{money(snapshot.total, snapshot.currency)}</strong></div>
      {snapshot.amountPaid !== undefined && <Row label={bilingual(refund ? 'Refunded' : 'Amount paid')} value={money(snapshot.amountPaid, snapshot.currency)} />}
      {!refund && snapshot.amountReceived !== undefined && snapshot.amountReceived > snapshot.total && <Row label={bilingual('Amount received')} value={money(snapshot.amountReceived, snapshot.currency)} />}
      {!refund && snapshot.changeDue !== undefined && snapshot.changeDue > 0 && <Row label={bilingual('Change')} value={money(snapshot.changeDue, snapshot.currency)} />}
      {snapshot.balance !== undefined && <Row label={bilingual(refund ? 'Remaining due' : 'Balance')} value={money(snapshot.balance, snapshot.currency)} />}
    </section>
  )
}

function PawnTicketThermal({ receipt, snapshot }: { receipt: ReceiptRecord; snapshot: ReceiptSnapshot }) {
  const itemCount = snapshot.items.reduce((total, item) => total + Number(item.quantity || 0), 0)
  const isDailyFee = snapshot.feeModel === 'DAILY_SIMPLE'
  const partNumber = Number(snapshot.ticketPart || 1)
  const khPartNumber = toKhmerNumerals(partNumber)

  return (
    <article className="receipt-paper receipt-paper-thermal pawn-ticket-thermal">
      <header className="pawn-ticket-shop">
        {snapshot.shop.logoUrl && (
          <img
            src={snapshot.shop.logoUrl}
            alt={snapshot.shop.name || 'Shop Logo'}
            className="pawn-ticket-logo"
          />
        )}
        <h1>Pawn Shop / ហាងបញ្ចាំ {snapshot.shop.name}</h1>
        {snapshot.shop.phone && <strong>Tel / ទូរស័ព្ទ: {snapshot.shop.phone}</strong>}
        {snapshot.shop.address && <span>{snapshot.shop.address}</span>}
      </header>

      <div className="pawn-ticket-reference">
        <strong>Pawn ticket · Part {partNumber} / បង្កាន់ដៃបញ្ចាំ · ផ្នែកទី {khPartNumber}</strong>
        <span>{snapshot.referenceNo}</span>
        <small>Receipt / បង្កាន់ដៃ {receipt.receiptNo}</small>
      </div>

      <ReferenceBarcode reference={snapshot.referenceNo} label="pawn contract" thermal />

      <section className="pawn-ticket-fields">
        <Row label={bilingual('Customer')} value={snapshot.party.name || bilingual('Walk-in customer')} />
        <Row label={bilingual('Number of items')} value={String(itemCount)} />
        <Row label={bilingual('Loan amount')} value={money(snapshot.principal, snapshot.currency)} />
        {isDailyFee ? <>
          <Row label={bilingual('Pawn fee at due date')} value={money(snapshot.pawnFeeAtDue, snapshot.currency)} />
          <Row label={bilingual('Daily pawn fee rate')} value={`${number.format(Number(snapshot.dailyFeeRate || 0))}% · ${money(snapshot.dailyFeeAmount, snapshot.currency)} / day / ក្នុងមួយថ្ងៃ`} />
        </> : <Row label={bilingual('Interest')} value={`${number.format(Number(snapshot.interestRate || 0))}% per month / ក្នុងមួយខែ`} />}
        {isDailyFee && <Row label={bilingual('Contract length')} value={`${Number(snapshot.contractLengthDays || snapshot.termDays || 0)} days / ថ្ងៃ`} />}
        {isDailyFee && partNumber > 1 && (
          <Row label={bilingual('Extension period')} value={`${Number(snapshot.extensionTermDays || snapshot.termDays || 0)} days added / ថ្ងៃបន្ថែម`} />
        )}
        <Row label={bilingual('Pawned / deposited on')} value={dateOnly(snapshot.startDate || snapshot.issuedAt)} />
        {snapshot.previousDueDate && partNumber > 1 && (
          <Row label={bilingual('Previous due date')} value={dateOnly(snapshot.previousDueDate)} />
        )}
        <Row
          label={
            bilingual(
              isDailyFee
                ? (partNumber > 1 ? 'New fee due date' : 'Date to pay pawn fee')
                : (partNumber > 1 ? 'New due date' : 'Date to pay interest'),
            )
          }
          value={dateOnly(snapshot.dueDate)}
        />
        <Row label={bilingual('Grace period ends')} value={dateOnly(snapshot.graceEndsAt || snapshot.dueDate)} />
      </section>

      {isDailyFee && (
        <p className="pawn-ticket-date-note">
          Pay, redeem, or extend by the fee due date. Claim review begins only after the grace period ends.
        </p>
      )}

      <section className="pawn-ticket-items">
        <h3>{bilingual('Pawned item')}</h3>
        {snapshot.items.map((item, index) => <div key={`${item.name}-${index}`}>
          <strong>{item.quantity} x {item.name}</strong>
          {item.description && <span>{item.description}</span>}
          {item.imei && <span>IMEI: {item.imei}</span>}
        </div>)}
      </section>

      <p className="pawn-ticket-warning">
        <strong>Important / សំខាន់:</strong> If this pawn ticket is lost, the item cannot be collected or redeemed.
      </p>

      <section className="pawn-ticket-signatures">
        <div><span /><strong>{bilingual('Customer signature / thumbprint')}</strong></div>
        <div><span /><strong>{bilingual('Shop representative')}</strong></div>
      </section>
    </article>
  )
}

function LoanTicketThermal({ receipt, snapshot }: { receipt: ReceiptRecord; snapshot: ReceiptSnapshot }) {
  const isRepayment = snapshot.documentType === 'LOAN_PAYMENT'
  return (
    <article className="receipt-paper receipt-paper-thermal pawn-ticket-thermal loan-ticket-thermal">
      <header className="pawn-ticket-shop">
        <h1>{snapshot.shop.name}</h1>
        {snapshot.shop.phone && <strong>Tel / ទូរស័ព្ទ: {snapshot.shop.phone}</strong>}
        {snapshot.shop.address && <span>{snapshot.shop.address}</span>}
      </header>

      <div className="pawn-ticket-reference">
        <strong>{bilingualDocumentTitle(snapshot.documentType, { isRepayment })}</strong>
        <span>{snapshot.referenceNo}</span>
        <small>Receipt / បង្កាន់ដៃ {receipt.receiptNo}{snapshot.paymentReference ? ` · ${snapshot.paymentReference}` : ''}</small>
      </div>

      <ReferenceBarcode reference={snapshot.referenceNo} label={isRepayment ? 'loan repayment' : 'loan agreement'} thermal />

      <section className="pawn-ticket-fields">
        <Row label={bilingual('Borrower')} value={snapshot.party.name || bilingual('Unknown borrower')} />
        {snapshot.party.phone && <Row label={bilingual('Phone')} value={snapshot.party.phone} />}
        {snapshot.party.nationalIdNumber && <Row label={bilingual('National ID')} value={snapshot.party.nationalIdNumber} />}
        <Row label={bilingual(isRepayment ? 'Paid on' : 'Loan date')} value={dateOnly(snapshot.issuedAt)} />
        <Row label={bilingual('Due date')} value={dateOnly(snapshot.dueDate)} />
        <Row label={bilingual('Principal')} value={money(isRepayment ? snapshot.contractPrincipal : snapshot.principal, snapshot.currency)} />
        {snapshot.interestType && snapshot.interestType !== 'NONE' && (
          <Row
            label={bilingual('Interest')}
            value={snapshot.interestType === 'PERCENT' ? `${number.format(Number(snapshot.interestValue || 0))}%` : money(snapshot.interestAmount, snapshot.currency)}
          />
        )}
        <Row label={bilingual('Total agreement')} value={money(isRepayment ? snapshot.contractTotal : snapshot.total, snapshot.currency)} />
        {isRepayment && (
          <>
            <Row label={bilingual('Amount paid')} value={money(snapshot.amountPaid, snapshot.currency)} />
            <Row label={bilingual('Payment method')} value={bilingualPaymentMethod(snapshot.paymentMethod)} />
            <Row label={bilingual('Remaining balance')} value={money(snapshot.balance, snapshot.currency)} />
          </>
        )}
        {!isRepayment && snapshot.balance !== undefined && (
          <Row label={bilingual('Balance remaining')} value={money(snapshot.balance, snapshot.currency)} />
        )}
        <Row label={bilingual('Status')} value={bilingualStatus(snapshot.status)} />
      </section>

      {snapshot.notes && (
        <div style={{ margin: '8px 0', fontSize: '9px', textAlign: 'center', color: '#4b5563' }}>
          Note / កំណត់ចំណាំ: {bilingualNotes(snapshot.notes, snapshot.documentType)}
        </div>
      )}

      <p className="pawn-ticket-warning">
        <strong>Notice / សេចក្តីជូនដំណឹង:</strong> Keep this official 80mm loan receipt for repayments, verification, and barcode scanning.
      </p>

      <section className="pawn-ticket-signatures">
        <div><span /><strong>{bilingual('Borrower signature / thumbprint')}</strong></div>
        <div><span /><strong>{bilingual('Authorized lender')}</strong></div>
      </section>

      <footer>
        <strong>{bilingualFooter(snapshot.shop.footer)}</strong>
        <small>Immutable receipt snapshot / កំណត់ត្រាបង្កាន់ដៃមិនអាចកែប្រែបាន · Printed {receipt.printCount} time{receipt.printCount === 1 ? '' : 's'}</small>
      </footer>
    </article>
  )
}

export default function ReceiptDocument({ receipt, layout }: { receipt: ReceiptRecord; layout: ReceiptLayout }) {
  const snapshot = receipt.snapshot
  if (!snapshot) return <div className="receipt-paper">Receipt snapshot is unavailable. / មិនមានទិន្នន័យបង្កាន់ដៃទេ។</div>
  if (layout === 'THERMAL' && snapshot.documentType === 'PAWN_CONTRACT') {
    return <PawnTicketThermal receipt={receipt} snapshot={snapshot} />
  }
  if (layout === 'THERMAL' && ['LOAN_AGREEMENT', 'LOAN_PAYMENT'].includes(snapshot.documentType)) {
    return <LoanTicketThermal receipt={receipt} snapshot={snapshot} />
  }

  const pawnReceipt = ['PAWN_CONTRACT', 'PAWN_PAYMENT', 'PAWN_REDEMPTION'].includes(snapshot.documentType)
  const loanReceipt = ['LOAN_AGREEMENT', 'LOAN_PAYMENT'].includes(snapshot.documentType)
  const saleReceipt = snapshot.documentType === 'SALE_RECEIPT'
  const displayTitle = bilingualDocumentTitle(snapshot.documentType, { ticketPart: snapshot.ticketPart, rawTitle: snapshot.title })

  return (
    <article className={`receipt-paper receipt-paper-${layout.toLowerCase()}`}>
      <header className="receipt-document-header">
        <div className="receipt-shop">
          {snapshot.shop.logoUrl ? <img src={snapshot.shop.logoUrl} alt="" /> : <span>PF</span>}
          <div><h1>{snapshot.shop.name}</h1><p>{snapshot.shop.subtitle}</p></div>
        </div>
        <div className="receipt-title"><strong>{displayTitle}</strong><span>{receipt.receiptNo}</span></div>
      </header>

      {(snapshot.shop.address || snapshot.shop.phone || snapshot.shop.email || snapshot.shop.taxId) && (
        <div className="receipt-shop-info">
          {snapshot.shop.address && <span>{snapshot.shop.address}</span>}
          {snapshot.shop.phone && <span>Tel / ទូរស័ព្ទ: {snapshot.shop.phone}</span>}
          {snapshot.shop.email && <span>{snapshot.shop.email}</span>}
          {snapshot.shop.taxId && <span>Tax ID / លេខអត្តសញ្ញាណកម្មសារពើពន្ធ: {snapshot.shop.taxId}</span>}
        </div>
      )}

      <section className="receipt-grid receipt-meta">
        <Row label={bilingual('Receipt')} value={receipt.receiptNo} />
        <Row label={bilingual('Reference')} value={snapshot.referenceNo} />
        <Row label={bilingual('Issued')} value={dateTime(snapshot.issuedAt)} />
        <Row label={bilingual('Currency')} value={snapshot.currency} />
        {snapshot.paymentReference && <Row label={bilingual('Payment reference')} value={snapshot.paymentReference} />}
        {snapshot.paymentExternalReference && <Row label={bilingual('External reference')} value={snapshot.paymentExternalReference} />}
        {snapshot.staff?.name && <Row label={bilingual('Processed by')} value={snapshot.staff.name} />}
      </section>

      {(pawnReceipt || loanReceipt) && <ReferenceBarcode reference={snapshot.referenceNo} label={loanReceipt ? 'loan' : 'pawn contract'} thermal={layout === 'THERMAL'} />}

      <section className="receipt-section">
        <h3>{bilingualPartyRole(snapshot.party.role, snapshot.documentType)}</h3>
        <strong className="receipt-party-name">{snapshot.party.name || bilingualPartyFallback(snapshot.party.role, snapshot.documentType)}</strong>
        <div className="receipt-party-info">
          {snapshot.party.phone && <span>{snapshot.party.phone}</span>}
          {snapshot.party.nationalIdNumber && <span>National ID / លេខអត្តសញ្ញាណប័ណ្ណ: {snapshot.party.nationalIdNumber}</span>}
          {snapshot.party.address && <span>{snapshot.party.address}</span>}
        </div>
      </section>

      <section className="receipt-section">
        <h3>{bilingual(snapshot.documentType === 'PAWN_CONTRACT' ? 'Collateral' : snapshot.documentType === 'REFUND_RECEIPT' ? 'Returned items' : 'Items / purpose')}</h3>
        <div className="receipt-item-head"><span>Description / បរិយាយ</span><span>Qty / បរិមាណ</span><span>Unit / តម្លៃឯកតា</span><span>Total / សរុប</span></div>
        {snapshot.items.map((item, index) => (
          <div className="receipt-item" key={`${item.name}-${index}`}>
            <div>
              <strong>{item.name}</strong>
              {item.description && <small>{item.description}</small>}
              {item.sku && <small>SKU: {item.sku}</small>}
              {item.imei && <small>IMEI: {item.imei}</small>}
              {item.imei2 && <small>IMEI 2: {item.imei2}</small>}
              {item.serialNumber && <small>Serial / លេខស៊េរី: {item.serialNumber}</small>}
              {item.accessories?.length ? <small>Included / រួមមាន: {item.accessories.map(title).join(', ')}</small> : null}
            </div>
            <span>{item.quantity}</span><span>{money(item.unitPrice, snapshot.currency)}</span><strong>{money(item.total, snapshot.currency)}</strong>
          </div>
        ))}
      </section>

      <ContractDetails snapshot={snapshot} />

      {snapshot.documentType === 'PAWN_CONTRACT' && (
        <p className="pawn-contract-warning">
          <strong>Important / សំខាន់:</strong> If this pawn ticket is lost, the item cannot be collected or redeemed.
        </p>
      )}

      {(snapshot.paymentMethod || snapshot.paymentStatus || snapshot.transactionStatus) && (
        <section className="receipt-section">
          <h3>Payment & status / ការទូទាត់ និងស្ថានភាព</h3>
          <div className="receipt-grid">
            {snapshot.paymentMethod && <Row label={bilingual('Payment method')} value={bilingualPaymentMethod(snapshot.paymentMethod)} />}
            {snapshot.paymentStatus && <Row label={bilingual('Payment status')} value={bilingualStatus(snapshot.paymentStatus)} />}
            {snapshot.transactionStatus && <Row label={bilingual('Transaction status')} value={bilingualStatus(snapshot.transactionStatus)} />}
          </div>
        </section>
      )}

      <Totals snapshot={snapshot} />
      {snapshot.notes && (
        <section className="receipt-section">
          <h3>Notes / កំណត់ចំណាំ</h3>
          <p>{bilingualNotes(snapshot.notes, snapshot.documentType)}</p>
        </section>
      )}

      {saleReceipt && <ReferenceBarcode reference={snapshot.referenceNo} label="sale refund" thermal={layout === 'THERMAL'} />}

      {!saleReceipt && snapshot.signatureLabels?.length ? (
        <section className="receipt-signatures">
          {snapshot.signatureLabels.map((label) => (
            <div key={label}>
              <span />
              <strong>{bilingualSignatureLabel(label)}</strong>
            </div>
          ))}
        </section>
      ) : null}

      <footer>
        <strong>{bilingualFooter(snapshot.shop.footer)}</strong>
        <small>Immutable {snapshot.shop.name} receipt snapshot / កំណត់ត្រាបង្កាន់ដៃមិនអាចកែប្រែបាន · Printed {receipt.printCount} time{receipt.printCount === 1 ? '' : 's'}</small>
      </footer>
    </article>
  )
}

const baseReceiptPrintStyles = `
@font-face {
  font-family: 'KhmerPrint';
  src: url('/fonts/KhmerOSsiemreap.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'KhmerPrint';
  src: url('/fonts/KhmerOSbattambang.ttf') format('truetype');
  font-weight: bold;
  font-style: normal;
  font-display: swap;
}
*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#111827;font-family:Arial,'KhmerPrint',sans-serif}.receipt-paper{margin:0 auto;background:#fff;color:#111827}.receipt-paper-a4{width:210mm;min-height:297mm;padding:16mm 17mm}.receipt-paper-thermal{width:80mm;min-height:110mm;padding:5mm 4mm;font-size:10px}.receipt-document-header{display:flex;justify-content:space-between;gap:16px;padding-bottom:13px;border-bottom:2px solid #111827}.receipt-shop{display:flex;align-items:center;gap:10px}.receipt-shop>span,.receipt-shop img{width:42px;height:42px;display:grid;place-items:center;border-radius:9px;object-fit:contain;color:#fff;background:#6d28d9;font-weight:800}.receipt-shop h1{margin:0;font-size:20px;line-height:1.2}.receipt-shop p{margin:3px 0 0;color:#6b7280;font-size:10px}.receipt-title{display:grid;justify-items:end;gap:4px;text-align:right}.receipt-title strong{text-transform:uppercase;font-size:12px;line-height:1.3}.receipt-title span{font:11px monospace}.receipt-shop-info{display:flex;flex-wrap:wrap;gap:4px 14px;padding:9px 0;border-bottom:1px solid #d1d5db;color:#4b5563;font-size:10px}.receipt-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 20px}.receipt-meta{padding:12px 0}.receipt-row{display:flex;justify-content:space-between;gap:10px}.receipt-row span{color:#6b7280}.receipt-row strong{text-align:right}.receipt-section{margin-top:12px;padding-top:10px;border-top:1px solid #d1d5db}.receipt-section h3{margin:0 0 8px;font-size:10px;letter-spacing:.08em;text-transform:uppercase}.receipt-party-name{font-size:15px}.receipt-party-info{display:flex;flex-wrap:wrap;gap:4px 13px;margin-top:4px;color:#4b5563;font-size:10px}.receipt-item-head,.receipt-item{display:grid;grid-template-columns:minmax(0,1fr) 48px 84px 90px;gap:7px;align-items:start}.receipt-item-head{padding-bottom:5px;color:#6b7280;font-size:9px;font-weight:800;text-transform:uppercase}.receipt-item-head span:not(:first-child),.receipt-item>span,.receipt-item>strong{text-align:right}.receipt-item{padding:8px 0;border-top:1px dashed #d1d5db}.receipt-totals{width:min(340px,100%);margin:15px 0 0 auto;padding-top:9px;border-top:2px solid #111827}.receipt-grand-total{display:flex;justify-content:space-between;padding:8px 0;font-size:15px}.receipt-signatures{display:grid;grid-template-columns:repeat(2,1fr);gap:35px;margin-top:44px}.receipt-signatures div{display:grid;gap:7px;text-align:center;font-size:9px;line-height:1.35}.receipt-signatures span{height:1px;background:#111827}.pawn-contract-warning{margin:16px 0 0;padding:12px 14px;border:2px solid #111827;font-size:11px;line-height:1.45;text-align:center}.receipt-paper footer{display:grid;gap:4px;margin-top:26px;padding-top:10px;border-top:1px solid #d1d5db;text-align:center;font-size:10px}.receipt-paper footer small{color:#6b7280}.receipt-paper-thermal .receipt-document-header{display:grid;justify-items:center;text-align:center}.receipt-paper-thermal .receipt-shop{display:grid;justify-items:center}.receipt-paper-thermal .receipt-title{justify-items:center;text-align:center}.receipt-paper-thermal .receipt-shop-info{justify-content:center;text-align:center}.receipt-paper-thermal .receipt-grid{grid-template-columns:1fr;gap:4px}.receipt-paper-thermal .receipt-item-head{display:none}.receipt-paper-thermal .receipt-item{grid-template-columns:1fr auto}.receipt-paper-thermal .receipt-item>span{display:none}.receipt-paper-thermal .receipt-item>strong{grid-column:2;grid-row:1}.receipt-paper-thermal .receipt-signatures{grid-template-columns:1fr;gap:27px}.receipt-paper-thermal .receipt-totals{width:100%}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
.receipt-item div{display:grid;gap:2px}.receipt-item small{color:#6b7280}
`

const thermalReceiptPrintStyles = `
.receipt-paper-thermal{box-sizing:border-box;min-height:0;overflow:hidden;line-height:1.35}
.receipt-paper-thermal *{box-sizing:border-box}
.receipt-paper-thermal .receipt-document-header{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;gap:8px;text-align:center}
.receipt-paper-thermal .receipt-shop,.receipt-paper-thermal .receipt-title{width:100%;min-width:0;margin-inline:auto;text-align:center;overflow-wrap:anywhere}
.receipt-paper-thermal .receipt-shop{display:grid;grid-template-columns:minmax(0,1fr);justify-items:center;gap:5px}
.receipt-paper-thermal .receipt-shop>div{min-width:0;max-width:100%;text-align:center}
.receipt-paper-thermal .receipt-shop>span,.receipt-paper-thermal .receipt-shop img{width:34px;height:34px}
.receipt-paper-thermal .receipt-shop h1{font-size:15px;line-height:1.25}
.receipt-paper-thermal .receipt-shop p{margin-top:1px;font-size:8px}
.receipt-paper-thermal .receipt-title{grid-template-columns:minmax(0,1fr);justify-items:center;text-align:center}
.receipt-paper-thermal .receipt-title strong{font-size:10.5px;line-height:1.3}
.receipt-paper-thermal .receipt-title span{max-width:100%;font-size:9px;overflow-wrap:anywhere}
.receipt-paper-thermal .receipt-shop-info{justify-content:center;gap:3px 8px;text-align:center}
.receipt-paper-thermal .receipt-grid{grid-template-columns:1fr;gap:4px}
.receipt-paper-thermal .receipt-meta{padding:8px 0}
.receipt-paper-thermal .receipt-row{display:flex;justify-content:space-between;align-items:flex-start;gap:6px}
.receipt-paper-thermal .receipt-row span{flex:1 1 auto;font-size:9px;line-height:1.35;overflow-wrap:break-word}
.receipt-paper-thermal .receipt-row strong{flex:0 0 auto;max-width:50%;text-align:right;overflow-wrap:anywhere;font-size:9.5px}
.receipt-paper-thermal .receipt-section{margin-top:9px;padding-top:8px}
.receipt-paper-thermal .receipt-section h3{margin-bottom:6px;font-size:9px}
.receipt-paper-thermal .receipt-party-name{font-size:12px}
.receipt-paper-thermal .receipt-party-info{gap:3px 8px;font-size:9px;overflow-wrap:anywhere}
.receipt-paper-thermal .receipt-item{grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:7px 0}
.receipt-paper-thermal .receipt-item div{min-width:0;overflow-wrap:anywhere}
.receipt-paper-thermal .receipt-item>strong{white-space:nowrap}
.receipt-paper-thermal .receipt-signatures{margin-top:30px}
.receipt-paper-thermal .receipt-totals{margin-top:11px}
.receipt-paper-thermal .receipt-grand-total{font-size:13px}
.receipt-paper-thermal footer{margin-top:16px;overflow-wrap:anywhere}
.pawn-ticket-barcode{display:grid;justify-items:center;gap:4px;margin:12px auto 0;padding:8px 10px;border:1px dashed #9ca3af;background:#fff;color:#111827;text-align:center}.pawn-ticket-barcode svg{display:block;width:min(100%,240px);height:auto;max-height:44px}.pawn-ticket-barcode span{color:#4b5563;font-size:9px}.pawn-ticket-barcode strong{font:700 10px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.06em}.receipt-paper-thermal .pawn-ticket-barcode{margin-top:8px;padding:6px 6px}.receipt-paper-thermal .pawn-ticket-barcode svg{width:min(100%,220px);max-height:36px}.receipt-paper-thermal .pawn-ticket-barcode span{font-size:8px}.receipt-paper-thermal .pawn-ticket-barcode strong{font-size:9px}
.pawn-ticket-thermal{padding:5mm 4mm;color:#111827;font-size:10.5px;line-height:1.4}
.pawn-ticket-shop{display:grid;justify-items:center;gap:3px;padding-bottom:9px;border-bottom:2px solid #111827;text-align:center}
.pawn-ticket-shop h1{margin:0;font-size:16px;line-height:1.25}.pawn-ticket-shop strong{font-size:10.5px}.pawn-ticket-shop span{font-size:9px}
.pawn-ticket-logo{max-width:54px;max-height:54px;object-fit:contain;margin-bottom:4px;display:block}
.pawn-ticket-date-note{margin:0 0 9px;padding:7px 8px;border:1px solid #d1d5db;border-radius:4px;color:#374151;background:#f9fafb;font-size:8px;line-height:1.4;text-align:center}
.pawn-ticket-reference{display:grid;justify-items:center;gap:2px;padding:8px 0;border-bottom:1px dashed #6b7280;text-align:center}
.pawn-ticket-reference strong{font-size:11px;line-height:1.3;text-transform:uppercase}.pawn-ticket-reference span{font:700 11px monospace}.pawn-ticket-reference small{color:#6b7280;font-size:8px}
.pawn-ticket-fields{display:grid;gap:5px;padding:8px 0}.pawn-ticket-fields .receipt-row{display:flex;justify-content:space-between;align-items:flex-start;gap:6px;padding-bottom:4px;border-bottom:1px dotted #d1d5db}.pawn-ticket-fields .receipt-row span{flex:1 1 auto;color:#374151;font-size:9px;line-height:1.35;overflow-wrap:break-word}.pawn-ticket-fields .receipt-row strong{flex:0 0 auto;max-width:50%;text-align:right;overflow-wrap:anywhere;font-size:9.5px}
.pawn-ticket-items{display:grid;gap:6px;padding:8px 0;border-top:1px solid #111827}.pawn-ticket-items h3{margin:0;font-size:9px;letter-spacing:.08em;text-transform:uppercase}.pawn-ticket-items>div{display:grid;gap:2px}.pawn-ticket-items span{color:#4b5563;font-size:9px;overflow-wrap:anywhere}
.pawn-ticket-warning{margin:8px 0 0;padding:7px 8px;border:1.5px solid #111827;font-size:8.5px;line-height:1.35;text-align:center}
.pawn-ticket-signatures{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:24px}.pawn-ticket-signatures div{display:grid;gap:5px;text-align:center;font-size:8px;line-height:1.3}.pawn-ticket-signatures span{height:1px;background:#111827}
`

export const receiptPrintStyles = `${baseReceiptPrintStyles}\n${thermalReceiptPrintStyles}`
