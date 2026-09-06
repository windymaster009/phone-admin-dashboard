import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AlertTriangle, ArrowLeft, BadgeCheck, Package, Printer, RefreshCcw, ScanLine, Search, Smartphone, ShieldCheck, ShieldX, Type, Wrench, X, type LucideIcon } from 'lucide-react'
import { api, type SessionUser } from '../../lib/api'
import type { InventoryItem, Trade } from '../../types/domain'
import { currency, money, tradePartyName, tradePartyPhone, tradeTransactionMoney, dateText, titleStatus } from '../../lib/presentation'
import LoadingState from '../../components/LoadingState'
import SectionHeader from '../../components/SectionHeader'
import ScannerWorkflow from '../../components/scanner/ScannerWorkflow'
import './refund-page.css'

type RefundQueueFilter = 'ALL' | 'COMPLETED' | 'RETURNED'
type RefundWarrantyState = {
  state: 'ACTIVE' | 'EXPIRED' | 'NO_WARRANTY' | 'NOT_RECORDED'
  refundable: boolean
  label: string
  detail: string
}

function refundWarrantyState(trade: Trade): RefundWarrantyState {
  if (trade.warrantyDays === undefined || trade.warrantyDays === null) {
    return { state: 'NOT_RECORDED', refundable: true, label: 'Warranty not recorded', detail: 'This is an older sale. A manager can review it manually.' }
  }
  if (trade.warrantyDays <= 0) {
    return { state: 'NO_WARRANTY', refundable: false, label: 'Not refundable', detail: 'This sale was recorded with 0 warranty days.' }
  }

  const soldAt = new Date(trade.createdAt).getTime()
  const savedExpiry = trade.warrantyExpiresAt ? new Date(trade.warrantyExpiresAt).getTime() : Number.NaN
  const expiresAt = Number.isFinite(savedExpiry) ? savedExpiry : soldAt + trade.warrantyDays * 86_400_000
  if (!Number.isFinite(expiresAt)) {
    return { state: 'NOT_RECORDED', refundable: true, label: 'Warranty not recorded', detail: 'The warranty date is unavailable. Review this sale manually.' }
  }

  if (expiresAt < Date.now()) {
    return { state: 'EXPIRED', refundable: false, label: 'Warranty expired', detail: `Expired ${dateText(new Date(expiresAt).toISOString())}.` }
  }
  const daysLeft = Math.max(1, Math.ceil((expiresAt - Date.now()) / 86_400_000))
  return { state: 'ACTIVE', refundable: true, label: `Refundable · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`, detail: `${trade.warrantyDays}-day warranty ends ${dateText(new Date(expiresAt).toISOString())}.` }
}

function RefundStatusBadge({ status }: { status: Trade['status'] }) {
  const refunded = status === 'RETURNED'
  const Icon = refunded ? BadgeCheck : RefreshCcw
  return <span className={`refund-status ${refunded ? 'refund-status-refunded' : 'refund-status-open'}`}><Icon size={14} aria-hidden="true" />{refunded ? 'Refunded' : 'Not refunded'}</span>
}

function RefundScannerModal({ onClose, onLookup }: { onClose: () => void; onLookup: (value: string) => boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    document.body.classList.add('operation-modal-open')
    return () => {
      document.body.classList.remove('operation-modal-open')
      if (dialog.open) dialog.close()
    }
  }, [])

  function findSale(value: string) {
    setError('')
    if (!onLookup(value)) setError('No sale matched that code. Scan the sale receipt barcode or enter its sale number.')
  }

  return <dialog ref={dialogRef} className="refund-scanner-modal" aria-labelledby="refund-scanner-title" onCancel={(event) => { event.preventDefault(); onClose() }}>
    <header className="refund-scanner-header">
      <span className="refund-scanner-icon"><ScanLine size={20} aria-hidden="true" /></span>
      <div><span>Refund lookup</span><h2 id="refund-scanner-title">Scan receipt</h2><p>Scan the sale barcode or enter the sale number to open its refund record.</p></div>
      <button type="button" className="refund-scanner-close" onClick={onClose} aria-label="Close receipt scanner"><X size={18} /></button>
    </header>
    {error && <p className="refund-scanner-error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</p>}
    <ScannerWorkflow
      code={code}
      onCodeChange={(value) => { setCode(value); if (error) setError('') }}
      onSubmit={findSale}
      onCameraError={setError}
      introTitle="Choose how to scan"
      introDescription="Use a handheld scanner for the fastest lookup, or open this device camera."
      methodTitle="Sale receipt barcode"
      methodDescription="Keep this field selected, then scan the receipt."
      inputLabel="Sale receipt barcode or number"
      placeholder="Scan or enter sale number"
      submitLabel="Find sale"
      helpText="Works with the barcode printed on sale receipts. Most handheld scanners press Enter automatically."
      readerId="phoneflow-refund-barcode-reader"
      className="refund-scanner-workflow"
    />
  </dialog>
}

export default function RefundsView({ user }: { user: SessionUser }) {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<RefundQueueFilter>('COMPLETED')
  const [selectedId, setSelectedId] = useState('')
  const [reason, setReason] = useState('')
  const [inventoryDisposition, setInventoryDisposition] = useState<'' | 'RESTOCK' | 'NO_RESTOCK'>('')
  const [confirmation, setConfirmation] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [completedTradeNo, setCompletedTradeNo] = useState('')
  const [refundSuccess, setRefundSuccess] = useState<Trade | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [mobileRefundStep, setMobileRefundStep] = useState<'queue' | 'review'>('queue')
  const selectedRefundRowRef = useRef<HTMLButtonElement>(null)
  const hasAccess = user.role === 'OWNER' || user.role === 'MANAGER'

  useEffect(() => {
    if (!hasAccess) {
      setLoading(false)
      return
    }
    api<{ trades: Trade[] }>('/refunds')
      .then((result) => {
        const items = Array.isArray(result?.trades) ? result.trades : []
        setTrades(items)
        setSelectedId((current) => current || items.find((trade) => trade.status === 'COMPLETED')?._id || items[0]?._id || '')
      })
      .catch((error: Error) => setLoadError(error.message))
      .finally(() => setLoading(false))
  }, [hasAccess])

  useEffect(() => {
    setReason('')
    setInventoryDisposition('')
    setConfirmation('')
    setActionError('')
    setCompletedTradeNo('')
  }, [selectedId])

  const openCount = trades.filter((trade) => trade.status === 'COMPLETED').length
  const eligibleCount = trades.filter((trade) => trade.status === 'COMPLETED' && refundWarrantyState(trade).refundable).length
  const refundedCount = trades.filter((trade) => trade.status === 'RETURNED').length
  const filteredTrades = useMemo(() => {
    const query = search.trim().toLowerCase()
    return trades.filter((trade) => {
      if (filter !== 'ALL' && trade.status !== filter) return false
      if (!query) return true
      return [
        trade.tradeNo,
        tradePartyName(trade),
        tradePartyPhone(trade),
        trade.items.map((item) => item.name).join(' '),
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query))
    })
  }, [filter, search, trades])
  const selectedTrade = trades.find((trade) => trade._id === selectedId)
  const selectedWarranty = selectedTrade ? refundWarrantyState(selectedTrade) : null
  const queueHeading = filter === 'COMPLETED' ? 'Not refunded' : filter === 'RETURNED' ? 'Refunded' : 'All sales'
  const canSubmit = Boolean(
    selectedTrade
    && selectedTrade.status === 'COMPLETED'
    && selectedWarranty?.refundable
    && reason.trim().length >= 5
    && inventoryDisposition
    && confirmation === selectedTrade.tradeNo
    && !actionBusy,
  )

  function openTradeFromCode(value: string) {
    const code = value.trim().toUpperCase()
    const match = trades.find((trade) => trade.tradeNo.toUpperCase() === code)
    if (!match) return false
    setSearch(match.tradeNo)
    setFilter(match.status === 'RETURNED' ? 'RETURNED' : 'COMPLETED')
    setSelectedId(match._id)
    setMobileRefundStep('review')
    setScannerOpen(false)
    return true
  }

  async function recordRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedTrade || !canSubmit) return
    setActionBusy(true)
    setActionError('')
    try {
      const result = await api<{ trade: Trade }>(`/trades/${encodeURIComponent(selectedTrade._id)}/refund`, {
        method: 'POST',
        body: JSON.stringify({
          reason,
          inventoryDisposition,
          confirmation,
        }),
      })
      setTrades((current) => current.map((trade) => trade._id === result.trade._id ? result.trade : trade))
      setCompletedTradeNo(result.trade.tradeNo)
      setRefundSuccess(result.trade)
      setFilter('RETURNED')
      setReason('')
      setInventoryDisposition('')
      setConfirmation('')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The refund was not recorded. Review the sale and try again.')
    } finally {
      setActionBusy(false)
    }
  }

  useEffect(() => {
    if (!completedTradeNo || filter !== 'RETURNED') return
    const frame = window.requestAnimationFrame(() => selectedRefundRowRef.current?.scrollIntoView({ block: 'nearest' }))
    return () => window.cancelAnimationFrame(frame)
  }, [completedTradeNo, filter])

  if (!hasAccess) {
    return (
      <>
        <SectionHeader title="Refunds" description="Only owners and managers can review or record refunds." />
        <article className="surface-card refund-access-message">
          <AlertTriangle size={20} />
          <div><h3>Manager access required</h3><p>Ask an owner or manager to open this page and review the sale.</p></div>
        </article>
      </>
    )
  }

  return (
    <section className="refund-page" aria-label="Refunds">
      <SectionHeader
        title="Refunds"
        description={loadError || 'Review a completed sale, return the customer’s money, and decide whether inspected items go back to stock.'}
        className="refund-page-heading"
        action={<div className="refund-counts" aria-label="Refund queue totals"><span><strong>{eligibleCount}</strong> ready</span><span><strong>{refundedCount}</strong> refunded</span></div>}
      />

      <div className="refund-toolbar surface-card">
        <div className="refund-search-tools"><label className="refund-search"><span className="sr-only">Scan a sale barcode or search sales</span><Search size={17} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          openTradeFromCode(event.currentTarget.value)
        }} placeholder="Search receipt, customer, phone, or item" autoComplete="off" /></label><button type="button" className="secondary-button refund-scan-trigger" onClick={() => setScannerOpen(true)}><ScanLine size={17} aria-hidden="true" /><span>Scan receipt</span></button></div>
        <div className="refund-filters" aria-label="Filter refund queue">
          {([
            ['COMPLETED', 'Not refunded', openCount],
            ['RETURNED', 'Refunded', refundedCount],
            ['ALL', 'All', trades.length],
          ] as [RefundQueueFilter, string, number][]).map(([value, label, count]) => (
            <button key={value} type="button" className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}><span>{label}</span><strong>{count}</strong></button>
          ))}
        </div>
      </div>

      {scannerOpen && <RefundScannerModal onClose={() => setScannerOpen(false)} onLookup={openTradeFromCode} />}

      <div className={`refund-workbench ${mobileRefundStep === 'review' ? 'refund-workbench-reviewing' : 'refund-workbench-choosing'}`}>
        <aside className="surface-card refund-queue" aria-label="Sale refund queue">
          <p className="refund-mobile-step"><span>Step 1 of 2</span>Select a sale to review</p>
          <header><h3>{queueHeading}</h3><span>{filteredTrades.length} sale{filteredTrades.length === 1 ? '' : 's'}</span></header>
          <div className="refund-queue-list">
            {loading && <LoadingState compact label="Loading refundable sales" detail="Reading completed and refunded transactions…" />}
            {!loading && filteredTrades.map((trade) => {
              const warranty = refundWarrantyState(trade)
              const WarrantyIcon = warranty.refundable ? ShieldCheck : ShieldX
              return (
                <button ref={selectedId === trade._id ? selectedRefundRowRef : undefined} key={trade._id} type="button" className={`refund-queue-item ${trade.status === 'RETURNED' ? 'refund-queue-item-refunded' : 'refund-queue-item-open'} ${selectedId === trade._id ? 'active' : ''}`} onClick={() => { setSelectedId(trade._id); setMobileRefundStep('review') }} aria-pressed={selectedId === trade._id}>
                  <span className="refund-queue-item-top"><strong>{trade.tradeNo}</strong><RefundStatusBadge status={trade.status} /></span>
                  <span className="refund-queue-party">{tradePartyName(trade)}</span>
                  <span className="refund-queue-items">{trade.items.map((item) => `${item.name} ×${item.quantity}`).join(', ')}</span>
                  <span className={`refund-warranty-label refund-warranty-${warranty.state.toLowerCase().replace('_', '-')}`}><WarrantyIcon size={12} aria-hidden="true" />{warranty.label}</span>
                  <span className="refund-queue-item-bottom"><small>{trade.status === 'RETURNED' && trade.refund ? `Refunded ${dateText(trade.refund.refundedAt)} · ${trade.refund.refundedBy?.name || 'manager'}` : `Sold ${dateText(trade.createdAt)}`}</small><strong>{tradeTransactionMoney(trade, trade.transactionAmountPaid, trade.amountPaid)}</strong></span>
                </button>
              )
            })}
            {!loading && filteredTrades.length === 0 && <div className="refund-empty"><RefreshCcw size={22} /><strong>No sales match this view</strong><p>Change the filter or search terms to see other sales.</p></div>}
          </div>
        </aside>

        <article className="surface-card refund-review" aria-live="polite">
          {!selectedTrade && !loading && <div className="refund-empty refund-review-empty"><Search size={24} /><strong>Select a sale to review</strong><p>Choose a receipt from the queue before recording a refund.</p></div>}
          {selectedTrade && (
            <>
              <header className="refund-review-header">
                <button type="button" className="refund-mobile-back" onClick={() => setMobileRefundStep('queue')}><ArrowLeft size={15} /> Change sale</button>
                <div><h3>{selectedTrade.tradeNo}</h3><p>{tradePartyName(selectedTrade)} · {dateText(selectedTrade.createdAt)}</p></div>
                <RefundStatusBadge status={selectedTrade.status} />
              </header>

              {selectedTrade.status === 'RETURNED' && selectedTrade.refund ? (
                <section className="refund-complete" role="status">
                  <span><BadgeCheck size={20} /></span>
                  <div>
                    <h4>{completedTradeNo === selectedTrade.tradeNo ? 'Refund recorded successfully' : 'Refund already recorded'}</h4>
                    <p>{selectedTrade.refund.reason}</p>
                    <dl><div><dt>Stock</dt><dd>{selectedTrade.refund.inventoryDisposition === 'RESTOCK' ? 'Restored to available stock' : 'Not returned to saleable stock'}</dd></div><div><dt>Recorded</dt><dd>{dateText(selectedTrade.refund.refundedAt)} by {selectedTrade.refund.refundedBy?.name || 'manager'}</dd></div></dl>
                  </div>
                </section>
              ) : selectedWarranty && !selectedWarranty.refundable ? (
                <section className={`refund-warranty-blocked refund-warranty-${selectedWarranty.state.toLowerCase().replace('_', '-')}`} role="status">
                  <span><ShieldX size={22} aria-hidden="true" /></span>
                  <div><h4>{selectedWarranty.label}</h4><p>{selectedWarranty.detail}</p><small>A refund cannot be recorded for this sale.</small></div>
                </section>
              ) : (
                <form className="refund-form" onSubmit={recordRefund}>
                  <section className="refund-decision" aria-labelledby="refund-decision-title">
                    <header className="refund-decision-header">
                      <div><span>Refund decision</span><h4 id="refund-decision-title">Refund {tradeTransactionMoney(selectedTrade, selectedTrade.transactionAmountPaid, selectedTrade.amountPaid)}</h4><p>Return this amount by {titleStatus(selectedTrade.paymentMethod)} after reviewing the sale.</p></div>
                      {selectedWarranty && <span className={`refund-review-tag refund-warranty-${selectedWarranty.state.toLowerCase().replace('_', '-')}`}><ShieldCheck size={15} aria-hidden="true" />{selectedWarranty.label}</span>}
                    </header>
                    <div className="refund-form-fields">
                      <label><span>Refund reason</span><input required aria-required="true" minLength={5} maxLength={160} value={reason} aria-invalid={reason.length > 0 && reason.trim().length < 5} aria-describedby="refund-reason-help" onChange={(event) => setReason(event.target.value)} placeholder="Example: Item is faulty" autoComplete="off" /><small id="refund-reason-help">{reason.length > 0 && reason.trim().length < 5 ? 'Enter at least 5 characters so the reason is clear.' : 'Keep the reason short and specific for the audit history.'}</small></label>
                      <label><span>Returned inventory</span><select required value={inventoryDisposition} onChange={(event) => setInventoryDisposition(event.target.value as '' | 'RESTOCK' | 'NO_RESTOCK')}><option value="" disabled>Choose after inspecting every item</option><option value="RESTOCK">Restore all items to available stock</option><option value="NO_RESTOCK">Do not return items to saleable stock</option></select><small>Restore stock only when every item is present and resaleable.</small></label>
                    </div>
                    <label className="refund-confirm"><span>Confirm receipt</span><input required autoComplete="off" value={confirmation} aria-invalid={confirmation.length > 0 && confirmation !== selectedTrade.tradeNo} onChange={(event) => setConfirmation(event.target.value)} placeholder={`Type ${selectedTrade.tradeNo}`} /><small>Type the receipt number to prevent recording against the wrong sale.</small></label>
                    {actionError && <p className="refund-error" role="alert"><AlertTriangle size={16} /> {actionError}</p>}
                    <footer><button type="button" className="ghost-button" onClick={() => { setReason(''); setInventoryDisposition(''); setConfirmation(''); setActionError('') }} disabled={actionBusy}>Clear</button><button type="submit" className="primary-button danger-button" disabled={!canSubmit}>{actionBusy ? 'Recording refund…' : 'Record full refund'}</button></footer>
                  </section>
                </form>
              )}

              <details className="refund-sale-details">
                <summary><span><strong>Review sale details</strong><small>{selectedTrade.items.length} item{selectedTrade.items.length === 1 ? '' : 's'} · {tradeTransactionMoney(selectedTrade, selectedTrade.transactionTotal, selectedTrade.total)}</small></span><span>Inspect items &amp; history</span></summary>
                <div className="refund-sale-details-content">
                  <dl className="refund-summary">
                    <div><dt>Refund amount</dt><dd>{tradeTransactionMoney(selectedTrade, selectedTrade.transactionAmountPaid, selectedTrade.amountPaid)}</dd></div>
                    <div><dt>Payment recorded</dt><dd>{titleStatus(selectedTrade.paymentMethod)}</dd></div>
                    <div><dt>Sale total</dt><dd>{tradeTransactionMoney(selectedTrade, selectedTrade.transactionTotal, selectedTrade.total)}</dd></div>
                    <div><dt>Recorded by</dt><dd>{selectedTrade.createdBy?.name || 'Staff member'}</dd></div>
                    <div><dt>Warranty</dt><dd>{selectedWarranty?.label || 'Not recorded'}</dd></div>
                    <div><dt>Warranty status</dt><dd>{selectedWarranty?.detail || 'Review manually'}</dd></div>
                  </dl>
                  <section className="refund-items" aria-labelledby="refund-items-title">
                    <h4 id="refund-items-title">Items in this sale</h4>
                    {selectedTrade.items.map((item, index) => (
                      <div key={`${item.name}-${index}`}><span><strong>{item.name}</strong><small>Quantity {item.quantity}</small></span><strong>{tradeTransactionMoney(selectedTrade, item.originalUnitPrice === undefined ? undefined : item.originalUnitPrice * item.quantity, item.unitPrice * item.quantity)}</strong></div>
                    ))}
                  </section>
                  {selectedWarranty && <aside className={`refund-record-only refund-warranty-note refund-warranty-${selectedWarranty.state.toLowerCase().replace('_', '-')}`}><ShieldCheck size={18} aria-hidden="true" /><p><strong>{selectedWarranty.label}</strong><span>{selectedWarranty.detail}</span><small>Inspect the returned items before restoring them to saleable stock. PhoneFlow records the refund and stock change; return {tradeTransactionMoney(selectedTrade, selectedTrade.transactionAmountPaid, selectedTrade.amountPaid)} using your shop’s current process.</small></p></aside>}
                </div>
              </details>
            </>
          )}
        </article>
      </div>

      {refundSuccess?.refund && <div className="refund-success-backdrop" role="presentation">
        <section className="refund-success-modal" role="dialog" aria-modal="true" aria-labelledby="refund-success-title" aria-describedby="refund-success-description">
          <button type="button" className="refund-success-close" onClick={() => setRefundSuccess(null)} aria-label="Close refund confirmation"><X size={18} /></button>
          <span className="refund-success-icon"><BadgeCheck size={31} /></span>
          <span className="eyebrow">Refund recorded</span>
          <h3 id="refund-success-title">{refundSuccess.tradeNo} refunded</h3>
          <p id="refund-success-description">The refund is saved and the sale has been moved to the refunded records.</p>
          <dl>
            <div><dt>Amount</dt><dd>{tradeTransactionMoney(refundSuccess, refundSuccess.refund.amount, refundSuccess.refund.amount)}</dd></div>
            <div><dt>Inventory</dt><dd>{refundSuccess.refund.inventoryDisposition === 'RESTOCK' ? 'Restocked' : 'Not restocked'}</dd></div>
          </dl>
          <div className="refund-success-actions">
            <button type="button" className="secondary-button" onClick={() => {
              const { tradeNo, currency } = refundSuccess
              setRefundSuccess(null)
              window.setTimeout(() => window.dispatchEvent(new CustomEvent('phoneflow:open-refund-receipt', { detail: { reference: tradeNo, currency } })), 0)
            }}><Printer size={16} /> Print receipt</button>
            <button type="button" className="primary-button" onClick={() => setRefundSuccess(null)}><BadgeCheck size={16} /> Done</button>
          </div>
        </section>
      </div>}
    </section>
  )
}

const categoryMeta: Record<InventoryItem['category'], { label: string; tone: 'violet' | 'blue' | 'orange'; Icon: LucideIcon; fallback: string }> = {
  PHONE: { label: 'Phones', tone: 'violet', Icon: Smartphone, fallback: 'Phone' },
  TABLET: { label: 'Tablets', tone: 'violet', Icon: Smartphone, fallback: 'Tab' },
  ACCESSORY: { label: 'Accessories', tone: 'blue', Icon: Package, fallback: 'Acc' },
  SPARE_PART: { label: 'Spare parts', tone: 'orange', Icon: Wrench, fallback: 'Part' },
  OTHER: { label: 'Other', tone: 'blue', Icon: Package, fallback: 'Item' },
}
