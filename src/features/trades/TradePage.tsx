import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowDownRight, ArrowUpRight, Banknote, ChevronDown, FileText, MoreHorizontal, Pencil, Plus, RefreshCcw, Search, ShoppingCart, WalletCards } from 'lucide-react'
import { api, getSessionUser } from '../../lib/api'
import type { Trade } from '../../types/domain'
import { money, tradePartyName, tradePartyPhone, tradeTransactionMoney, dateText, titleStatus, comingNext } from '../../lib/presentation'
import LoadingState from '../../components/LoadingState'
import SectionHeader from '../../components/SectionHeader'
import StatusBadge from '../../components/StatusBadge'
import DetailModalShell from '../../components/DetailModalShell'
import DetailModalHeader from '../../components/DetailModalHeader'
import DetailModalBody from '../../components/DetailModalBody'
import DetailModalFooter from '../../components/DetailModalFooter'
import WarrantyPeriodField from '../../components/WarrantyPeriodField'
import './trade-page.css'

function tradeSignedTotal(trade: Trade) {
  const amount = trade.transactionTotal ?? trade.total ?? 0
  const formatted = tradeTransactionMoney(trade, trade.transactionTotal, trade.total)
  if (Number(amount) === 0 || formatted === '$0' || formatted === '$0.00' || formatted === '0 KHR') {
    return formatted.replace(/^[+-]/, '')
  }
  return `${trade.type === 'SELL' ? '+' : '-'}${formatted}`
}

function dateTimeText(value: string) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function warrantyText(trade: Trade) {
  const days = Number(trade.warrantyDays || 0)
  return days > 0 ? `${days} day${days === 1 ? '' : 's'}` : 'No warranty'
}

type TradeTypeFilter = 'ALL' | 'SELL' | 'BUY'
type TradeStatusFilter = 'ALL' | 'COMPLETED' | 'RETURNED' | 'CANCELLED'

export default function TradeView() {
  const sessionUser = getSessionUser()
  const canCorrectSale = sessionUser?.role === 'OWNER' || sessionUser?.role === 'MANAGER'
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null)
  const [error, setError] = useState('')
  const [transactionSearch, setTransactionSearch] = useState('')
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<TradeTypeFilter>('ALL')
  const [transactionStatusFilter, setTransactionStatusFilter] = useState<TradeStatusFilter>('ALL')
  const [editingCorrection, setEditingCorrection] = useState(false)
  const [correctionWarrantyDays, setCorrectionWarrantyDays] = useState('0')
  const [correctionNotes, setCorrectionNotes] = useState('')
  const [correctionReason, setCorrectionReason] = useState('')
  const [correctionError, setCorrectionError] = useState('')
  const [correctionBusy, setCorrectionBusy] = useState(false)
  const [transactionsCollapsed, setTransactionsCollapsed] = useState(() => window.matchMedia('(max-width: 640px)').matches)
  const loadSequence = useRef(0)

  const loadTrades = useCallback(async (showLoading = false) => {
    const sequence = ++loadSequence.current
    if (showLoading) setLoading(true)
    try {
      const result = await api<{ trades: Trade[] }>('/trades', {}, { deduplicate: false })
      if (sequence !== loadSequence.current) return
      const items = Array.isArray(result?.trades) ? result.trades : []
      setTrades(items)
      const requestedId = new URLSearchParams(window.location.search).get('openTrade')
      if (requestedId) {
        const requestedTrade = items.find((trade) => trade._id === requestedId)
        if (requestedTrade) setSelectedTrade(requestedTrade)
      }
      setError('')
    } catch (reason) {
      if (sequence === loadSequence.current) setError(reason instanceof Error ? reason.message : 'Unable to load transactions')
    } finally {
      if (sequence === loadSequence.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTrades(true)
    const refreshTrades = () => void loadTrades(false)
    window.addEventListener('phoneflow:trades-updated', refreshTrades)
    return () => window.removeEventListener('phoneflow:trades-updated', refreshTrades)
  }, [loadTrades])

  useEffect(() => {
    const openTrade = (event: Event) => {
      const id = String((event as CustomEvent<{ id?: string }>).detail?.id || '')
      const match = trades.find((trade) => trade._id === id)
      if (match) setSelectedTrade(match)
    }
    window.addEventListener('phoneflow:open-trade-detail', openTrade)
    return () => window.removeEventListener('phoneflow:open-trade-detail', openTrade)
  }, [trades])

  const filteredTrades = useMemo(() => {
    const tokens = transactionSearch.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
    return trades.filter((trade) => {
      if (transactionTypeFilter !== 'ALL' && trade.type !== transactionTypeFilter) return false
      if (transactionStatusFilter !== 'ALL' && trade.status !== transactionStatusFilter) return false
      if (tokens.length === 0) return true
      const searchable = [
        trade.tradeNo,
        trade.type,
        trade.status,
        trade.paymentMethod,
        tradePartyName(trade),
        tradePartyPhone(trade),
        trade.notes,
        ...trade.items.flatMap((item) => [
          item.name,
          item.inventoryItem?.sku,
          item.inventoryItem?.barcode,
          item.inventoryItem?.imei1,
          item.inventoryItem?.imei2,
          item.inventoryItem?.serialNumber,
        ]),
      ].filter(Boolean).join(' ').toLocaleLowerCase()
      return tokens.every((token) => searchable.includes(token))
    })
  }, [trades, transactionSearch, transactionTypeFilter, transactionStatusFilter])

  function closeTradeDetail() {
    if (correctionBusy) return
    setSelectedTrade(null)
    setEditingCorrection(false)
    setCorrectionError('')
    const url = new URL(window.location.href)
    if (url.searchParams.has('openTrade')) {
      url.searchParams.delete('openTrade')
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    }
  }

  function openCorrection() {
    if (!selectedTrade || selectedTrade.type !== 'SELL') return
    setCorrectionWarrantyDays(String(Number(selectedTrade.warrantyDays || 0)))
    setCorrectionNotes(selectedTrade.notes || '')
    setCorrectionReason('')
    setCorrectionError('')
    setEditingCorrection(true)
  }

  function cancelCorrection() {
    if (correctionBusy) return
    setEditingCorrection(false)
    setCorrectionError('')
  }

  async function saveCorrection(event: FormEvent) {
    event.preventDefault()
    if (!selectedTrade || correctionBusy) return
    const warrantyDays = Number(correctionWarrantyDays)
    if (!Number.isInteger(warrantyDays) || warrantyDays < 0 || warrantyDays > 3650) {
      setCorrectionError('Warranty days must be a whole number from 0 to 3650')
      return
    }
    if (correctionReason.trim().length < 3) {
      setCorrectionError('Enter a correction reason')
      return
    }
    setCorrectionBusy(true)
    setCorrectionError('')
    try {
      const result = await api<{ trade: Trade }>(`/trades/${selectedTrade._id}/correction`, {
        method: 'PATCH',
        body: JSON.stringify({ warrantyDays, notes: correctionNotes, correctionReason }),
      })
      setTrades((current) => current.map((trade) => trade._id === result.trade._id ? result.trade : trade))
      setSelectedTrade(result.trade)
      setEditingCorrection(false)
    } catch (reason) {
      setCorrectionError(reason instanceof Error ? reason.message : 'Unable to correct this sale')
    } finally {
      setCorrectionBusy(false)
    }
  }

  function exportTrades() {
    const headers = ['Reference', 'Type', 'Customer', 'Items', 'Subtotal', 'Discount', 'Total', 'Paid', 'Balance', 'Payment', 'Status', 'Date']
    const rows = filteredTrades.map((trade) => [
      trade.tradeNo,
      trade.type,
      tradePartyName(trade),
      trade.items.map((item) => `${item.name} x${item.quantity}`).join('; '),
      trade.subtotal,
      trade.discount,
      trade.total,
      trade.amountPaid,
      trade.balance,
      trade.paymentMethod,
      trade.status,
      new Date(trade.createdAt).toISOString(),
    ])
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `phoneflow-transactions-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="trade-page-heading">
        <SectionHeader
          eyebrow="Operations"
          title="Buy & sell"
          description={error || 'Purchase inventory from sellers and process shop sales with complete transaction history.'}
        />
      </div>
      <section className="trade-action-grid">
        <article className="surface-card trade-action buy-action">
          <span className="trade-icon"><Banknote size={28} /></span>
          <div><span className="eyebrow">Purchase inventory</span><h3>Buy products</h3><p>Record one transaction containing serialized phones or quantity-based shop stock.</p></div>
          <button className="primary-button" onClick={() => comingNext('New purchase')}><Plus size={17} /> New purchase</button>
        </article>
        <article className="surface-card trade-action sell-action">
          <span className="trade-icon"><WalletCards size={28} /></span>
          <div><span className="eyebrow">Point of sale</span><h3>Sell an item</h3><p>Select available stock, customer, discount, payment method, warranty, and print a receipt.</p></div>
          <button className="secondary-button" onClick={() => comingNext('New sale')}><ShoppingCart size={17} /> New sale</button>
        </article>
      </section>
      <article className={`surface-card table-card page-table trade-transactions-card ${transactionsCollapsed ? 'collapsed' : ''}`}>
        <div className="card-heading table-heading">
          <div><span className="eyebrow">Activity</span><h3>Recent transactions</h3></div>
          <div className="trade-table-actions">
            {!transactionsCollapsed && <button className="ghost-button trade-export-button" onClick={exportTrades} disabled={filteredTrades.length === 0} aria-label="Export transactions as CSV" title="Exports the currently filtered transactions"><FileText size={15} /><span>Export</span></button>}
            <button className="ghost-button transaction-collapse-button" type="button" onClick={() => setTransactionsCollapsed((value) => !value)} aria-expanded={!transactionsCollapsed} aria-label={transactionsCollapsed ? 'Expand recent transactions' : 'Collapse recent transactions'}><ChevronDown size={17} /></button>
          </div>
        </div>
        {!transactionsCollapsed && <div className="transaction-list">
          <div className="trade-transaction-toolbar">
            <label className="trade-transaction-search">
              <span className="sr-only">Search recent transactions</span>
              <Search size={16} aria-hidden="true" />
              <input value={transactionSearch} onChange={(event) => setTransactionSearch(event.target.value)} placeholder="Search receipt, product, customer, phone, SKU..." autoComplete="off" />
            </label>
            <label>
              <span className="sr-only">Filter transaction type</span>
              <select value={transactionTypeFilter} onChange={(event) => setTransactionTypeFilter(event.target.value as TradeTypeFilter)} aria-label="Filter transaction type">
                <option value="ALL">All transactions</option>
                <option value="SELL">Sales</option>
                <option value="BUY">Purchases</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Filter transaction status</span>
              <select value={transactionStatusFilter} onChange={(event) => setTransactionStatusFilter(event.target.value as TradeStatusFilter)} aria-label="Filter transaction status">
                <option value="ALL">All statuses</option>
                <option value="COMPLETED">Completed</option>
                <option value="RETURNED">Refunded</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>
            <span className="trade-transaction-count">{filteredTrades.length} of {trades.length}</span>
          </div>
          {filteredTrades.map((transaction) => (
            <div className="transaction-row" key={transaction._id}>
              <span className={`transaction-icon ${transaction.type === 'SELL' ? 'sale' : 'purchase'}`}>{transaction.type === 'SELL' ? <ArrowUpRight /> : <ArrowDownRight />}</span>
              <p><strong>{transaction.items.map((item) => `${item.name} x${item.quantity}`).join(', ')}</strong><small>{transaction.tradeNo} - {tradePartyName(transaction)} - {dateText(transaction.purchaseDate || transaction.createdAt)}</small></p>
              <StatusBadge status={transaction.type === 'SELL' ? 'Sale' : 'Purchase'} />
              <strong className={transaction.type === 'SELL' ? 'money-in' : 'money-out'}>{tradeSignedTotal(transaction)}</strong>
              <button className="icon-button" onClick={() => setSelectedTrade(transaction)} aria-label={`View ${transaction.tradeNo}`}><MoreHorizontal size={18} /></button>
            </div>
          ))}
          {loading && <LoadingState compact label="Loading transactions" detail="Reading recent purchases and sales…" />}
          {!loading && trades.length === 0 && <div className="transaction-row"><p><strong>No transactions yet</strong><small>Create a buy or sell transaction to see it here.</small></p></div>}
          {!loading && trades.length > 0 && filteredTrades.length === 0 && <div className="trade-transaction-empty"><Search size={20} /><strong>No transactions match</strong><small>Change the search or filters to see other records.</small></div>}
        </div>}
      </article>
      {selectedTrade && (
        <DetailModalShell
          onClose={closeTradeDetail}
          titleId="trade-detail-title"
          className={`trade-detail-modal ${editingCorrection ? 'trade-correction-mode' : ''}`}
        >
          <DetailModalHeader
            eyebrow={editingCorrection ? 'Controlled correction' : selectedTrade.type === 'SELL' ? 'Sale transaction' : 'Purchase transaction'}
            title={selectedTrade.tradeNo}
            titleId="trade-detail-title"
            description={editingCorrection ? 'Only warranty and sale notes can be changed.' : `${tradePartyName(selectedTrade)} - ${dateTimeText(selectedTrade.purchaseDate || selectedTrade.createdAt)}`}
            onClose={closeTradeDetail}
            closeLabel="Close details"
          />

          {editingCorrection ? <form className="trade-correction-form" onSubmit={saveCorrection}>
            <DetailModalBody className="trade-correction-body">
              <div className="trade-correction-lock-note">
                <strong>Financial and stock details stay locked</strong>
                <p>Products, quantities, prices, payment, customer, currency, and transaction date cannot be changed here.</p>
              </div>
              {correctionError && <div className="trade-correction-error" role="alert">{correctionError}</div>}
              <WarrantyPeriodField value={correctionWarrantyDays} onChange={setCorrectionWarrantyDays} kind="sale" />
              <label className="trade-correction-field">
                <span>Sale notes <small>Optional</small></span>
                <textarea maxLength={1000} value={correctionNotes} onChange={(event) => setCorrectionNotes(event.target.value)} placeholder="Notes shown on the corrected receipt" />
              </label>
              <label className="trade-correction-field">
                <span>Correction reason <small>Required · audit history only</small></span>
                <textarea required minLength={3} maxLength={500} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="Example: Warranty was omitted during checkout" />
              </label>
            </DetailModalBody>
            <DetailModalFooter
              transactionActions={<button className="primary-button" type="submit" disabled={correctionBusy}>{correctionBusy ? 'Saving...' : 'Save correction'}</button>}
              dismissAction={<button className="ghost-button" type="button" onClick={cancelCorrection} disabled={correctionBusy}>Cancel</button>}
            />
          </form> : <>
          <DetailModalBody className="trade-detail-body">
            <div className="detail-grid">
              <div><span>Type</span><strong>{selectedTrade.type === 'SELL' ? 'Sale' : 'Purchase'}</strong></div>
              <div><span>{selectedTrade.type === 'BUY' ? 'Payment status' : 'Status'}</span><strong><StatusBadge status={selectedTrade.type === 'BUY' ? selectedTrade.paymentStatus || selectedTrade.status : selectedTrade.status} /></strong></div>
              <div><span>Payment</span><strong>{titleStatus(selectedTrade.paymentMethod)}</strong></div>
              <div><span>Date and time</span><strong>{dateTimeText(selectedTrade.purchaseDate || selectedTrade.createdAt)}</strong></div>
              <div><span>Currency</span><strong>{selectedTrade.currency || 'USD'}{selectedTrade.currency === 'KHR' && Number(selectedTrade.exchangeRate) > 0 ? ` · 1 USD = ${Number(selectedTrade.exchangeRate).toLocaleString()} KHR` : ''}</strong></div>
              <div><span>Payment status</span><strong>{titleStatus(selectedTrade.paymentStatus || (selectedTrade.balance > 0 ? 'PARTIAL' : 'PAID'))}</strong></div>
              <div><span>Subtotal</span><strong>{tradeTransactionMoney(selectedTrade, selectedTrade.transactionSubtotal, selectedTrade.subtotal)}</strong></div>
              <div><span>Discount</span><strong>{tradeTransactionMoney(selectedTrade, selectedTrade.transactionSubtotal === undefined || selectedTrade.transactionTotal === undefined ? undefined : selectedTrade.transactionSubtotal - selectedTrade.transactionTotal, selectedTrade.discount)}</strong></div>
              <div><span>Total</span><strong>{tradeTransactionMoney(selectedTrade, selectedTrade.transactionTotal, selectedTrade.total)}</strong></div>
              <div><span>Amount paid</span><strong>{tradeTransactionMoney(selectedTrade, selectedTrade.transactionAmountPaid, selectedTrade.amountPaid)}</strong></div>
              <div><span>Amount received</span><strong>{tradeTransactionMoney(selectedTrade, selectedTrade.transactionAmountReceived, selectedTrade.amountReceived ?? selectedTrade.amountPaid)}</strong></div>
              <div><span>Change returned</span><strong>{tradeTransactionMoney(selectedTrade, selectedTrade.transactionChangeDue, selectedTrade.changeDue ?? 0)}</strong></div>
              <div><span>Balance</span><strong>{tradeTransactionMoney(selectedTrade, selectedTrade.transactionBalance, selectedTrade.balance)}</strong></div>
              {selectedTrade.type === 'SELL' && <div><span>Warranty</span><strong>{warrantyText(selectedTrade)}</strong></div>}
              {selectedTrade.type === 'SELL' && <div><span>Warranty expires</span><strong>{selectedTrade.warrantyExpiresAt ? dateText(selectedTrade.warrantyExpiresAt) : 'Not applicable'}</strong></div>}
              <div><span>Processed by</span><strong>{selectedTrade.createdBy?.name || 'Not recorded'}</strong></div>
            </div>

            <div className="detail-sections">
              <article>
                <span className="eyebrow">{selectedTrade.type === 'BUY' ? 'Seller' : 'Customer'}</span>
                <p><strong>{tradePartyName(selectedTrade)}</strong></p>
                <p>{tradePartyPhone(selectedTrade) || 'No phone recorded'}</p>
              </article>
              <article>
                <span className="eyebrow">Transaction summary</span>
                <p><strong>{selectedTrade.items.reduce((sum, item) => sum + item.quantity, 0)} total unit{selectedTrade.items.reduce((sum, item) => sum + item.quantity, 0) === 1 ? '' : 's'}</strong></p>
                <p>{selectedTrade.items.length} line item{selectedTrade.items.length === 1 ? '' : 's'}</p>
              </article>
            </div>

            <div className="detail-lines">
              <span className="eyebrow">Items</span>
              {selectedTrade.items.map((item, index) => (
                <div className="detail-line" key={`${item.name}-${index}`}>
                  <p>
                    <strong>{item.name}</strong>
                    <small>Quantity {item.quantity} · {tradeTransactionMoney(selectedTrade, item.originalUnitPrice, item.unitPrice)} each</small>
                    {(item.inventoryItem?.sku || item.inventoryItem?.barcode || item.inventoryItem?.imei1 || item.inventoryItem?.serialNumber) && <small>{[
                      item.inventoryItem?.sku ? `SKU ${item.inventoryItem.sku}` : '',
                      item.inventoryItem?.barcode ? `Barcode ${item.inventoryItem.barcode}` : '',
                      item.inventoryItem?.imei1 ? `IMEI ${item.inventoryItem.imei1}` : '',
                      item.inventoryItem?.serialNumber ? `Serial ${item.inventoryItem.serialNumber}` : '',
                    ].filter(Boolean).join(' · ')}</small>}
                  </p>
                  <strong>{tradeTransactionMoney(selectedTrade, item.originalUnitPrice === undefined ? undefined : item.originalUnitPrice * item.quantity, item.unitPrice * item.quantity)}</strong>
                </div>
              ))}
            </div>

            {Number(selectedTrade.correctionVersion || 0) > 0 && (
              <div className="trade-correction-history" role="status">
                <Pencil size={16} />
                <div><strong>Sale details corrected</strong><small>Revision {selectedTrade.correctionVersion}{selectedTrade.lastCorrectedAt ? ` · ${dateTimeText(selectedTrade.lastCorrectedAt)}` : ''}{selectedTrade.lastCorrectedBy?.name ? ` · ${selectedTrade.lastCorrectedBy.name}` : ''}</small></div>
              </div>
            )}

            {selectedTrade.notes && (
              <div className="detail-note">
                <span className="eyebrow">Notes</span>
                <p>{selectedTrade.notes}</p>
              </div>
            )}

            {selectedTrade.refund && (
              <div className="trade-refund-record" role="status">
                <span><RefreshCcw size={17} /></span>
                <div><strong>Refund recorded</strong><small>{tradeTransactionMoney(selectedTrade, selectedTrade.refund.amount, selectedTrade.refund.amount)} · {selectedTrade.refund.inventoryDisposition === 'RESTOCK' ? 'Items restored to stock' : 'Items not returned to saleable stock'}</small><p>{selectedTrade.refund.reason}</p></div>
              </div>
            )}
          </DetailModalBody>

          <DetailModalFooter
            utilityActions={canCorrectSale && selectedTrade.type === 'SELL' && selectedTrade.status === 'COMPLETED' ? (
              <button type="button" className="secondary-button" onClick={openCorrection}>
                <Pencil size={15} /> Correct warranty or notes
              </button>
            ) : undefined}
            dismissAction={
              <button type="button" className="ghost-button" onClick={closeTradeDetail}>
                Close
              </button>
            }
          />
          </>}
        </DetailModalShell>
      )}
    </>
  )
}
