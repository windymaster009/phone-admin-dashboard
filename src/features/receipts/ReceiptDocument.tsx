import type { ReceiptLayout, ReceiptRecord, ReceiptSnapshot } from './receipt-types'

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

function ContractDetails({ snapshot }: { snapshot: ReceiptSnapshot }) {
  const pawn = snapshot.documentType === 'PAWN_CONTRACT'
  const pawnPayment = ['PAWN_PAYMENT', 'PAWN_REDEMPTION'].includes(snapshot.documentType)
  const loan = snapshot.documentType === 'LOAN_AGREEMENT'
  const loanPayment = snapshot.documentType === 'LOAN_PAYMENT'
  if (!pawn && !pawnPayment && !loan && !loanPayment) return null
  const itemCount = snapshot.items.reduce((total, item) => total + Number(item.quantity || 0), 0)

  return (
    <section className="receipt-section">
      <h3>{pawn || loan ? 'Agreement details' : 'Payment details'}</h3>
      <div className="receipt-grid">
        {pawn && <>
          <Row label="Number of items" value={String(itemCount)} />
          <Row label="Estimated value" value={money(snapshot.estimatedValue, snapshot.currency)} />
          <Row label="Loan amount" value={money(snapshot.principal, snapshot.currency)} />
          <Row label="Pawn percentage" value={`${Number(snapshot.pawnPercentage || 0)}%`} />
          {snapshot.feeModel === 'DAILY_SIMPLE'
            ? <Row label="Daily pawn fee" value={`${Number(snapshot.dailyFeeRate || 0)}% · ${money(snapshot.dailyFeeAmount, snapshot.currency)} / day`} />
            : <Row label="Interest" value={`${Number(snapshot.interestRate || 0)}% per month`} />}
          {snapshot.feeModel === 'DAILY_SIMPLE' && <Row label="Contract length" value={`${Number(snapshot.contractLengthDays || snapshot.termDays || 0)} days`} />}
          {snapshot.feeModel === 'DAILY_SIMPLE' && Number(snapshot.ticketPart || 1) > 1 && <Row label="Extension period" value={`${Number(snapshot.extensionTermDays || snapshot.termDays || 0)} days`} />}
          <Row label="Pawned / deposited on" value={dateOnly(snapshot.startDate || snapshot.issuedAt)} />
          {snapshot.feeModel === 'DAILY_SIMPLE' && <Row label="Fee at due date" value={money(snapshot.pawnFeeAtDue, snapshot.currency)} />}
          {snapshot.feeModel === 'DAILY_SIMPLE' && <Row label="Total at due date" value={money(snapshot.total, snapshot.currency)} />}
          <Row label={snapshot.feeModel === 'DAILY_SIMPLE' ? 'Date to pay pawn fee' : 'Date to pay interest'} value={dateOnly(snapshot.dueDate)} />
          <Row label="Grace period ends" value={dateOnly(snapshot.graceEndsAt || snapshot.dueDate)} />
          <Row label="Ownership" value={snapshot.ownershipConfirmed ? 'Confirmed' : 'Legacy record'} />
          <Row label="National ID" value={snapshot.identificationVerified ? 'Verified' : 'Not provided (optional)'} />
        </>}
        {loan && <>
          <Row label="Principal" value={money(snapshot.principal, snapshot.currency)} />
          <Row label="Interest type" value={title(snapshot.interestType)} />
          <Row label="Interest" value={snapshot.interestType === 'PERCENT' ? `${number.format(Number(snapshot.interestValue || 0))}%` : money(snapshot.interestAmount, snapshot.currency)} />
          <Row label="Total expected" value={money(snapshot.total, snapshot.currency)} />
          <Row label="Due date" value={dateOnly(snapshot.dueDate)} />
          <Row label="Status" value={title(snapshot.status)} />
        </>}
        {pawnPayment && <>
          <Row label="Payment type" value={title(snapshot.paymentType)} />
          <Row label="Principal applied" value={money(snapshot.allocation?.principal, snapshot.currency)} />
          <Row label="Interest applied" value={money(snapshot.allocation?.interest, snapshot.currency)} />
          {Number(snapshot.allocation?.pawnFee || 0) > 0 && <Row label="Daily pawn fee applied" value={money(snapshot.allocation?.pawnFee, snapshot.currency)} />}
          <Row label="Fees applied" value={money(snapshot.allocation?.fees, snapshot.currency)} />
          {Number(snapshot.allocation?.additionalCollected || 0) > 0 && <Row label="Additional amount collected" value={money(snapshot.allocation?.additionalCollected, snapshot.currency)} />}
          <Row label="Remaining balance" value={money(snapshot.balance, snapshot.currency)} />
          <Row label="Contract due date" value={dateOnly(snapshot.dueDate)} />
        </>}
        {loanPayment && <>
          <Row label="Payment method" value={title(snapshot.paymentMethod)} />
          <Row label="Agreement total" value={money(snapshot.contractTotal, snapshot.currency)} />
          <Row label="Payment amount" value={money(snapshot.amountPaid, snapshot.currency)} />
          <Row label="Remaining balance" value={money(snapshot.balance, snapshot.currency)} />
          <Row label="Due date" value={dateOnly(snapshot.dueDate)} />
          <Row label="Status" value={title(snapshot.status)} />
        </>}
      </div>
    </section>
  )
}

function Totals({ snapshot }: { snapshot: ReceiptSnapshot }) {
  const refund = snapshot.documentType === 'REFUND_RECEIPT'
  return (
    <section className="receipt-totals">
      {snapshot.subtotal !== undefined && <Row label="Subtotal" value={money(snapshot.subtotal, snapshot.currency)} />}
      {Number(snapshot.discount || 0) > 0 && <Row label="Discount" value={`-${money(snapshot.discount, snapshot.currency)}`} />}
      <div className="receipt-grand-total"><span>{refund ? 'Refund total' : 'Total'}</span><strong>{money(snapshot.total, snapshot.currency)}</strong></div>
      {snapshot.amountPaid !== undefined && <Row label={refund ? 'Refunded' : 'Amount paid'} value={money(snapshot.amountPaid, snapshot.currency)} />}
      {snapshot.balance !== undefined && <Row label={refund ? 'Remaining due' : 'Balance'} value={money(snapshot.balance, snapshot.currency)} />}
    </section>
  )
}

function PawnTicketThermal({ receipt, snapshot }: { receipt: ReceiptRecord; snapshot: ReceiptSnapshot }) {
  const itemCount = snapshot.items.reduce((total, item) => total + Number(item.quantity || 0), 0)
  const isDailyFee = snapshot.feeModel === 'DAILY_SIMPLE'

  return (
    <article className="receipt-paper receipt-paper-thermal pawn-ticket-thermal">
      <header className="pawn-ticket-shop">
        <h1>Pawn Shop {snapshot.shop.name}</h1>
        {snapshot.shop.phone && <strong>Tel: {snapshot.shop.phone}</strong>}
        {snapshot.shop.address && <span>{snapshot.shop.address}</span>}
      </header>

      <div className="pawn-ticket-reference">
        <strong>Pawn ticket · Part {Number(snapshot.ticketPart || 1)}</strong>
        <span>{snapshot.referenceNo}</span>
        <small>Receipt {receipt.receiptNo}</small>
      </div>

      <section className="pawn-ticket-fields">
        <Row label="Customer" value={snapshot.party.name || 'Walk-in customer'} />
        <Row label="Number of items" value={String(itemCount)} />
        <Row label="Loan amount" value={money(snapshot.principal, snapshot.currency)} />
        {isDailyFee ? <>
          <Row label="Pawn fee at due date" value={money(snapshot.pawnFeeAtDue, snapshot.currency)} />
          <Row label="Daily pawn fee rate" value={`${number.format(Number(snapshot.dailyFeeRate || 0))}% · ${money(snapshot.dailyFeeAmount, snapshot.currency)} / day`} />
        </> : <Row label="Interest" value={`${number.format(Number(snapshot.interestRate || 0))}% per month`} />}
        {isDailyFee && <Row label="Contract length" value={`${Number(snapshot.contractLengthDays || snapshot.termDays || 0)} days`} />}
        <Row label="Pawned / deposited on" value={dateOnly(snapshot.startDate || snapshot.issuedAt)} />
        <Row label={isDailyFee ? 'Date to pay pawn fee' : 'Date to pay interest'} value={dateOnly(snapshot.dueDate)} />
        <Row label="Grace period ends" value={dateOnly(snapshot.graceEndsAt || snapshot.dueDate)} />
      </section>

      {isDailyFee && <p className="pawn-ticket-date-note">Pay, redeem, or extend by the fee due date. Claim review begins only after the grace period ends.</p>}

      <section className="pawn-ticket-items">
        <h3>Pawned item</h3>
        {snapshot.items.map((item, index) => <div key={`${item.name}-${index}`}>
          <strong>{item.quantity} x {item.name}</strong>
          {item.description && <span>{item.description}</span>}
          {item.imei && <span>IMEI: {item.imei}</span>}
        </div>)}
      </section>

      <p className="pawn-ticket-warning"><strong>Important:</strong> If this pawn ticket is lost, the item cannot be collected or redeemed.</p>

      <section className="pawn-ticket-signatures">
        <div><span /><strong>Customer signature / thumbprint</strong></div>
        <div><span /><strong>Shop representative</strong></div>
      </section>
    </article>
  )
}

export default function ReceiptDocument({ receipt, layout }: { receipt: ReceiptRecord; layout: ReceiptLayout }) {
  const snapshot = receipt.snapshot
  if (!snapshot) return <div className="receipt-paper">Receipt snapshot is unavailable.</div>
  if (layout === 'THERMAL' && snapshot.documentType === 'PAWN_CONTRACT') {
    return <PawnTicketThermal receipt={receipt} snapshot={snapshot} />
  }

  return (
    <article className={`receipt-paper receipt-paper-${layout.toLowerCase()}`}>
      <header className="receipt-document-header">
        <div className="receipt-shop">
          {snapshot.shop.logoUrl ? <img src={snapshot.shop.logoUrl} alt="" /> : <span>PF</span>}
          <div><h1>{snapshot.shop.name}</h1><p>{snapshot.shop.subtitle}</p></div>
        </div>
        <div className="receipt-title"><strong>{snapshot.title}</strong><span>{receipt.receiptNo}</span></div>
      </header>

      {(snapshot.shop.address || snapshot.shop.phone || snapshot.shop.email || snapshot.shop.taxId) && (
        <div className="receipt-shop-info">
          {snapshot.shop.address && <span>{snapshot.shop.address}</span>}
          {snapshot.shop.phone && <span>Tel: {snapshot.shop.phone}</span>}
          {snapshot.shop.email && <span>{snapshot.shop.email}</span>}
          {snapshot.shop.taxId && <span>Tax ID: {snapshot.shop.taxId}</span>}
        </div>
      )}

      <section className="receipt-grid receipt-meta">
        <Row label="Receipt" value={receipt.receiptNo} />
        <Row label="Reference" value={snapshot.referenceNo} />
        <Row label="Issued" value={dateTime(snapshot.issuedAt)} />
        <Row label="Currency" value={snapshot.currency} />
        {snapshot.paymentReference && <Row label="Payment reference" value={snapshot.paymentReference} />}
        {snapshot.paymentExternalReference && <Row label="External reference" value={snapshot.paymentExternalReference} />}
        {snapshot.staff?.name && <Row label="Processed by" value={snapshot.staff.name} />}
      </section>

      <section className="receipt-section">
        <h3>{snapshot.party.role || 'Customer'}</h3>
        <strong className="receipt-party-name">{snapshot.party.name || 'Walk-in customer'}</strong>
        <div className="receipt-party-info">
          {snapshot.party.phone && <span>{snapshot.party.phone}</span>}
          {snapshot.party.nationalIdNumber && <span>National ID: {snapshot.party.nationalIdNumber}</span>}
          {snapshot.party.address && <span>{snapshot.party.address}</span>}
        </div>
      </section>

      <section className="receipt-section">
        <h3>{snapshot.documentType === 'PAWN_CONTRACT' ? 'Collateral' : snapshot.documentType === 'REFUND_RECEIPT' ? 'Returned items' : 'Items / purpose'}</h3>
        <div className="receipt-item-head"><span>Description</span><span>Qty</span><span>Unit</span><span>Total</span></div>
        {snapshot.items.map((item, index) => (
          <div className="receipt-item" key={`${item.name}-${index}`}>
            <div>
              <strong>{item.name}</strong>
              {item.description && <small>{item.description}</small>}
              {item.sku && <small>SKU: {item.sku}</small>}
              {item.imei && <small>IMEI: {item.imei}</small>}
              {item.imei2 && <small>IMEI 2: {item.imei2}</small>}
              {item.serialNumber && <small>Serial: {item.serialNumber}</small>}
              {item.accessories?.length ? <small>Included: {item.accessories.map(title).join(', ')}</small> : null}
            </div>
            <span>{item.quantity}</span><span>{money(item.unitPrice, snapshot.currency)}</span><strong>{money(item.total, snapshot.currency)}</strong>
          </div>
        ))}
      </section>

      <ContractDetails snapshot={snapshot} />

      {snapshot.documentType === 'PAWN_CONTRACT' && <p className="pawn-contract-warning"><strong>Important:</strong> If this pawn ticket is lost, the item cannot be collected or redeemed.</p>}

      {(snapshot.paymentMethod || snapshot.paymentStatus || snapshot.transactionStatus) && (
        <section className="receipt-section">
          <h3>Payment & status</h3>
          <div className="receipt-grid">
            {snapshot.paymentMethod && <Row label="Payment method" value={title(snapshot.paymentMethod)} />}
            {snapshot.paymentStatus && <Row label="Payment status" value={title(snapshot.paymentStatus)} />}
            {snapshot.transactionStatus && <Row label="Transaction status" value={title(snapshot.transactionStatus)} />}
          </div>
        </section>
      )}

      <Totals snapshot={snapshot} />
      {snapshot.notes && <section className="receipt-section"><h3>Notes</h3><p>{snapshot.notes}</p></section>}

      {snapshot.signatureLabels?.length ? <section className="receipt-signatures">
        {snapshot.signatureLabels.map((label) => <div key={label}><span /><strong>{label}</strong></div>)}
      </section> : null}

      <footer><strong>{snapshot.shop.footer || 'Thank you for your business.'}</strong><small>Immutable PhoneFlow receipt snapshot · Printed {receipt.printCount} time{receipt.printCount === 1 ? '' : 's'}</small></footer>
    </article>
  )
}

const baseReceiptPrintStyles = `
*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#111827;font-family:Arial,sans-serif}.receipt-paper{margin:0 auto;background:#fff;color:#111827}.receipt-paper-a4{width:210mm;min-height:297mm;padding:16mm 17mm}.receipt-paper-thermal{width:80mm;min-height:110mm;padding:5mm 4mm;font-size:10px}.receipt-document-header{display:flex;justify-content:space-between;gap:16px;padding-bottom:13px;border-bottom:2px solid #111827}.receipt-shop{display:flex;align-items:center;gap:10px}.receipt-shop>span,.receipt-shop img{width:42px;height:42px;display:grid;place-items:center;border-radius:9px;object-fit:contain;color:#fff;background:#6d28d9;font-weight:800}.receipt-shop h1{margin:0;font-size:21px}.receipt-shop p{margin:3px 0 0;color:#6b7280;font-size:10px}.receipt-title{display:grid;justify-items:end;gap:4px;text-align:right}.receipt-title strong{text-transform:uppercase}.receipt-title span{font:11px monospace}.receipt-shop-info{display:flex;flex-wrap:wrap;gap:4px 14px;padding:9px 0;border-bottom:1px solid #d1d5db;color:#4b5563;font-size:10px}.receipt-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 20px}.receipt-meta{padding:12px 0}.receipt-row{display:flex;justify-content:space-between;gap:10px}.receipt-row span{color:#6b7280}.receipt-row strong{text-align:right}.receipt-section{margin-top:12px;padding-top:10px;border-top:1px solid #d1d5db}.receipt-section h3{margin:0 0 8px;font-size:10px;letter-spacing:.08em;text-transform:uppercase}.receipt-party-name{font-size:15px}.receipt-party-info{display:flex;flex-wrap:wrap;gap:4px 13px;margin-top:4px;color:#4b5563;font-size:10px}.receipt-item-head,.receipt-item{display:grid;grid-template-columns:minmax(0,1fr) 38px 82px 88px;gap:7px;align-items:start}.receipt-item-head{padding-bottom:5px;color:#6b7280;font-size:9px;font-weight:800;text-transform:uppercase}.receipt-item-head span:not(:first-child),.receipt-item>span,.receipt-item>strong{text-align:right}.receipt-item{padding:8px 0;border-top:1px dashed #d1d5db}.receipt-item div{display:grid;gap:2px}.receipt-item small{color:#6b7280}.receipt-totals{width:min(320px,100%);margin:15px 0 0 auto;padding-top:9px;border-top:2px solid #111827}.receipt-grand-total{display:flex;justify-content:space-between;padding:8px 0;font-size:16px}.receipt-signatures{display:grid;grid-template-columns:repeat(2,1fr);gap:35px;margin-top:44px}.receipt-signatures div{display:grid;gap:7px;text-align:center;font-size:9px}.receipt-signatures span{height:1px;background:#111827}.pawn-contract-warning{margin:16px 0 0;padding:12px 14px;border:2px solid #111827;font-size:11px;line-height:1.45;text-align:center}.receipt-paper footer{display:grid;gap:4px;margin-top:26px;padding-top:10px;border-top:1px solid #d1d5db;text-align:center}.receipt-paper footer small{color:#6b7280}.receipt-paper-thermal .receipt-document-header{display:grid;justify-items:center;text-align:center}.receipt-paper-thermal .receipt-shop{display:grid;justify-items:center}.receipt-paper-thermal .receipt-title{justify-items:center;text-align:center}.receipt-paper-thermal .receipt-shop-info{justify-content:center;text-align:center}.receipt-paper-thermal .receipt-grid{grid-template-columns:1fr;gap:4px}.receipt-paper-thermal .receipt-item-head{display:none}.receipt-paper-thermal .receipt-item{grid-template-columns:1fr auto}.receipt-paper-thermal .receipt-item>span{display:none}.receipt-paper-thermal .receipt-item>strong{grid-column:2;grid-row:1}.receipt-paper-thermal .receipt-signatures{grid-template-columns:1fr;gap:27px}.receipt-paper-thermal .receipt-totals{width:100%}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`

const thermalReceiptPrintStyles = `
.receipt-paper-thermal{box-sizing:border-box;min-height:0;overflow:hidden;line-height:1.35}
.receipt-paper-thermal *{box-sizing:border-box}
.receipt-paper-thermal .receipt-document-header{display:grid;justify-items:center;gap:8px;text-align:center}
.receipt-paper-thermal .receipt-shop{display:grid;justify-items:center;gap:5px}
.receipt-paper-thermal .receipt-shop>span,.receipt-paper-thermal .receipt-shop img{width:34px;height:34px}
.receipt-paper-thermal .receipt-shop h1{font-size:16px}
.receipt-paper-thermal .receipt-shop p{margin-top:1px;font-size:8px}
.receipt-paper-thermal .receipt-title{min-width:0;justify-items:center;text-align:center}
.receipt-paper-thermal .receipt-title strong{font-size:11px}
.receipt-paper-thermal .receipt-title span{max-width:100%;font-size:9px;overflow-wrap:anywhere}
.receipt-paper-thermal .receipt-shop-info{justify-content:center;gap:3px 8px;text-align:center}
.receipt-paper-thermal .receipt-grid{grid-template-columns:1fr;gap:4px}
.receipt-paper-thermal .receipt-meta{padding:8px 0}
.receipt-paper-thermal .receipt-row{align-items:flex-start;gap:8px}
.receipt-paper-thermal .receipt-row span{flex:0 1 44%}
.receipt-paper-thermal .receipt-row strong{min-width:0;flex:1;overflow-wrap:anywhere}
.receipt-paper-thermal .receipt-section{margin-top:9px;padding-top:8px}
.receipt-paper-thermal .receipt-section h3{margin-bottom:6px;font-size:9px}
.receipt-paper-thermal .receipt-party-name{font-size:12px}
.receipt-paper-thermal .receipt-party-info{gap:3px 8px;font-size:9px;overflow-wrap:anywhere}
.receipt-paper-thermal .receipt-item{grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:7px 0}
.receipt-paper-thermal .receipt-item div{min-width:0;overflow-wrap:anywhere}
.receipt-paper-thermal .receipt-item>strong{white-space:nowrap}
.receipt-paper-thermal .receipt-signatures{margin-top:34px}
.receipt-paper-thermal .receipt-totals{margin-top:11px}
.receipt-paper-thermal .receipt-grand-total{font-size:14px}
.receipt-paper-thermal footer{margin-top:18px;overflow-wrap:anywhere}
.pawn-ticket-thermal{padding:5mm 4mm;color:#111827;font-size:11px;line-height:1.4}
.pawn-ticket-shop{display:grid;justify-items:center;gap:3px;padding-bottom:9px;border-bottom:2px solid #111827;text-align:center}
.pawn-ticket-shop h1{margin:0;font-size:18px}.pawn-ticket-shop strong{font-size:11px}.pawn-ticket-shop span{font-size:9px}
.pawn-ticket-reference{display:grid;justify-items:center;gap:2px;padding:9px 0;border-bottom:1px dashed #6b7280;text-align:center}
.pawn-ticket-reference strong{font-size:12px;text-transform:uppercase}.pawn-ticket-reference span{font:700 11px monospace}.pawn-ticket-reference small{color:#6b7280;font-size:8px}
.pawn-ticket-fields{display:grid;gap:6px;padding:10px 0}.pawn-ticket-fields .receipt-row{padding-bottom:5px;border-bottom:1px dotted #d1d5db}.pawn-ticket-fields .receipt-row span{color:#374151}.pawn-ticket-fields .receipt-row strong{max-width:58%}
.pawn-ticket-items{display:grid;gap:6px;padding:9px 0;border-top:1px solid #111827}.pawn-ticket-items h3{margin:0;font-size:9px;letter-spacing:.08em;text-transform:uppercase}.pawn-ticket-items>div{display:grid;gap:2px}.pawn-ticket-items span{color:#4b5563;font-size:9px;overflow-wrap:anywhere}
.pawn-ticket-warning{margin:8px 0 0;padding:8px;border:1.5px solid #111827;font-size:9px;text-align:center}
.pawn-ticket-signatures{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:30px}.pawn-ticket-signatures div{display:grid;gap:6px;text-align:center;font-size:8px}.pawn-ticket-signatures span{height:1px;background:#111827}
`

export const receiptPrintStyles = `${baseReceiptPrintStyles}\n${thermalReceiptPrintStyles}`
