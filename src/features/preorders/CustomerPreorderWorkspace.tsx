import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, PackageCheck, RefreshCcw, ShoppingBag } from 'lucide-react'
import { api } from '../../lib/api'
import { dateText, titleStatus } from '../../lib/presentation'
import SectionHeader from '../../components/SectionHeader'
import FilterToolbar from '../../components/FilterToolbar'
import FilterSelect from '../../components/FilterSelect'
import OperationModalShell from '../../components/OperationModalShell'
import LoadingState from '../../components/LoadingState'
import OperationActionCard from '../../components/OperationActionCard'
import RecordListRow from '../../components/RecordListRow'
import './customer-preorder-workspace.css'

type PreorderStatus = 'REQUESTED' | 'ORDERED' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED'
type Preorder = {
  _id: string; preorderNo: string; customer?: string; customerName: string; customerPhone: string
  category: string; productName: string; quantity: number; specifications?: string
  supplierName?: string; expectedAt?: string; purchaseTrade?: string; inventoryItem?: string; saleTrade?: string
  status: PreorderStatus; createdAt: string; cancellationReason?: string
  events: { action: string; note?: string; at: string }[]
}
type Customer = { _id: string; name: string; phone: string }
type TradeLine = { inventoryItem?: { _id: string; name: string; sku: string; category: string } | string; name: string; quantity: number }
type Trade = { _id: string; tradeNo: string; type: 'BUY' | 'SELL'; status: string; createdAt: string; customer?: Customer | string; items: TradeLine[] }

const categories = ['PHONE', 'TABLET', 'ACCESSORY', 'SPARE_PART', 'OTHER']
const statuses: PreorderStatus[] = ['REQUESTED', 'ORDERED', 'ARRIVED', 'COMPLETED', 'CANCELLED']
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The preorder could not be saved.'
const itemId = (line: TradeLine) => typeof line.inventoryItem === 'string' ? line.inventoryItem : line.inventoryItem?._id || ''
const requestKey = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`

export default function CustomerPreorderWorkspace() {
  const [preorders, setPreorders] = useState<Preorder[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const query = new URLSearchParams({ search, status })
      setPreorders((await api<{ preorders: Preorder[] }>(`/customer-preorders?${query}`)).preorders)
      setError('')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setLoading(false) }
  }, [search, status])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 180); return () => window.clearTimeout(timer) }, [load])
  const selected = preorders.find((item) => item._id === selectedId)
  function upsert(preorder: Preorder) {
    setPreorders((current) => [preorder, ...current.filter((item) => item._id !== preorder._id)])
  }
  return <div className="preorder-page">
    <SectionHeader eyebrow="Operations" title="Customer Preorders" description="Take requests for phones, cases, and other products, then track each order through pickup." />
    {error && <p className="overview-error" role="alert">{error}</p>}
    <OperationActionCard ariaLabel="Customer preorder actions" eyebrow="Customer request" title="Take a preorder" description="Record the customer, product, quantity, and exact details before ordering it." actionLabel="New preorder" onAction={() => setCreateOpen(true)} />
    <section className="surface-card preorder-ledger">
      <div className="card-heading table-heading"><div><span className="eyebrow">Customer orders</span><h3>Preorder queue</h3></div><button type="button" className="ghost-button" aria-label="Refresh preorders" onClick={() => void load()}><RefreshCcw size={16} /></button></div>
      <FilterToolbar search={search} onSearchChange={setSearch} searchLabel="Search preorders" placeholder="Search customer, phone, product, or preorder number…"><FilterSelect aria-label="Preorder status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option>{statuses.map((value) => <option value={value} key={value}>{titleStatus(value)}</option>)}</FilterSelect></FilterToolbar>
      {loading && preorders.length === 0 ? <LoadingState label="Loading customer preorders" /> : <div className="preorder-list">{preorders.map((preorder) => <RecordListRow key={preorder._id} icon={<ShoppingBag />} tone="preorder" title={`${preorder.quantity} × ${preorder.productName}`} meta={`${preorder.preorderNo} · ${preorder.customerName} · ${dateText(preorder.createdAt)}`} badge={<span className="preorder-status">{titleStatus(preorder.status)}</span>} ariaLabel={`Open preorder ${preorder.preorderNo} for ${preorder.productName}`} onOpen={() => setSelectedId(preorder._id)} />)}{preorders.length === 0 && <p className="preorder-empty">{search || status !== 'ALL' ? 'No preorders match these filters.' : 'No customer preorders yet. Use New preorder to record the first request.'}</p>}</div>}
    </section>
    {createOpen && <CreatePreorder onClose={() => setCreateOpen(false)} onCreated={(preorder) => { upsert(preorder); setSelectedId(preorder._id); setCreateOpen(false) }} />}
    {selected && <PreorderDetail preorder={selected} onClose={() => setSelectedId(null)} onChanged={upsert} />}
  </div>
}

function CreatePreorder({ onClose, onCreated }: { onClose: () => void; onCreated: (preorder: Preorder) => void }) {
  const [form, setForm] = useState({ customerId: '', customerName: '', customerPhone: '', category: 'ACCESSORY', productName: '', quantity: '1', specifications: '' })
  const [customers, setCustomers] = useState<Customer[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [key] = useState(requestKey)
  useEffect(() => { void api<{ customers: Customer[] }>('/customers').then((result) => setCustomers(result.customers)).catch(() => {}) }, [])
  const suggestions = useMemo(() => form.customerName.trim().length > 1 && !form.customerId ? customers.filter((customer) => `${customer.name} ${customer.phone}`.toLowerCase().includes(form.customerName.toLowerCase())).slice(0, 5) : [], [customers, form.customerId, form.customerName])
  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }))
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return
    setBusy(true); setError('')
    try {
      const result = await api<{ preorder: Preorder }>('/customer-preorders', { method: 'POST', body: JSON.stringify({ ...form, customerId: form.customerId || undefined, quantity: Number(form.quantity), requestKey: key }) })
      onCreated(result.preorder)
    } catch (reason) { setError(errorMessage(reason)); setBusy(false) }
  }
  return <OperationModalShell title="New customer preorder" eyebrow="Customer request" description="Record the request now. Purchases and sales are recorded through Buy & Sell." icon={<PackageCheck size={21} />} busy={busy} error={error} onDismissError={() => setError('')} onClose={onClose}>
    <form className="operation-form preorder-form" onSubmit={submit}><div className="operation-form-grid preorder-form-grid">
      <label>Customer name<input required maxLength={120} data-modal-initial-focus value={form.customerName} onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value, customerId: '' }))} placeholder="Type to find an existing customer" />{suggestions.length > 0 && <span className="preorder-suggestions">{suggestions.map((customer) => <button type="button" key={customer._id} onClick={() => setForm((current) => ({ ...current, customerId: customer._id, customerName: customer.name, customerPhone: customer.phone }))}>{customer.name} · {customer.phone}</button>)}</span>}</label>
      <label>Customer phone<input required maxLength={40} value={form.customerPhone} onChange={(event) => setForm((current) => ({ ...current, customerPhone: event.target.value, customerId: '' }))} /></label>
      <label>Product category<select value={form.category} onChange={(event) => update('category', event.target.value)}>{categories.map((value) => <option value={value} key={value}>{titleStatus(value)}</option>)}</select></label>
      <label>Quantity<input required type="number" min="1" max="1000" step="1" value={form.quantity} onChange={(event) => update('quantity', event.target.value)} /></label>
      <label className="preorder-wide">Product requested<input required maxLength={160} value={form.productName} onChange={(event) => update('productName', event.target.value)} placeholder="Phone model or case name" /></label>
      <label className="preorder-wide">Details (optional)<textarea maxLength={1000} value={form.specifications} onChange={(event) => update('specifications', event.target.value)} placeholder="Color, storage, case type, exact model…" /></label>
    </div><p className="preorder-help">No deposit is recorded here. This request does not change stock or profit.</p><footer className="operation-modal-actions"><button type="button" className="ghost-button" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>Save request</button></footer></form>
  </OperationModalShell>
}

function PreorderDetail({ preorder, onClose, onChanged }: { preorder: Preorder; onClose: () => void; onChanged: (preorder: Preorder) => void }) {
  const [supplierName, setSupplierName] = useState(preorder.supplierName || '')
  const [expectedAt, setExpectedAt] = useState(preorder.expectedAt?.slice(0, 10) || '')
  const [purchases, setPurchases] = useState<Trade[]>([])
  const [sales, setSales] = useState<Trade[]>([])
  const [purchaseSearch, setPurchaseSearch] = useState('')
  const [saleSearch, setSaleSearch] = useState('')
  const [purchaseSelection, setPurchaseSelection] = useState('')
  const [saleSelection, setSaleSelection] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const refreshTrades = useCallback(async () => {
    try {
      const [buy, sell] = await Promise.all([api<{ trades: Trade[] }>('/trades?type=BUY'), api<{ trades: Trade[] }>('/trades?type=SELL')])
      setPurchases(buy.trades.filter((trade) => trade.status === 'COMPLETED'))
      setSales(sell.trades.filter((trade) => trade.status === 'COMPLETED'))
    } catch (reason) { setError(errorMessage(reason)) }
  }, [])
  useEffect(() => { void refreshTrades() }, [refreshTrades])
  async function act(path: string, body: Record<string, unknown>) {
    if (busy) return false
    setBusy(true); setError('')
    try {
      const result = await api<{ preorder: Preorder }>(`/customer-preorders/${preorder._id}/${path}`, { method: 'POST', body: JSON.stringify(body) })
      onChanged(result.preorder)
      return true
    } catch (reason) { setError(errorMessage(reason)); return false }
    finally { setBusy(false) }
  }
  const purchaseOptions = purchases.flatMap((trade) => trade.items.filter((line) => itemId(line) && line.quantity >= preorder.quantity).map((line) => ({ trade, line, value: `${trade._id}:${itemId(line)}` }))).filter((option) => new Date(option.trade.createdAt) >= new Date(preorder.createdAt) && `${option.trade.tradeNo} ${option.line.name}`.toLowerCase().includes(purchaseSearch.toLowerCase())).slice(0, 50)
  const saleOptions = sales.filter((trade) => new Date(trade.createdAt) >= new Date(preorder.createdAt) && trade.items.some((line) => itemId(line) === preorder.inventoryItem && line.quantity >= preorder.quantity) && `${trade.tradeNo} ${trade.items.map((line) => line.name).join(' ')}`.toLowerCase().includes(saleSearch.toLowerCase())).slice(0, 50)
  function closeCancellation() {
    setCancelOpen(false)
    setCancelReason('')
    setError('')
  }
  async function confirmCancellation() {
    const reason = cancelReason.trim()
    if (reason.length < 3) return
    if (await act('cancel', { reason })) closeCancellation()
  }
  return <>
  <OperationModalShell title={preorder.preorderNo} eyebrow="Customer preorder" description={`${preorder.customerName} · ${preorder.productName}`} icon={<PackageCheck size={21} />} busy={busy} error={cancelOpen ? '' : error} onDismissError={() => setError('')} onClose={onClose} dismissOnEscape={!cancelOpen} inactive={cancelOpen} className="preorder-detail-modal">
    <div className="operation-form preorder-detail">
      <div className="preorder-facts"><span><small>Status</small><strong>{titleStatus(preorder.status)}</strong></span><span><small>Customer</small><strong>{preorder.customerName} · {preorder.customerPhone}</strong></span><span><small>Product</small><strong>{preorder.quantity} × {preorder.productName}</strong></span><span><small>Details</small><strong>{preorder.specifications || titleStatus(preorder.category)}</strong></span></div>
      {preorder.status === 'REQUESTED' && <section className="preorder-block"><h3>Place supplier order</h3><p className="preorder-help">Contact the supplier first, then record their name and expected date here. This does not create a purchase or charge the customer.</p><div className="preorder-fields"><label>Supplier name<input maxLength={120} value={supplierName} onChange={(event) => setSupplierName(event.target.value)} /></label><label>Expected arrival (optional)<input type="date" value={expectedAt} onChange={(event) => setExpectedAt(event.target.value)} /></label></div><button className="primary-button" type="button" disabled={busy || !supplierName.trim()} onClick={() => void act('order', { supplierName, expectedAt })}>Mark ordered</button></section>}
      {preorder.status === 'ORDERED' && <section className="preorder-block"><h3>Product arrival</h3><p className="preorder-help">Record the supplier transaction with New purchase first. Then link the purchased inventory item here. This step does not add stock again.</p><div className="preorder-actions"><button type="button" className="ghost-button" onClick={() => window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))}>Open New purchase</button><button type="button" className="ghost-button" onClick={() => void refreshTrades()}><RefreshCcw size={15} />Refresh purchases</button></div><label>Find purchase<input value={purchaseSearch} onChange={(event) => setPurchaseSearch(event.target.value)} placeholder="Type purchase number or product" /></label><label>Purchased product<select value={purchaseSelection} onChange={(event) => setPurchaseSelection(event.target.value)}><option value="">Select purchase and product</option>{purchaseOptions.map((option) => <option value={option.value} key={option.value}>{option.trade.tradeNo} · {option.line.name} · Qty {option.line.quantity}</option>)}</select></label><button type="button" className="primary-button" disabled={busy || !purchaseSelection} onClick={() => { const [purchaseTradeId, inventoryItemId] = purchaseSelection.split(':'); void act('receive', { purchaseTradeId, inventoryItemId }) }}>Mark arrived</button></section>}
      {preorder.status === 'ARRIVED' && <section className="preorder-block"><h3>Customer pickup</h3><p className="preorder-help">The purchased item is in normal stock, not held aside by this page. Complete the sale for this customer in Buy & Sell, then link that sale below. No sale is created by marking pickup here.</p><div className="preorder-actions"><button type="button" className="ghost-button" onClick={() => window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale', itemId: preorder.inventoryItem } }))}>Open New sale</button><button type="button" className="ghost-button" onClick={() => void refreshTrades()}><RefreshCcw size={15} />Refresh sales</button></div><label>Find sale<input value={saleSearch} onChange={(event) => setSaleSearch(event.target.value)} placeholder="Type sale number or product" /></label><label>Completed sale<select value={saleSelection} onChange={(event) => setSaleSelection(event.target.value)}><option value="">Select sale</option>{saleOptions.map((trade) => <option value={trade._id} key={trade._id}>{trade.tradeNo} · {trade.items.map((line) => line.name).join(', ')}</option>)}</select></label><button type="button" className="primary-button" disabled={busy || !saleSelection} onClick={() => { if (!preorder.customer && !window.confirm(`Confirm the selected sale belongs to ${preorder.customerName} (${preorder.customerPhone})?`)) return; void act('complete', { saleTradeId: saleSelection, customerConfirmed: !preorder.customer }) }}>Mark picked up</button></section>}
      {preorder.status === 'COMPLETED' && <p className="preorder-help">Completed through a recorded sale. The sale remains in the normal sales and profit reports.</p>}
      {preorder.status === 'CANCELLED' && <p className="preorder-help">Cancelled: {preorder.cancellationReason}. Any previously purchased product remains in stock; the purchase record is not reversed.</p>}
      {!['COMPLETED', 'CANCELLED'].includes(preorder.status) && <section className="preorder-block"><div className="preorder-block-heading"><h3>Customer changed their mind?</h3><button type="button" className="danger-button" disabled={busy} onClick={() => { setError(''); setCancelReason(''); setCancelOpen(true) }}>Cancel preorder</button></div><p className="preorder-help">Cancelling does not refund money or contact the supplier. No deposit is handled in this workflow.</p></section>}
      <section className="preorder-block"><h3>History</h3><ol className="preorder-history">{[...preorder.events].reverse().map((entry, index) => <li key={`${entry.at}-${index}`}><strong>{titleStatus(entry.action)}</strong><small>{dateText(entry.at)}{entry.note ? ` · ${entry.note}` : ''}</small></li>)}</ol></section>
      <footer className="operation-modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Close</button></footer>
    </div>
  </OperationModalShell>
  {cancelOpen && <OperationModalShell title="Cancel preorder" eyebrow="Customer preorder" description="Any product already purchased remains in stock. Contact the supplier separately to cancel their order." icon={<AlertTriangle size={21} />} busy={busy} error={error} onDismissError={() => setError('')} onClose={closeCancellation} className="preorder-cancel-modal">
    <form className="operation-form preorder-cancel-form" onSubmit={(event) => { event.preventDefault(); void confirmCancellation() }}>
      <label>Reason for cancellation<textarea data-modal-initial-focus required minLength={3} maxLength={500} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Why is this customer preorder cancelled?" /></label>
      <footer className="operation-modal-actions"><button type="button" className="ghost-button" disabled={busy} onClick={closeCancellation}>Go back</button><button type="submit" className="danger-button" disabled={busy || cancelReason.trim().length < 3}>{busy ? 'Cancelling…' : 'Cancel preorder'}</button></footer>
    </form>
  </OperationModalShell>}
  </>
}
