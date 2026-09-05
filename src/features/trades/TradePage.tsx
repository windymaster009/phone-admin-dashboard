import { useEffect, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Banknote, ChevronDown, FileText, MoreHorizontal, Plus, RefreshCcw, ShoppingCart, Type, WalletCards, X } from 'lucide-react'
import { api } from '../../lib/api'
import type { Customer, Trade } from '../../types/domain'
import { money, tradePartyName, tradePartyPhone, tradeTransactionMoney, dateText, titleStatus, comingNext } from '../../lib/presentation'
import LoadingState from '../../components/LoadingState'
import SectionHeader from '../../components/SectionHeader'
import StatusBadge from '../../components/StatusBadge'

export default function TradeView() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null)
  const [error, setError] = useState('')
  const [transactionsCollapsed, setTransactionsCollapsed] = useState(() => window.matchMedia('(max-width: 640px)').matches)

  useEffect(() => {
    api<{ trades: Trade[] }>('/trades')
      .then((result) => setTrades(result.trades))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [])

  function exportTrades() {
    const headers = ['Reference', 'Type', 'Customer', 'Items', 'Subtotal', 'Discount', 'Total', 'Paid', 'Balance', 'Payment', 'Status', 'Date']
    const rows = trades.map((trade) => [
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
            {!transactionsCollapsed && <button className="ghost-button trade-export-button" onClick={exportTrades} disabled={trades.length === 0} aria-label="Export transactions as CSV"><FileText size={15} /><span>Export</span></button>}
            <button className="ghost-button transaction-collapse-button" type="button" onClick={() => setTransactionsCollapsed((value) => !value)} aria-expanded={!transactionsCollapsed} aria-label={transactionsCollapsed ? 'Expand recent transactions' : 'Collapse recent transactions'}><ChevronDown size={17} /></button>
          </div>
        </div>
        {!transactionsCollapsed && <div className="transaction-list">
          {trades.map((transaction) => (
            <div className="transaction-row" key={transaction._id}>
              <span className={`transaction-icon ${transaction.type === 'SELL' ? 'sale' : 'purchase'}`}>{transaction.type === 'SELL' ? <ArrowUpRight /> : <ArrowDownRight />}</span>
              <p><strong>{transaction.items.map((item) => `${item.name} x${item.quantity}`).join(', ')}</strong><small>{transaction.tradeNo} - {tradePartyName(transaction)} - {dateText(transaction.purchaseDate || transaction.createdAt)}</small></p>
              <StatusBadge status={transaction.type === 'SELL' ? 'Sale' : 'Purchase'} />
              <strong className={transaction.type === 'SELL' ? 'money-in' : 'money-out'}>{transaction.type === 'SELL' ? '+' : '-'}{tradeTransactionMoney(transaction, transaction.transactionTotal, transaction.total)}</strong>
              <button className="icon-button" onClick={() => setSelectedTrade(transaction)} aria-label={`View ${transaction.tradeNo}`}><MoreHorizontal size={18} /></button>
            </div>
          ))}
          {loading && <LoadingState compact label="Loading transactions" detail="Reading recent purchases and sales…" />}
          {!loading && trades.length === 0 && <div className="transaction-row"><p><strong>No transactions yet</strong><small>Create a buy or sell transaction to see it here.</small></p></div>}
        </div>}
      </article>
      {selectedTrade && (
        <div className="modal-backdrop" role="presentation">
          <section className="detail-modal trade-detail-modal surface-card" role="dialog" aria-modal="true" aria-labelledby="trade-detail-title" onClick={(event) => event.stopPropagation()}>
            <header className="detail-modal-header">
              <div>
                <span className="eyebrow">{selectedTrade.type === 'SELL' ? 'Sale transaction' : 'Purchase transaction'}</span>
                <h3 id="trade-detail-title">{selectedTrade.tradeNo}</h3>
                <p>{tradePartyName(selectedTrade)} - {dateText(selectedTrade.purchaseDate || selectedTrade.createdAt)}</p>
              </div>
              <button className="icon-button" onClick={() => setSelectedTrade(null)} aria-label="Close details"><X size={18} /></button>
            </header>

            <div className="detail-grid">
              <div><span>Type</span><strong>{selectedTrade.type === 'SELL' ? 'Sale' : 'Purchase'}</strong></div>
              <div><span>{selectedTrade.type === 'BUY' ? 'Payment status' : 'Status'}</span><strong><StatusBadge status={selectedTrade.type === 'BUY' ? selectedTrade.paymentStatus || selectedTrade.status : selectedTrade.status} /></strong></div>
              <div><span>Payment</span><strong>{titleStatus(selectedTrade.paymentMethod)}</strong></div>
              <div><span>Date</span><strong>{dateText(selectedTrade.createdAt)}</strong></div>
              <div><span>Subtotal</span><strong>{tradeTransactionMoney(selectedTrade, selectedTrade.transactionSubtotal, selectedTrade.subtotal)}</strong></div>
              <div><span>Discount</span><strong>{money.format(selectedTrade.discount)}</strong></div>
              <div><span>Amount paid</span><strong>{tradeTransactionMoney(selectedTrade, selectedTrade.transactionAmountPaid, selectedTrade.amountPaid)}</strong></div>
              <div><span>Balance</span><strong>{tradeTransactionMoney(selectedTrade, selectedTrade.transactionBalance, selectedTrade.balance)}</strong></div>
            </div>

            <div className="detail-sections">
              <article>
                <span className="eyebrow">{selectedTrade.type === 'BUY' ? 'Seller' : 'Customer'}</span>
                <p><strong>{tradePartyName(selectedTrade)}</strong></p>
                <p>{tradePartyPhone(selectedTrade) || 'No phone recorded'}</p>
              </article>
              <article>
                <span className="eyebrow">Total</span>
                <p><strong>{selectedTrade.type === 'SELL' ? '+' : '-'}{tradeTransactionMoney(selectedTrade, selectedTrade.transactionTotal, selectedTrade.total)}</strong></p>
                <p>{selectedTrade.items.length} line item{selectedTrade.items.length === 1 ? '' : 's'}</p>
              </article>
            </div>

            <div className="detail-lines">
              <span className="eyebrow">Items</span>
              {selectedTrade.items.map((item, index) => (
                <div className="detail-line" key={`${item.name}-${index}`}>
                  <p><strong>{item.name}</strong><small>Quantity {item.quantity}</small></p>
                  <strong>{tradeTransactionMoney(selectedTrade, item.originalUnitPrice === undefined ? undefined : item.originalUnitPrice * item.quantity, item.unitPrice * item.quantity)}</strong>
                </div>
              ))}
            </div>

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

            <footer className="detail-modal-footer">
              <button className="ghost-button" onClick={() => setSelectedTrade(null)}>Close</button>
            </footer>
          </section>
        </div>
      )}
    </>
  )
}


