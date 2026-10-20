import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Edit3,
  Package,
  PackageCheck,
  Plus,
  Printer,
  RefreshCcw,
  Send,
  Truck,
  XCircle,
} from 'lucide-react'
import { api } from '../../lib/api'
import { dateText } from '../../lib/presentation'
import DetailModalBody from '../../components/DetailModalBody'
import DetailModalFooter from '../../components/DetailModalFooter'
import DetailModalHeader from '../../components/DetailModalHeader'
import DetailModalShell from '../../components/DetailModalShell'
import FilterSelect from '../../components/FilterSelect'
import FilterToolbar from '../../components/FilterToolbar'
import LoadingState from '../../components/LoadingState'
import OperationActionCard from '../../components/OperationActionCard'
import OperationModalShell from '../../components/OperationModalShell'
import SectionHeader from '../../components/SectionHeader'
import SummaryStats from '../../components/SummaryStats'
import { printShippingLabel } from './shipping-label'
import './shipping-workspace.css'

type ShipmentStatus = 'PREPARING' | 'READY_TO_SHIP' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'

type Customer = {
  _id: string
  name: string
  phone?: string
  address?: string
  active?: boolean
}

type ShipmentItem = {
  _id?: string
  name: string
  quantity: number
  sku?: string
  imei?: string
  notes?: string
}

type ShipmentEvent = {
  _id?: string
  action: string
  note?: string
  at: string
  by?: { name?: string; role?: string }
}

type Shipment = {
  _id: string
  shipmentNo: string
  customer?: Customer | string
  recipientName: string
  recipientPhone: string
  address: string
  shippingDate: string
  courierName?: string
  trackingNumber?: string
  packageNote?: string
  items: ShipmentItem[]
  status: ShipmentStatus
  readyAt?: string
  shippedAt?: string
  deliveredAt?: string
  cancelledAt?: string
  cancellationReason?: string
  labelPrintCount: number
  lastLabelPrintedAt?: string
  events: ShipmentEvent[]
  createdAt: string
  createdBy?: { name?: string; role?: string }
}

type ShipmentSummary = {
  counts: Record<ShipmentStatus, number>
  labelsPrinted: number
}

type EditableShipmentItem = {
  id: string
  name: string
  quantity: string
  sku: string
  imei: string
  notes: string
}

const STATUS_OPTIONS: ShipmentStatus[] = ['PREPARING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'CANCELLED']
const EMPTY_SUMMARY: ShipmentSummary = {
  counts: { PREPARING: 0, READY_TO_SHIP: 0, SHIPPED: 0, DELIVERED: 0, CANCELLED: 0 },
  labelsPrinted: 0,
}

function statusLabel(status: ShipmentStatus) {
  if (status === 'SHIPPED') return 'On Shipping'
  if (status === 'READY_TO_SHIP') return 'Ready to Ship'
  return status.toLowerCase().replaceAll('_', ' ').replace(/(^|\s)\S/g, (value) => value.toUpperCase())
}

function shipmentStatusClass(status: ShipmentStatus) {
  if (status === 'DELIVERED') return 'green'
  if (status === 'CANCELLED') return 'rose'
  if (status === 'SHIPPED') return 'blue'
  if (status === 'READY_TO_SHIP') return 'violet'
  return 'orange'
}

function ShipmentBadge({ status }: { status: ShipmentStatus }) {
  return <span className={`shipping-badge shipping-badge-${shipmentStatusClass(status)}`}>{statusLabel(status)}</span>
}

function localDateInput(value?: string) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return ''
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return shifted.toISOString().slice(0, 10)
}

function requestKey() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function newItem(): EditableShipmentItem {
  return {
    id: globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: '',
    quantity: '1',
    sku: '',
    imei: '',
    notes: '',
  }
}

function toEditableItems(items?: ShipmentItem[]): EditableShipmentItem[] {
  if (!items?.length) return [newItem()]
  return items.map((item) => ({
    id: item._id || globalThis.crypto?.randomUUID?.() || `item-${Math.random()}`,
    name: item.name,
    quantity: String(item.quantity),
    sku: item.sku || '',
    imei: item.imei || '',
    notes: item.notes || '',
  }))
}

function ShippingFormModal({
  shipment,
  customers,
  busy,
  error,
  onClose,
  onSaved,
}: {
  shipment?: Shipment
  customers: Customer[]
  busy: boolean
  error: string
  onClose: () => void
  onSaved: (shipment: Shipment) => void
}) {
  const customerObject = typeof shipment?.customer === 'object' ? shipment.customer : undefined
  const [customerId, setCustomerId] = useState(customerObject?._id || '')
  const [recipientName, setRecipientName] = useState(shipment?.recipientName || '')
  const [recipientPhone, setRecipientPhone] = useState(shipment?.recipientPhone || '')
  const [address, setAddress] = useState(shipment?.address || '')
  const [shippingDate, setShippingDate] = useState(localDateInput(shipment?.shippingDate))
  const [courierName, setCourierName] = useState(shipment?.courierName || '')
  const [trackingNumber, setTrackingNumber] = useState(shipment?.trackingNumber || '')
  const [packageNote, setPackageNote] = useState(shipment?.packageNote || '')
  const [items, setItems] = useState<EditableShipmentItem[]>(() => toEditableItems(shipment?.items))
  const [key] = useState(requestKey)
  const [localError, setLocalError] = useState('')
  const [saving, setSaving] = useState(false)
  const isBusy = busy || saving

  function selectCustomer(id: string) {
    setCustomerId(id)
    const customer = customers.find((entry) => entry._id === id)
    if (!customer) return
    setRecipientName(customer.name)
    setRecipientPhone(customer.phone || '')
    setAddress(customer.address || '')
  }

  function updateItem(id: string, field: keyof Omit<EditableShipmentItem, 'id'>, value: string) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isBusy) return
    setLocalError('')
    const payloadItems = items.map((item) => ({
      name: item.name.trim(),
      quantity: Number(item.quantity),
      sku: item.sku.trim(),
      imei: item.imei.trim(),
      notes: item.notes.trim(),
    }))
    if (payloadItems.some((item) => !item.name || !Number.isSafeInteger(item.quantity) || item.quantity < 1)) {
      setLocalError('Every product needs a name and a valid quantity.')
      return
    }

    const body = {
      requestKey: key,
      customerId: customerId || undefined,
      recipientName: recipientName.trim(),
      recipientPhone: recipientPhone.trim(),
      address: address.trim(),
      shippingDate,
      courierName: courierName.trim(),
      trackingNumber: trackingNumber.trim(),
      packageNote: packageNote.trim(),
      items: payloadItems,
    }

    setSaving(true)
    try {
      const result = await api<{ shipment: Shipment }>(
        shipment ? `/shipments/${shipment._id}` : '/shipments',
        {
          method: shipment ? 'PATCH' : 'POST',
          body: JSON.stringify(body),
        },
      )
      onSaved(result.shipment)
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : 'Unable to save shipment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <OperationModalShell
      title={shipment ? 'Edit shipment' : 'New shipment'}
      eyebrow="Shipping & delivery"
      description={shipment ? 'Update recipient, delivery, and package details before the parcel leaves the shop.' : 'Record the recipient and package, then print a label for the box.'}
      icon={<Truck size={21} />}
      error={localError || error}
      onDismissError={() => setLocalError('')}
      busy={isBusy}
      onClose={onClose}
      className="shipping-operation-modal"
    >
      <form id="shipping-form" className="operation-form shipping-form" onSubmit={submit}>
        <section className="shipping-form-section">
          <header><span>1</span><div><strong>Recipient</strong><small>Who will receive this package?</small></div></header>
          <div className="operation-form-grid shipping-form-grid">
            <label className="shipping-wide">Saved customer <small>Optional</small>
              <select value={customerId} onChange={(event) => selectCustomer(event.target.value)} data-modal-initial-focus>
                <option value="">Manual recipient</option>
                {customers.filter((customer) => customer.active !== false).map((customer) => (
                  <option value={customer._id} key={customer._id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</option>
                ))}
              </select>
            </label>
            <label>Recipient name<input required maxLength={120} value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Customer full name" /></label>
            <label>Phone number<input required maxLength={50} value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value)} placeholder="012 345 678" /></label>
            <label className="shipping-wide">Delivery address<textarea required maxLength={500} rows={3} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="House, street, commune, district, province…" /></label>
          </div>
        </section>

        <section className="shipping-form-section">
          <header><span>2</span><div><strong>Shipping details</strong><small>Courier and tracking are optional and can be added before shipping.</small></div></header>
          <div className="operation-form-grid shipping-form-grid">
            <label>Shipping date<input required type="date" value={shippingDate} onChange={(event) => setShippingDate(event.target.value)} /></label>
            <label>Courier <small>Optional</small><input maxLength={120} value={courierName} onChange={(event) => setCourierName(event.target.value)} placeholder="J&T, Virak Buntham, Grab…" /></label>
            <label>Tracking number <small>Optional</small><input maxLength={120} value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} placeholder="Courier tracking number" /></label>
            <label>Package note <small>Optional</small><input maxLength={500} value={packageNote} onChange={(event) => setPackageNote(event.target.value)} placeholder="Fragile, call before delivery…" /></label>
          </div>
        </section>

        <section className="shipping-form-section">
          <header className="shipping-products-heading"><span>3</span><div><strong>Products in this box</strong><small>Record the phone or other products being shipped. This does not change stock.</small></div><button type="button" className="ghost-button" onClick={() => setItems((current) => [...current, newItem()])}><Plus size={14} /> Add product</button></header>
          <div className="shipping-items">
            {items.map((item, index) => (
              <article className="shipping-item-editor" key={item.id}>
                <header><strong>Product {index + 1}</strong>{items.length > 1 && <button type="button" aria-label={`Remove product ${index + 1}`} onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}><XCircle size={15} /></button>}</header>
                <div className="operation-form-grid shipping-form-grid">
                  <label className="shipping-wide">Product / phone<input required maxLength={180} value={item.name} onChange={(event) => updateItem(item.id, 'name', event.target.value)} placeholder="iPhone 15 Pro Max 256GB Natural Titanium" /></label>
                  <label>Quantity<input required type="number" min="1" max="1000" step="1" value={item.quantity} onChange={(event) => updateItem(item.id, 'quantity', event.target.value)} /></label>
                  <label>SKU <small>Optional</small><input maxLength={100} value={item.sku} onChange={(event) => updateItem(item.id, 'sku', event.target.value)} /></label>
                  <label>IMEI / Serial <small>Optional</small><input maxLength={80} value={item.imei} onChange={(event) => updateItem(item.id, 'imei', event.target.value)} /></label>
                  <label>Item note <small>Optional</small><input maxLength={300} value={item.notes} onChange={(event) => updateItem(item.id, 'notes', event.target.value)} placeholder="Color, storage, accessory…" /></label>
                </div>
              </article>
            ))}
          </div>
        </section>

        <p className="shipping-form-note"><Package size={14} /> Shipping records are for delivery tracking only. They do not create sales or deduct inventory.</p>
      </form>
      <footer className="operation-modal-actions">
        <button type="button" className="ghost-button" onClick={onClose} disabled={isBusy}>Cancel</button>
        <button type="submit" form="shipping-form" className="primary-button" disabled={isBusy}>{isBusy ? 'Saving...' : shipment ? 'Save changes' : 'Create shipment'}</button>
      </footer>
    </OperationModalShell>
  )
}

function ShipmentDetail({
  shipment,
  busy,
  error,
  onClose,
  onEdit,
  onPrint,
  onAdvance,
  onCancel,
}: {
  shipment: Shipment
  busy: boolean
  error: string
  onClose: () => void
  onEdit: () => void
  onPrint: () => void
  onAdvance: (status: ShipmentStatus) => void
  onCancel: () => void
}) {
  const next = shipment.status === 'PREPARING'
    ? { status: 'READY_TO_SHIP' as ShipmentStatus, label: 'Mark ready to ship', icon: PackageCheck }
    : shipment.status === 'READY_TO_SHIP'
      ? { status: 'SHIPPED' as ShipmentStatus, label: 'Mark on shipping', icon: Send }
      : shipment.status === 'SHIPPED'
        ? { status: 'DELIVERED' as ShipmentStatus, label: 'Mark delivered', icon: CheckCircle2 }
        : null
  const NextIcon = next?.icon
  const editable = ['PREPARING', 'READY_TO_SHIP'].includes(shipment.status)
  const closed = ['DELIVERED', 'CANCELLED'].includes(shipment.status)

  return (
    <DetailModalShell onClose={onClose} titleId="shipment-detail-title" className="shipping-detail-modal">
      <DetailModalHeader
        eyebrow="Shipping & delivery"
        title={shipment.shipmentNo}
        titleId="shipment-detail-title"
        description={`${shipment.recipientName} · ${shipment.recipientPhone}`}
        badge={<ShipmentBadge status={shipment.status} />}
        onClose={onClose}
      />
      <DetailModalBody className="shipping-detail-body">
        {error && <div className="shipping-error" role="alert"><AlertTriangle size={16} /> {error}</div>}

        <div className="shipping-detail-facts">
          <section><span className="eyebrow">Ship to</span><h4>{shipment.recipientName}</h4><p>{shipment.recipientPhone}</p><small>{shipment.address}</small></section>
          <section><span className="eyebrow">Shipping</span><h4>{dateText(shipment.shippingDate)}</h4><p>{shipment.courierName || 'Courier not selected'}</p><small>{shipment.trackingNumber ? `Tracking: ${shipment.trackingNumber}` : 'No tracking number'}</small></section>
          <section><span className="eyebrow">Label</span><h4>{shipment.labelPrintCount || 0} print{shipment.labelPrintCount === 1 ? '' : 's'}</h4><p>{shipment.lastLabelPrintedAt ? dateText(shipment.lastLabelPrintedAt) : 'Not printed yet'}</p><small>{shipment.packageNote || 'No package note'}</small></section>
        </div>

        {shipment.status === 'CANCELLED' && <div className="shipping-cancelled-banner"><XCircle size={17} /><div><strong>Shipment cancelled</strong><span>{shipment.cancellationReason || 'No reason recorded'}</span></div></div>}

        <section className="shipping-products-card">
          <header><div><span className="eyebrow">Package contents</span><h4>Products in this box</h4></div><strong>{shipment.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} item{shipment.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) === 1 ? '' : 's'}</strong></header>
          <div className="shipping-product-list">
            {shipment.items.map((item, index) => <article key={item._id || `${item.name}-${index}`}><span className="shipping-product-icon"><Package size={17} /></span><div><strong>{item.quantity} × {item.name}</strong><small>{[item.sku && `SKU ${item.sku}`, item.imei && `IMEI/SN ${item.imei}`, item.notes].filter(Boolean).join(' · ') || 'No extra item details'}</small></div></article>)}
          </div>
        </section>

        <section className="shipping-history">
          <header><span className="eyebrow">History</span><h4>Shipment timeline</h4></header>
          <div>{[...shipment.events].reverse().map((entry, index) => <article key={entry._id || `${entry.at}-${index}`}><span /><p><strong>{entry.action.toLowerCase().replaceAll('_', ' ').replace(/(^|\s)\S/g, (value) => value.toUpperCase())}</strong><small>{dateText(entry.at)}{entry.by?.name ? ` · ${entry.by.name}` : ''}</small>{entry.note && <em>{entry.note}</em>}</p></article>)}</div>
        </section>
      </DetailModalBody>
      <DetailModalFooter
        utilityActions={<>
          {editable && <button type="button" className="ghost-button" onClick={onEdit} disabled={busy}><Edit3 size={15} /> Edit</button>}
          {shipment.status !== 'CANCELLED' && <button type="button" className="ghost-button" onClick={onPrint} disabled={busy}><Printer size={15} /> Print label</button>}
        </>}
        destructiveAction={!closed ? <button type="button" className="danger-button" onClick={onCancel} disabled={busy}>Cancel shipment</button> : undefined}
        transactionActions={next && NextIcon ? <button type="button" className="primary-button" onClick={() => onAdvance(next.status)} disabled={busy}><NextIcon size={15} /> {next.label}</button> : undefined}
        dismissAction={<button type="button" className="ghost-button" onClick={onClose}>Close</button>}
      />
    </DetailModalShell>
  )
}

export default function ShippingWorkspace() {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [summary, setSummary] = useState<ShipmentSummary>(EMPTY_SUMMARY)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'ALL' | ShipmentStatus>('ALL')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [detailError, setDetailError] = useState('')

  const selected = shipments.find((shipment) => shipment._id === selectedId) || null

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ search, status })
      const [shipmentResult, customerResult, summaryResult] = await Promise.all([
        api<{ shipments: Shipment[] }>(`/shipments?${query}`),
        api<{ customers: Customer[] }>('/customers?includeInactive=true'),
        api<{ summary: ShipmentSummary }>('/shipments/summary'),
      ])
      setShipments(shipmentResult.shipments)
      setCustomers(customerResult.customers)
      setSummary(summaryResult.summary)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load shipments')
    } finally {
      setLoading(false)
    }
  }, [search, status])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 150)
    return () => window.clearTimeout(timer)
  }, [load])

  function upsert(shipment: Shipment) {
    setShipments((current) => [shipment, ...current.filter((entry) => entry._id !== shipment._id)])
  }

  async function refreshSummary() {
    try {
      const result = await api<{ summary: ShipmentSummary }>('/shipments/summary')
      setSummary(result.summary)
    } catch {
      // Page list remains usable if the summary refresh fails.
    }
  }

  async function openShipment(id: string) {
    setDetailError('')
    try {
      const result = await api<{ shipment: Shipment }>(`/shipments/${id}`)
      upsert(result.shipment)
      setSelectedId(result.shipment._id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to open shipment')
    }
  }

  async function advance(nextStatus: ShipmentStatus) {
    if (!selected || busy) return
    setBusy(true)
    setDetailError('')
    try {
      const result = await api<{ shipment: Shipment }>(`/shipments/${selected._id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus }),
      })
      upsert(result.shipment)
      await refreshSummary()
    } catch (reason) {
      setDetailError(reason instanceof Error ? reason.message : 'Unable to update shipment')
    } finally {
      setBusy(false)
    }
  }

  async function cancelShipment() {
    if (!selected || busy) return
    const reason = window.prompt('Why is this shipment cancelled?')
    if (!reason?.trim()) return
    setBusy(true)
    setDetailError('')
    try {
      const result = await api<{ shipment: Shipment }>(`/shipments/${selected._id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      upsert(result.shipment)
      await refreshSummary()
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : 'Unable to cancel shipment')
    } finally {
      setBusy(false)
    }
  }

  async function printLabel(shipment: Shipment) {
    const opened = printShippingLabel({
      shipmentNo: shipment.shipmentNo,
      recipientName: shipment.recipientName,
      recipientPhone: shipment.recipientPhone,
      address: shipment.address,
      shippingDate: shipment.shippingDate,
      courierName: shipment.courierName,
      trackingNumber: shipment.trackingNumber,
      items: shipment.items,
    })
    if (!opened) return
    try {
      const result = await api<{ shipment: Shipment }>(`/shipments/${shipment._id}/label-printed`, {
        method: 'POST',
        body: '{}',
      })
      upsert(result.shipment)
      await refreshSummary()
    } catch {
      // Printing already opened successfully. Audit refresh can happen next load.
    }
  }

  const activeQueue = summary.counts.PREPARING + summary.counts.READY_TO_SHIP

  return (
    <div className="shipping-page">
      <SectionHeader eyebrow="Operations" title="Shipping" description="Prepare customer deliveries, print box labels, and track each package until it is delivered." />

      {error && <div className="shipping-error" role="alert"><AlertTriangle size={16} /> {error}</div>}

      <SummaryStats
        label="Shipping summary"
        items={[
          { label: 'Preparing / Ready', value: activeQueue, detail: `${summary.counts.READY_TO_SHIP} ready to leave`, icon: PackageCheck, tone: 'violet' },
          { label: 'On Shipping', value: summary.counts.SHIPPED, detail: 'packages with courier', icon: Truck, tone: 'blue' },
          { label: 'Delivered', value: summary.counts.DELIVERED, detail: 'completed deliveries', icon: CheckCircle2, tone: 'green' },
          { label: 'Labels Printed', value: summary.labelsPrinted, detail: 'all shipping label prints', icon: Printer, tone: 'orange' },
        ]}
      />

      <OperationActionCard
        ariaLabel="Shipping actions"
        eyebrow="Manual shipment"
        title="Create shipping label"
        description="Enter the recipient and products, then print a 60 × 40 mm label for the box."
        actionLabel="New shipment"
        onAction={() => setCreateOpen(true)}
      />

      <section className="surface-card shipping-ledger">
        <div className="card-heading table-heading">
          <div><span className="eyebrow">Delivery queue</span><h3>Shipments</h3><p>Track packages from preparation through delivery.</p></div>
          <button type="button" className="ghost-button" onClick={() => void load()} aria-label="Refresh shipments"><RefreshCcw size={15} /> Refresh</button>
        </div>
        <FilterToolbar search={search} onSearchChange={setSearch} searchLabel="Search shipments" placeholder="Search shipment, recipient, phone, address, tracking, or product…">
          <FilterSelect value={status} onChange={(event) => setStatus(event.target.value as 'ALL' | ShipmentStatus)} aria-label="Shipment status">
            <option value="ALL">All statuses</option>
            {STATUS_OPTIONS.map((value) => <option value={value} key={value}>{statusLabel(value)}</option>)}
          </FilterSelect>
        </FilterToolbar>

        {loading && shipments.length === 0 ? <LoadingState label="Loading shipments" detail="Reading delivery records…" /> : <div className="shipping-list">
          {shipments.map((shipment) => (
            <article className="shipping-row" key={shipment._id}>
              <button type="button" className="shipping-row-main" onClick={() => void openShipment(shipment._id)}>
                <span className="shipping-row-icon"><Truck size={19} /></span>
                <span className="shipping-row-copy">
                  <strong>{shipment.recipientName}</strong>
                  <small>{shipment.shipmentNo} · {shipment.recipientPhone}</small>
                  <small>{shipment.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')}</small>
                </span>
                <span className="shipping-row-address"><strong>{shipment.address}</strong><small>{shipment.courierName || 'Courier not selected'}{shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ''}</small></span>
                <span className="shipping-row-date"><strong>{dateText(shipment.shippingDate)}</strong><ShipmentBadge status={shipment.status} /></span>
              </button>
              <button type="button" className="shipping-print-button" onClick={() => void printLabel(shipment)} disabled={shipment.status === 'CANCELLED'} aria-label={`Print label for ${shipment.shipmentNo}`}><Printer size={16} /></button>
            </article>
          ))}
          {!loading && shipments.length === 0 && <div className="shipping-empty"><Truck size={27} /><strong>{search || status !== 'ALL' ? 'No shipments match these filters' : 'No shipments yet'}</strong><span>{search || status !== 'ALL' ? 'Try another search or status.' : 'Create the first shipment to print a delivery label.'}</span>{!search && status === 'ALL' && <button type="button" className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={15} /> New shipment</button>}</div>}
        </div>}
      </section>

      {createOpen && <ShippingFormModal
        customers={customers}
        busy={busy}
        error=""
        onClose={() => !busy && setCreateOpen(false)}
        onSaved={(shipment) => {
          upsert(shipment)
          setCreateOpen(false)
          setSelectedId(shipment._id)
          void refreshSummary()
        }}
      />}

      {selected && <ShipmentDetail
        shipment={selected}
        busy={busy}
        error={detailError}
        onClose={() => { setSelectedId(null); setEditOpen(false); setDetailError('') }}
        onEdit={() => setEditOpen(true)}
        onPrint={() => void printLabel(selected)}
        onAdvance={(next) => void advance(next)}
        onCancel={() => void cancelShipment()}
      />}

      {selected && editOpen && <ShippingFormModal
        shipment={selected}
        customers={customers}
        busy={busy}
        error={detailError}
        onClose={() => !busy && setEditOpen(false)}
        onSaved={(shipment) => {
          upsert(shipment)
          setEditOpen(false)
          setDetailError('')
        }}
      />}
    </div>
  )
}
