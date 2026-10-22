import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ClipboardList, PackagePlus, RefreshCcw, Wrench } from 'lucide-react'
import { api } from '../../lib/api'
import SectionHeader from '../../components/SectionHeader'
import FilterToolbar from '../../components/FilterToolbar'
import FilterSelect from '../../components/FilterSelect'
import OperationModalShell from '../../components/OperationModalShell'
import LoadingState from '../../components/LoadingState'
import OperationActionCard from '../../components/OperationActionCard'
import RecordListRow from '../../components/RecordListRow'
import StatusBadge from '../../components/StatusBadge'
import InventoryProductCombobox, { InventorySelectionSummary } from '../../components/InventoryProductCombobox'
import { dateText, titleStatus } from '../../lib/presentation'
import './repair-workspace.css'

type RepairStatus = 'RECEIVED' | 'DIAGNOSIS' | 'APPROVAL' | 'WAITING_PARTS' | 'IN_PROGRESS' | 'QUALITY_CHECK' | 'READY_PICKUP' | 'COMPLETED' | 'CANCELLED'
type RepairConfirmation = 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
type PartStatus = 'ORDERED' | 'RESERVED' | 'INSTALLED' | 'RELEASED' | 'CANCELLED'
type RepairPart = { _id: string; source: 'STOCK' | 'PREORDER'; status: PartStatus; name: string; quantity: number; sku?: string; supplierName?: string; purchaseTrade?: string; returnStockStatus?: 'IN_STOCK' | 'ARCHIVED' }
type Repair = { _id: string; repairNo: string; customerName: string; customerPhone?: string; device: string; imeiOrSerial?: string; issue: string; status: RepairStatus; parts: RepairPart[]; events: { action: string; note?: string; at: string }[]; createdAt: string }
type StockItem = { _id: string; name: string; sku: string; quantity: number; category: string; status: string }
type Purchase = { _id: string; tradeNo: string; type: string; status: string; createdAt: string; items: { inventoryItem?: { _id: string; name: string; sku: string } | string; name: string; quantity: number }[] }

const nextStatuses: Record<RepairStatus, { status: RepairStatus; label: string }[]> = {
  RECEIVED: [{ status: 'DIAGNOSIS', label: 'Start diagnosis' }],
  DIAGNOSIS: [{ status: 'APPROVAL', label: 'Request approval' }],
  APPROVAL: [{ status: 'IN_PROGRESS', label: 'Customer approved · start repair' }],
  WAITING_PARTS: [{ status: 'IN_PROGRESS', label: 'Resume repair' }],
  IN_PROGRESS: [{ status: 'QUALITY_CHECK', label: 'Start quality check' }],
  QUALITY_CHECK: [{ status: 'READY_PICKUP', label: 'Ready for pickup' }, { status: 'IN_PROGRESS', label: 'Return to repair' }],
  READY_PICKUP: [{ status: 'COMPLETED', label: 'Handed to customer' }],
  COMPLETED: [], CANCELLED: [],
}

const message = (reason: unknown) => reason instanceof Error ? reason.message : 'The change could not be saved.'

export default function RepairWorkspace({ openRepairId, onRepairClosed }: { openRepairId?: string | null; onRepairClosed?: () => void } = {}) {
  const [repairs, setRepairs] = useState<Repair[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(openRepairId || null)
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const listed = (await api<{ repairs: Repair[] }>('/repairs')).repairs
      const requested = openRepairId && !listed.some((repair) => repair._id === openRepairId)
        ? (await api<{ repair: Repair }>(`/repairs/${encodeURIComponent(openRepairId)}`)).repair
        : null
      setRepairs(requested ? [requested, ...listed] : listed)
      setError('')
    }
    catch (reason) { setError(message(reason)) }
    finally { setLoading(false) }
  }, [openRepairId])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (openRepairId) setSelectedId(openRepairId) }, [openRepairId])
  const selected = repairs.find((repair) => repair._id === selectedId)
  const visible = useMemo(() => repairs.filter((repair) => {
    if (status !== 'ALL' && repair.status !== status) return false
    const term = search.trim().toLowerCase()
    return !term || [repair.repairNo, repair.customerName, repair.customerPhone, repair.device, repair.imeiOrSerial, repair.issue].some((value) => value?.toLowerCase().includes(term))
  }), [repairs, search, status])

  function updateRepair(repair: Repair) {
    setRepairs((current) => current.map((item) => item._id === repair._id ? repair : item))
  }

  return <div className="repair-page">
    <SectionHeader eyebrow="Operations" title="Repairs" description="Track diagnosis, customer approval, stock parts, preorders, and pickup." />
    {error && <p className="overview-error" role="alert">{error}</p>}
    <OperationActionCard ariaLabel="Repair actions" eyebrow="Workshop intake" title="Take in a repair" description="Record the customer, device, issue, and details before diagnosis." actionLabel="New repair" onAction={() => setCreateOpen(true)} />
    <section className="surface-card repair-ledger">
      <div className="card-heading table-heading"><div><span className="eyebrow">Repair jobs</span><h3>Workshop queue</h3></div><button type="button" className="ghost-button" onClick={() => void load()} aria-label="Refresh repairs"><RefreshCcw size={16} /></button></div>
      <FilterToolbar search={search} onSearchChange={setSearch} searchLabel="Search repairs" placeholder="Search customer, device, issue, or repair number…"><FilterSelect aria-label="Repair status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option>{Object.keys(nextStatuses).map((value) => <option key={value} value={value}>{titleStatus(value)}</option>)}</FilterSelect></FilterToolbar>
      {loading && repairs.length === 0 ? <LoadingState label="Loading repairs" /> : <div className="repair-list">{visible.map((repair) => <RecordListRow key={repair._id} icon={<Wrench />} tone="repair" title={repair.device} meta={`${repair.repairNo} · ${repair.customerName} · ${dateText(repair.createdAt)}`} detail={repair.issue} badge={<StatusBadge status={repair.status} />} ariaLabel={`Open ${repair.device} repair ${repair.repairNo}`} onOpen={() => setSelectedId(repair._id)} />)}{visible.length === 0 && <p className="repair-empty">No repairs match these filters.</p>}</div>}
    </section>
    {createOpen && <CreateRepair onClose={() => setCreateOpen(false)} onCreated={(repair) => { setRepairs((current) => [repair, ...current]); setSelectedId(repair._id); setCreateOpen(false) }} />}
    {selected && <RepairDetail repair={selected} onClose={() => { setSelectedId(null); onRepairClosed?.() }} onChanged={updateRepair} />}
  </div>
}

function CreateRepair({ onClose, onCreated }: { onClose: () => void; onCreated: (repair: Repair) => void }) {
  const [form, setForm] = useState({ customerName: '', customerPhone: '', device: '', imeiOrSerial: '', issue: '' })
  const [requestKey] = useState(() => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }))
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return
    setBusy(true); setError('')
    try { onCreated((await api<{ repair: Repair }>('/repairs', { method: 'POST', body: JSON.stringify({ ...form, requestKey }) })).repair) }
    catch (reason) { setError(message(reason)); setBusy(false) }
  }
  return <OperationModalShell title="New repair" eyebrow="Workshop intake" icon={<ClipboardList size={21} />} busy={busy} error={error} onClose={onClose}>
    <form className="operation-form repair-form" onSubmit={submit}><div className="operation-form-grid repair-form-grid">
      <label>Customer name<input required maxLength={120} data-modal-initial-focus value={form.customerName} onChange={(event) => update('customerName', event.target.value)} /></label>
      <label>Phone<input maxLength={40} value={form.customerPhone} onChange={(event) => update('customerPhone', event.target.value)} /></label>
      <label>Device<input required maxLength={160} value={form.device} onChange={(event) => update('device', event.target.value)} placeholder="Brand and model" /></label>
      <label>IMEI or serial (optional)<input maxLength={160} value={form.imeiOrSerial} onChange={(event) => update('imeiOrSerial', event.target.value)} /></label>
      <label className="repair-wide">Problem reported<textarea required maxLength={2000} value={form.issue} onChange={(event) => update('issue', event.target.value)} /></label>
    </div><footer className="operation-modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>Create repair</button></footer></form>
  </OperationModalShell>
}

function RepairDetail({ repair, onClose, onChanged }: { repair: Repair; onClose: () => void; onChanged: (repair: Repair) => void }) {
  const [stock, setStock] = useState<StockItem[]>([])
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(true)
  const [stockId, setStockId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [partName, setPartName] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [expectedAt, setExpectedAt] = useState('')
  const [receipts, setReceipts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [statusDialog, setStatusDialog] = useState<RepairConfirmation | null>(null)
  const [statusNote, setStatusNote] = useState('')
  const pendingRequest = useRef<{ action: string; key: string } | null>(null)

  const refreshSources = useCallback(async () => {
    setSourcesLoading(true)
    try {
      const [inventory, trades] = await Promise.all([api<{ items: StockItem[] }>('/inventory?status=IN_STOCK'), api<{ trades: Purchase[] }>('/trades?type=BUY')])
      setStock(inventory.items.filter((item) => ['SPARE_PART', 'ACCESSORY', 'OTHER'].includes(item.category) && item.quantity > 0))
      setPurchases(trades.trades.filter((trade) => trade.type === 'BUY' && trade.status === 'COMPLETED'))
    } catch (reason) { setError(message(reason)) }
    finally { setSourcesLoading(false) }
  }, [])
  useEffect(() => { void refreshSources() }, [refreshSources])
  async function post(path: string, body: Record<string, unknown> = {}) {
    if (busy) return false
    setBusy(true); setError('')
    try {
      const action = `${path}:${JSON.stringify(body)}`
      const requestKey = pendingRequest.current?.action === action ? pendingRequest.current.key : globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
      pendingRequest.current = { action, key: requestKey }
      const { repair: updated } = await api<{ repair: Repair }>(`/repairs/${repair._id}${path}`, { method: path === '/status' ? 'PATCH' : 'POST', body: JSON.stringify({ ...body, requestKey }) })
      pendingRequest.current = null
      onChanged(updated); void refreshSources()
      return true
    } catch (reason) { setError(message(reason)); return false }
    finally { setBusy(false) }
  }
  function changeStatus(next: RepairStatus) {
    if (next === 'CANCELLED' || next === 'COMPLETED' || (repair.status === 'APPROVAL' && next === 'IN_PROGRESS')) {
      setStatusNote('')
      setError('')
      setStatusDialog(next)
      return
    }
    void post('/status', { status: next, note: '' })
  }
  async function confirmStatus() {
    if (!statusDialog) return
    const note = statusNote.trim()
    if (statusDialog !== 'COMPLETED' && !note) return
    if (await post('/status', { status: statusDialog, note })) {
      setStatusDialog(null)
      setStatusNote('')
    }
  }
  const canAddParts = ['WAITING_PARTS', 'IN_PROGRESS'].includes(repair.status)
  const selectedStock = stock.find((item) => item._id === stockId)
  const reserveQuantity = Number(quantity)
  const canReserve = Boolean(selectedStock && Number.isInteger(reserveQuantity) && reserveQuantity > 0 && reserveQuantity <= selectedStock.quantity)
  const validPurchases = (part: RepairPart) => purchases.flatMap((trade) => trade.items.filter((line) => line.quantity >= part.quantity && line.inventoryItem).map((line) => ({ key: `${trade._id}:${typeof line.inventoryItem === 'string' ? line.inventoryItem : line.inventoryItem?._id}`, trade, line, inventoryId: typeof line.inventoryItem === 'string' ? line.inventoryItem : line.inventoryItem?._id || '' }))).filter((option) => new Date(option.trade.createdAt) >= new Date(repair.createdAt))
  const statusCopy = statusDialog === 'CANCELLED'
    ? { title: 'Cancel repair', description: 'Unused reserved parts return to stock. Installed parts do not.', label: 'Reason for cancellation', placeholder: 'Explain why this repair is cancelled', action: 'Cancel repair' }
    : statusDialog === 'COMPLETED'
      ? { title: 'Confirm pickup', description: 'Confirm the repaired device was handed to the customer. Record any payment separately in Service charges.', label: '', placeholder: '', action: 'Mark handed to customer' }
      : { title: 'Record customer approval', description: 'Record how the customer approved this repair before work starts.', label: 'How did the customer approve?', placeholder: 'For example, in person or by phone', action: 'Start repair' }
  const historyGroups = [...repair.events].reverse().reduce<{ date: string; entries: Repair['events'] }[]>((groups, entry) => {
    const date = dateText(entry.at)
    const latestGroup = groups[groups.length - 1]
    if (latestGroup?.date === date) latestGroup.entries.push(entry)
    else groups.push({ date, entries: [entry] })
    return groups
  }, [])
  return <>
  <OperationModalShell title={repair.repairNo} eyebrow="Repair job" icon={<Wrench size={21} />} busy={busy} error={statusDialog ? '' : error} onDismissError={() => setError('')} onClose={onClose} dismissOnEscape={!statusDialog} inactive={Boolean(statusDialog)} className="repair-detail-modal">
    <div className="operation-form repair-detail">
      <div className="repair-facts"><span><small>Status</small><strong>{titleStatus(repair.status)}</strong></span><span><small>Customer</small><strong>{repair.customerName}{repair.customerPhone ? ` · ${repair.customerPhone}` : ''}</strong></span><span><small>Device</small><strong>{repair.device}</strong></span><span><small>Issue</small><strong>{repair.issue}</strong></span></div>
      <section className="repair-block repair-progress-block"><h3>Progress</h3><div className="repair-actions">{nextStatuses[repair.status].map((next) => <button type="button" className="primary-button" key={next.status} disabled={busy || (next.status === 'IN_PROGRESS' && repair.parts.some((part) => part.status === 'ORDERED')) || (next.status === 'QUALITY_CHECK' && repair.parts.some((part) => part.status === 'RESERVED'))} onClick={() => void changeStatus(next.status)}>{next.label}</button>)}{!['COMPLETED', 'CANCELLED'].includes(repair.status) && <button type="button" className="danger-button" disabled={busy} onClick={() => void changeStatus('CANCELLED')}>Cancel repair</button>}</div></section>
      <section className="repair-block"><div className="repair-block-heading"><h3>Parts</h3><button type="button" className="ghost-button" onClick={() => void refreshSources()}><RefreshCcw size={15} />Refresh stock & purchases</button></div><p className="repair-help">Reserved parts are removed from available stock. Installed parts stay consumed. Unused parts return to stock if the repair is cancelled.</p>
        {repair.parts.length === 0 && <p className="repair-help">No parts added yet.</p>}
        {repair.parts.map((part) => <div className={`repair-part${part.status === 'ORDERED' ? ' repair-part--ordered' : ''}`} key={part._id}>
          <div className="repair-part-summary"><strong>{part.quantity} × {part.name}</strong><small>{part.source === 'PREORDER' ? `Preorder · ${part.supplierName || 'Supplier'} · ${titleStatus(part.status)}` : `Stock · ${part.sku || ''} · ${titleStatus(part.status)}`}</small></div>
          {(part.status === 'ORDERED' || part.status === 'RESERVED') && <div className="repair-part-controls">
            {part.status === 'ORDERED' && <label className="repair-purchase-field">Recorded purchase
              <select aria-label={`Purchase for ${part.name}`} value={receipts[part._id] || ''} onChange={(event) => setReceipts((current) => ({ ...current, [part._id]: event.target.value }))}><option value="">Select recorded purchase + item</option>{validPurchases(part).map((option) => <option key={option.key} value={option.key}>{option.trade.tradeNo} · {option.line.name} · Qty {option.line.quantity}</option>)}</select>
            </label>}
            <div className="repair-actions">
              {part.status === 'ORDERED' && <button className="ghost-button" type="button" disabled={busy || !receipts[part._id]} onClick={() => { const [purchaseTradeId, inventoryItemId] = receipts[part._id].split(':'); void post(`/parts/${part._id}/receive`, { purchaseTradeId, inventoryItemId }) }}>Receive & reserve</button>}
              {part.status === 'RESERVED' && repair.status === 'IN_PROGRESS' && <button className="primary-button" type="button" disabled={busy} onClick={() => void post(`/parts/${part._id}/install`)}>Mark installed</button>}
              <button className="ghost-button" type="button" disabled={busy} onClick={() => void post(`/parts/${part._id}/release`)}>Release unused</button>
            </div>
          </div>}
        </div>)}
        {repair.parts.some((part) => part.returnStockStatus === 'ARCHIVED') && <p className="repair-help">A released part returned to an archived stock record. Its quantity is preserved; reopen that item in Stock Information before selling it.</p>}
        {repair.parts.some((part) => part.source === 'PREORDER') && <p className="repair-help">Preorders are internal records. Contact the supplier separately to place or cancel the order.</p>}
      </section>
      {canAddParts && <div className="repair-add-grid"><section className="repair-block"><h3>Use part from stock</h3><InventoryProductCombobox id={`repair-${repair._id}`} items={stock} value={stockId} loading={sourcesLoading} label="Available product" listLabel="Available stock parts" placeholder="Search part name or SKU…" emptyMessage="No available stock parts" onChange={setStockId} />{selectedStock && <InventorySelectionSummary item={selectedStock} afterLabel="After reserve" afterQuantity={selectedStock.quantity - (Number.isInteger(reserveQuantity) && reserveQuantity > 0 ? reserveQuantity : 0)} />}<label>Quantity<input type="number" min="1" max={selectedStock?.quantity} step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>{selectedStock && reserveQuantity > selectedStock.quantity && <p className="repair-help" role="alert">Only {selectedStock.quantity} available. Lower the quantity to reserve this part.</p>}<button type="button" className="primary-button" disabled={busy || !canReserve} onClick={() => void post('/parts/reserve', { inventoryItemId: stockId, quantity: reserveQuantity }).then((saved) => { if (saved) setStockId('') })}>Reserve stock part</button></section>
        <section className="repair-block"><h3>Part not in stock? Preorder</h3><label>Part needed<input maxLength={160} value={partName} onChange={(event) => setPartName(event.target.value)} /></label><label>Supplier<input maxLength={120} value={supplierName} onChange={(event) => setSupplierName(event.target.value)} /></label><label>Expected date (optional)<input type="date" value={expectedAt} onChange={(event) => setExpectedAt(event.target.value)} /></label><button type="button" className="primary-button" disabled={busy || !partName.trim() || !supplierName.trim()} onClick={() => void post('/parts/preorder', { name: partName, supplierName, quantity: Number(quantity), expectedAt })}><PackagePlus size={16} />Add preorder</button><p className="repair-help">On arrival, record it with New purchase, then link that purchase above. A preorder alone does not change stock or finances.</p><button type="button" className="ghost-button" onClick={() => window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))}>Open New purchase</button></section></div>}
      <section className="repair-block repair-history-block"><h3>History</h3><div className="repair-history-groups">{historyGroups.map((group, groupIndex) => <div className="repair-history-group" key={`${group.date}-${groupIndex}`}><time className="repair-history-date" dateTime={group.entries[0].at}>{group.date}</time><ol className="repair-history" reversed>{group.entries.map((entry, index) => <li key={`${entry.at}-${index}`}><strong>{titleStatus(entry.action)}</strong>{entry.note && <span>{entry.note}</span>}</li>)}</ol></div>)}</div></section>
    </div>
  </OperationModalShell>
  {statusDialog && <OperationModalShell title={statusCopy.title} eyebrow="Repair progress" description={statusCopy.description} icon={<Wrench size={21} />} busy={busy} error={error} onDismissError={() => setError('')} onClose={() => { setStatusDialog(null); setError('') }} className="repair-status-modal">
    <form className="operation-form repair-status-form" onSubmit={(event) => { event.preventDefault(); void confirmStatus() }}>
      {statusDialog !== 'COMPLETED' && <label>{statusCopy.label}<textarea data-modal-initial-focus required aria-required="true" maxLength={1000} value={statusNote} onChange={(event) => setStatusNote(event.target.value)} placeholder={statusCopy.placeholder} /></label>}
      <footer className="operation-modal-actions"><button type="button" className="ghost-button" disabled={busy} onClick={() => { setStatusDialog(null); setError('') }}>Go back</button><button type="submit" data-modal-initial-focus={statusDialog === 'COMPLETED' ? true : undefined} className={statusDialog === 'CANCELLED' ? 'danger-button' : 'primary-button'} disabled={busy || (statusDialog !== 'COMPLETED' && !statusNote.trim())}>{busy ? 'Saving…' : statusCopy.action}</button></footer>
    </form>
  </OperationModalShell>}
  </>
}
