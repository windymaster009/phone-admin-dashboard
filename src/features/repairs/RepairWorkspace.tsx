import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  Hammer,
  PackageCheck,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
  Wrench,
  XCircle,
} from 'lucide-react'
import { api } from '../../lib/api'
import DetailModalBody from '../../components/DetailModalBody'
import DetailModalFooter from '../../components/DetailModalFooter'
import DetailModalHeader from '../../components/DetailModalHeader'
import DetailModalShell from '../../components/DetailModalShell'
import FilterSelect from '../../components/FilterSelect'
import FilterToolbar from '../../components/FilterToolbar'
import LoadingState from '../../components/LoadingState'
import OperationModalShell from '../../components/OperationModalShell'
import SummaryStats from '../../components/SummaryStats'
import './repair-workspace.css'

type Customer = {
  _id: string
  name: string
  phone?: string
  nationalIdNumber?: string
  address?: string
  active?: boolean
}

type StaffRef = {
  _id?: string
  name?: string
  role?: string
}

type RepairItemStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'DECLINED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'
type RepairStatus = 'RECEIVED' | 'CHECKING' | 'WAITING_APPROVAL' | 'IN_REPAIR' | 'READY_FOR_PICKUP' | 'COMPLETED' | 'CANCELLED'

type RepairItem = {
  _id: string
  repairType: string
  problemDescription?: string
  partCost: number
  serviceFee: number
  customerPrice: number
  status: RepairItemStatus
  approvalMethod?: string
  approvalNote?: string
  approvedAt?: string
  approvedBy?: StaffRef
  declinedAt?: string
  declinedBy?: StaffRef
  startedAt?: string
  completedAt?: string
  cancelledAt?: string
  cancelledBy?: StaffRef
  cancelReason?: string
  addedBy?: StaffRef
}

type RepairTimeline = {
  _id: string
  action: string
  label: string
  note?: string
  itemId?: string
  user?: StaffRef
  at: string
}

type RepairTotals = {
  partCost: number
  serviceFee: number
  approvedTotal: number
  pendingTotal: number
  potentialTotal: number
  grossProfit: number
}

type RepairTicket = {
  _id: string
  repairNo: string
  customer?: Customer
  customerSnapshot: {
    name: string
    phone: string
    nationalIdNumber?: string
    address?: string
  }
  device: {
    brand?: string
    model: string
    imei?: string
    serialNumber?: string
    color?: string
    condition?: string
    accessoriesReceived?: string[]
  }
  initialProblem: string
  status: RepairStatus
  expectedFinishAt?: string
  receivedAt?: string
  completedAt?: string
  cancelledAt?: string
  cancelReason?: string
  notes?: string
  items: RepairItem[]
  timeline: RepairTimeline[]
  totals: RepairTotals
  createdAt: string
  createdBy?: StaffRef
}

type RepairSummary = {
  counts: {
    total: number
    received: number
    checking: number
    waitingApproval: number
    inRepair: number
    ready: number
    completed: number
    cancelled: number
  }
  approvedValue: number
  pendingValue: number
}

type ApprovalMethod = 'IN_SHOP' | 'PHONE' | 'TELEGRAM' | 'MESSENGER' | 'OTHER'

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

function dateText(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
}

function RepairBadge({ status }: { status: RepairStatus | RepairItemStatus }) {
  const tone = status === 'COMPLETED' || status === 'DONE' || status === 'APPROVED'
    ? 'green'
    : status === 'CANCELLED' || status === 'DECLINED'
      ? 'rose'
      : status === 'WAITING_APPROVAL' || status === 'PENDING_APPROVAL'
        ? 'orange'
        : 'blue'
  return <span className={`repair-badge repair-badge-${tone}`}>{titleCase(status)}</span>
}

function emptyTotals(): RepairTotals {
  return { partCost: 0, serviceFee: 0, approvedTotal: 0, pendingTotal: 0, potentialTotal: 0, grossProfit: 0 }
}

function CreateRepairModal({
  customers,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  customers: Customer[]
  busy: boolean
  error: string
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const [partCost, setPartCost] = useState(0)
  const [serviceFee, setServiceFee] = useState(0)
  const total = Math.max(0, partCost + serviceFee)

  return (
    <OperationModalShell
      title="New repair ticket"
      eyebrow="Customer repair"
      description="Register the customer, device, and the first approved repair."
      icon={<Wrench size={21} />}
      error={error}
      busy={busy}
      onClose={onClose}
      className="repair-operation-modal"
    >
      <form id="repair-create-form" className="repair-form" onSubmit={onSubmit}>
        <section className="repair-form-section">
          <header><span>1</span><div><strong>Customer</strong><small>Use a saved profile or enter the customer manually.</small></div></header>
          <div className="operation-form-grid">
            <label className="operation-wide">Saved customer <small>Optional</small>
              <select name="customerId" defaultValue="">
                <option value="">Manual customer</option>
                {customers.filter((customer) => customer.active !== false).map((customer) => (
                  <option key={customer._id} value={customer._id}>{customer.name}{customer.phone ? ` — ${customer.phone}` : ''}</option>
                ))}
              </select>
            </label>
            <label>Customer name<input name="customerName" placeholder="Required for manual customer" /></label>
            <label>Phone number<input name="customerPhone" placeholder="Required for manual customer" /></label>
            <label>National ID <small>Optional</small><input name="nationalIdNumber" /></label>
            <label>Address <small>Optional</small><input name="address" /></label>
          </div>
        </section>

        <section className="repair-form-section">
          <header><span>2</span><div><strong>Device</strong><small>Record enough information to identify the exact phone.</small></div></header>
          <div className="operation-form-grid">
            <label>Brand<input name="brand" placeholder="Apple" /></label>
            <label>Model<input name="model" required placeholder="iPhone 13 Pro" /></label>
            <label>IMEI <small>Optional</small><input name="imei" /></label>
            <label>Serial number <small>Optional</small><input name="serialNumber" /></label>
            <label>Color <small>Optional</small><input name="color" /></label>
            <label>Condition <small>Optional</small><input name="condition" placeholder="Cracked screen, normal body" /></label>
            <fieldset className="repair-accessories operation-wide">
              <legend>Received with device</legend>
              {['Case', 'SIM card', 'Charger', 'Box'].map((item) => <label key={item}><input type="checkbox" name="accessoriesReceived" value={item} /> {item}</label>)}
            </fieldset>
          </div>
        </section>

        <section className="repair-form-section">
          <header><span>3</span><div><strong>Initial repair</strong><small>The first requested repair is treated as customer-approved.</small></div></header>
          <div className="operation-form-grid">
            <label className="operation-wide">Customer problem<textarea name="initialProblem" required rows={2} placeholder="Broken screen, no touch..." /></label>
            <label>Repair type<input name="repairType" required placeholder="Screen replacement" /></label>
            <label>Part cost<input name="partCost" type="number" min="0" step="0.01" value={partCost} onChange={(event) => setPartCost(Number(event.target.value))} /></label>
            <label>Service fee<input name="serviceFee" type="number" min="0" step="0.01" value={serviceFee} onChange={(event) => setServiceFee(Number(event.target.value))} /></label>
            <label>Customer price<input name="customerPrice" type="number" min="0" step="0.01" value={total} readOnly /></label>
            <label>Expected finish <small>Optional</small><input name="expectedFinishAt" type="datetime-local" /></label>
            <label className="operation-wide">Notes <small>Optional</small><textarea name="notes" rows={2} /></label>
          </div>
          <div className="repair-price-preview"><span>Initial approved total</span><strong>{money.format(total)}</strong></div>
        </section>
      </form>
      <footer className="operation-modal-actions">
        <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" form="repair-create-form" className="primary-button" disabled={busy}>{busy ? 'Creating...' : 'Create repair ticket'}</button>
      </footer>
    </OperationModalShell>
  )
}

function AddRepairItemModal({
  busy,
  error,
  onClose,
  onSubmit,
}: {
  busy: boolean
  error: string
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const [partCost, setPartCost] = useState(0)
  const [serviceFee, setServiceFee] = useState(0)
  const [alreadyApproved, setAlreadyApproved] = useState(false)
  const total = Math.max(0, partCost + serviceFee)

  return (
    <OperationModalShell
      title="Add repair item"
      eyebrow="Repair discovery"
      description="Add another issue found during inspection. New work waits for customer approval unless already approved."
      icon={<Hammer size={21} />}
      error={error}
      busy={busy}
      onClose={onClose}
      className="repair-operation-modal repair-add-item-modal"
    >
      <form id="repair-add-item-form" className="repair-form" onSubmit={onSubmit}>
        <div className="operation-form-grid">
          <label>Repair type<input name="repairType" required autoFocus data-modal-initial-focus placeholder="Battery replacement" /></label>
          <label>Part cost<input name="partCost" type="number" min="0" step="0.01" value={partCost} onChange={(event) => setPartCost(Number(event.target.value))} /></label>
          <label>Service fee<input name="serviceFee" type="number" min="0" step="0.01" value={serviceFee} onChange={(event) => setServiceFee(Number(event.target.value))} /></label>
          <label>Customer price<input name="customerPrice" type="number" min="0" step="0.01" value={total} readOnly /></label>
          <label className="operation-wide">Problem / reason<textarea name="problemDescription" required rows={3} placeholder="Battery health is poor during screen inspection." /></label>
          <label className="repair-check-row operation-wide"><input type="checkbox" name="alreadyApproved" checked={alreadyApproved} onChange={(event) => setAlreadyApproved(event.target.checked)} /> Customer already approved this repair</label>
          {alreadyApproved && <>
            <label>Approval method<select name="approvalMethod" defaultValue="IN_SHOP"><option value="IN_SHOP">Customer in shop</option><option value="PHONE">Phone call</option><option value="TELEGRAM">Telegram</option><option value="MESSENGER">Messenger</option><option value="OTHER">Other</option></select></label>
            <label>Approval note <small>Optional</small><input name="approvalNote" placeholder="Customer agreed during inspection" /></label>
          </>}
        </div>
        <div className="repair-price-preview"><span>{alreadyApproved ? 'Approved price' : 'Pending approval'}</span><strong>{money.format(total)}</strong></div>
      </form>
      <footer className="operation-modal-actions">
        <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" form="repair-add-item-form" className="primary-button" disabled={busy}>{busy ? 'Adding...' : alreadyApproved ? 'Add approved repair' : 'Add & request approval'}</button>
      </footer>
    </OperationModalShell>
  )
}

function DecisionModal({
  mode,
  item,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  mode: 'approve' | 'decline' | 'cancel-item' | 'cancel-ticket'
  item?: RepairItem
  busy: boolean
  error: string
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const approving = mode === 'approve'
  const title = approving ? 'Approve repair item' : mode === 'decline' ? 'Decline repair item' : mode === 'cancel-item' ? 'Cancel repair item' : 'Cancel repair ticket'
  return (
    <OperationModalShell
      title={title}
      eyebrow="Customer repair"
      description={item ? `${item.repairType} · ${money.format(item.customerPrice)}` : 'This will stop all remaining work on this ticket.'}
      icon={approving ? <CheckCircle2 size={21} /> : <AlertTriangle size={21} />}
      error={error}
      busy={busy}
      onClose={onClose}
      compact
      className="repair-decision-modal"
    >
      <form id="repair-decision-form" className="repair-form repair-decision-form" onSubmit={onSubmit}>
        {approving ? <>
          <label>Approval method<select name="approvalMethod" defaultValue="IN_SHOP"><option value="IN_SHOP">Customer in shop</option><option value="PHONE">Phone call</option><option value="TELEGRAM">Telegram</option><option value="MESSENGER">Messenger</option><option value="OTHER">Other</option></select></label>
          <label>Note <small>Optional</small><textarea name="note" rows={3} placeholder="Customer agreed to replace battery." /></label>
        </> : <>
          <label>{mode === 'decline' ? 'Reason customer declined' : 'Cancellation reason'}<textarea name="reason" required rows={3} placeholder={mode === 'decline' ? 'Customer only wants the original screen repair.' : 'Customer changed mind.'} /></label>
        </>}
      </form>
      <footer className="operation-modal-actions">
        <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>Back</button>
        <button type="submit" form="repair-decision-form" className={approving ? 'primary-button' : 'repair-danger-button'} disabled={busy}>
          {busy ? 'Saving...' : approving ? 'Approve' : mode === 'decline' ? 'Decline' : 'Cancel'}
        </button>
      </footer>
    </OperationModalShell>
  )
}

function RepairDetail({
  repair,
  busy,
  onClose,
  onAddItem,
  onDecision,
  onItemAction,
  onStatus,
  onCancelTicket,
}: {
  repair: RepairTicket
  busy: boolean
  onClose: () => void
  onAddItem: () => void
  onDecision: (mode: 'approve' | 'decline' | 'cancel-item', item: RepairItem) => void
  onItemAction: (item: RepairItem, action: 'start' | 'complete') => void
  onStatus: (status: RepairStatus) => void
  onCancelTicket: () => void
}) {
  const nextAction: Partial<Record<RepairStatus, { label: string; status: RepairStatus }>> = {
    RECEIVED: { label: 'Start checking', status: 'CHECKING' },
    CHECKING: { label: 'Start repair', status: 'IN_REPAIR' },
    IN_REPAIR: { label: 'Mark ready for pickup', status: 'READY_FOR_PICKUP' },
    READY_FOR_PICKUP: { label: 'Complete pickup', status: 'COMPLETED' },
  }
  const next = nextAction[repair.status]
  const closed = ['COMPLETED', 'CANCELLED'].includes(repair.status)

  return (
    <DetailModalShell onClose={onClose} titleId="repair-detail-title" className="repair-detail-modal">
      <DetailModalHeader
        eyebrow="Customer repair"
        title={repair.repairNo}
        titleId="repair-detail-title"
        description={`${repair.customerSnapshot.name} · ${repair.device.brand || ''} ${repair.device.model}`.trim()}
        badge={<RepairBadge status={repair.status} />}
        onClose={onClose}
      />
      <DetailModalBody className="repair-detail-body">
        <div className="repair-detail-top">
          <section>
            <span className="eyebrow">Customer</span>
            <h4>{repair.customerSnapshot.name}</h4>
            <p><Phone size={14} /> {repair.customerSnapshot.phone}</p>
            {repair.customerSnapshot.nationalIdNumber && <p><ShieldCheck size={14} /> ID {repair.customerSnapshot.nationalIdNumber}</p>}
            {repair.customerSnapshot.address && <small>{repair.customerSnapshot.address}</small>}
          </section>
          <section>
            <span className="eyebrow">Device</span>
            <h4>{[repair.device.brand, repair.device.model].filter(Boolean).join(' ')}</h4>
            <p><Smartphone size={14} /> {repair.device.imei || repair.device.serialNumber || 'No IMEI / serial'}</p>
            <small>{[repair.device.color, repair.device.condition].filter(Boolean).join(' · ') || 'Condition not recorded'}</small>
          </section>
          <section>
            <span className="eyebrow">Ticket</span>
            <h4>{dateText(repair.receivedAt || repair.createdAt)}</h4>
            <p><Clock3 size={14} /> Expected {dateText(repair.expectedFinishAt)}</p>
            <small>{repair.initialProblem}</small>
          </section>
        </div>

        {repair.status === 'CANCELLED' && <div className="repair-cancel-banner"><XCircle size={17} /><div><strong>Repair cancelled</strong><span>{repair.cancelReason || 'No reason recorded'}</span></div></div>}

        <section className="repair-items-section">
          <header>
            <div><span className="eyebrow">Repair items</span><h4>Work on this phone</h4></div>
            {!closed && <button type="button" className="primary-button" onClick={onAddItem}><Plus size={15} /> Add repair item</button>}
          </header>
          <div className="repair-item-table-wrap">
            <table className="repair-item-table">
              <thead><tr><th>Repair</th><th>Part cost</th><th>Service fee</th><th>Customer price</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {repair.items.map((item) => <tr key={item._id}>
                  <td><strong>{item.repairType}</strong><small>{item.problemDescription || 'No description'}</small></td>
                  <td>{money.format(item.partCost)}</td>
                  <td>{money.format(item.serviceFee)}</td>
                  <td><strong>{money.format(item.customerPrice)}</strong></td>
                  <td><RepairBadge status={item.status} /></td>
                  <td><div className="repair-row-actions">
                    {item.status === 'PENDING_APPROVAL' && <><button type="button" className="repair-action-approve" onClick={() => onDecision('approve', item)}>Approve</button><button type="button" className="repair-action-decline" onClick={() => onDecision('decline', item)}>Decline</button></>}
                    {item.status === 'APPROVED' && <button type="button" onClick={() => onItemAction(item, 'start')}>Start</button>}
                    {item.status === 'IN_PROGRESS' && <button type="button" onClick={() => onItemAction(item, 'complete')}>Done</button>}
                    {!['DONE', 'DECLINED', 'CANCELLED'].includes(item.status) && <button type="button" className="repair-action-cancel" onClick={() => onDecision('cancel-item', item)} aria-label={`Cancel ${item.repairType}`}><Trash2 size={14} /></button>}
                  </div></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>

        <div className="repair-totals">
          <article><span>Total parts cost</span><strong>{money.format(repair.totals.partCost)}</strong></article>
          <article><span>Total service fee</span><strong>{money.format(repair.totals.serviceFee)}</strong></article>
          <article className="approved"><span>Approved total</span><strong>{money.format(repair.totals.approvedTotal)}</strong></article>
          <article className="pending"><span>Pending approval</span><strong>{money.format(repair.totals.pendingTotal)}</strong></article>
          <article className="potential"><span>Potential total</span><strong>{money.format(repair.totals.potentialTotal)}</strong></article>
        </div>

        <section className="repair-timeline">
          <header><span className="eyebrow">History</span><h4>Repair timeline</h4></header>
          <div>
            {[...repair.timeline].reverse().map((entry) => <article key={entry._id}>
              <span className="repair-timeline-dot" />
              <p><strong>{entry.label}</strong><small>{entry.user?.name || 'System'} · {dateText(entry.at)}</small>{entry.note && <em>{entry.note}</em>}</p>
            </article>)}
          </div>
        </section>
      </DetailModalBody>
      <DetailModalFooter
        destructiveAction={!closed ? <button type="button" className="repair-danger-button" onClick={onCancelTicket} disabled={busy}>Cancel repair</button> : undefined}
        transactionActions={next ? <button type="button" className="primary-button" onClick={() => onStatus(next.status)} disabled={busy}>{next.label}</button> : undefined}
        dismissAction={<button type="button" className="ghost-button" onClick={onClose}>Close</button>}
      />
    </DetailModalShell>
  )
}

export default function RepairWorkspace() {
  const [repairs, setRepairs] = useState<RepairTicket[]>([])
  const [summary, setSummary] = useState<RepairSummary>({ counts: { total: 0, received: 0, checking: 0, waitingApproval: 0, inRepair: 0, ready: 0, completed: 0, cancelled: 0 }, approvedValue: 0, pendingValue: 0 })
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'ALL' | RepairStatus>('ALL')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [selected, setSelected] = useState<RepairTicket | null>(null)
  const [decision, setDecision] = useState<{ mode: 'approve' | 'decline' | 'cancel-item' | 'cancel-ticket'; item?: RepairItem } | null>(null)

  const loadSummary = useCallback(async () => {
    const result = await api<{ summary: RepairSummary }>('/repairs/summary')
    setSummary(result.summary)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [repairResult, customerResult, summaryResult] = await Promise.all([
        api<{ repairs: RepairTicket[] }>('/repairs'),
        api<{ customers: Customer[] }>('/customers?includeInactive=true'),
        api<{ summary: RepairSummary }>('/repairs/summary'),
      ])
      setRepairs(repairResult.repairs)
      setCustomers(customerResult.customers)
      setSummary(summaryResult.summary)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load customer repairs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return repairs.filter((repair) => {
      if (status !== 'ALL' && repair.status !== status) return false
      if (!term) return true
      return [
        repair.repairNo,
        repair.customerSnapshot.name,
        repair.customerSnapshot.phone,
        repair.device.brand,
        repair.device.model,
        repair.device.imei,
        repair.initialProblem,
      ].some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [repairs, search, status])

  const refreshRepair = useCallback(async (repair: RepairTicket) => {
    setRepairs((current) => current.map((item) => item._id === repair._id ? repair : item))
    setSelected(repair)
    await loadSummary()
  }, [loadSummary])

  async function openRepair(id: string) {
    setError('')
    try {
      const result = await api<{ repair: RepairTicket }>(`/repairs/${id}`)
      setSelected(result.repair)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to open repair')
    }
  }

  async function createRepair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setModalError('')
    const form = new FormData(event.currentTarget)
    const accessories = form.getAll('accessoriesReceived').map(String)
    const payload = {
      customerId: String(form.get('customerId') || '') || undefined,
      customerName: String(form.get('customerName') || ''),
      customerPhone: String(form.get('customerPhone') || ''),
      nationalIdNumber: String(form.get('nationalIdNumber') || ''),
      address: String(form.get('address') || ''),
      device: {
        brand: String(form.get('brand') || ''),
        model: String(form.get('model') || ''),
        imei: String(form.get('imei') || ''),
        serialNumber: String(form.get('serialNumber') || ''),
        color: String(form.get('color') || ''),
        condition: String(form.get('condition') || ''),
        accessoriesReceived: accessories,
      },
      initialProblem: String(form.get('initialProblem') || ''),
      expectedFinishAt: form.get('expectedFinishAt') || undefined,
      notes: String(form.get('notes') || ''),
      initialItem: {
        repairType: String(form.get('repairType') || ''),
        problemDescription: String(form.get('initialProblem') || ''),
        partCost: Number(form.get('partCost') || 0),
        serviceFee: Number(form.get('serviceFee') || 0),
        customerPrice: Number(form.get('customerPrice') || 0),
        approvalMethod: 'IN_SHOP',
      },
    }
    try {
      const result = await api<{ repair: RepairTicket }>('/repairs', { method: 'POST', body: JSON.stringify(payload) })
      setRepairs((current) => [result.repair, ...current])
      setCreateOpen(false)
      setSelected(result.repair)
      await loadSummary()
    } catch (reason) {
      setModalError(reason instanceof Error ? reason.message : 'Unable to create repair ticket')
    } finally {
      setBusy(false)
    }
  }

  async function addRepairItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    setBusy(true)
    setModalError('')
    const form = new FormData(event.currentTarget)
    const payload = {
      repairType: String(form.get('repairType') || ''),
      problemDescription: String(form.get('problemDescription') || ''),
      partCost: Number(form.get('partCost') || 0),
      serviceFee: Number(form.get('serviceFee') || 0),
      customerPrice: Number(form.get('customerPrice') || 0),
      alreadyApproved: form.get('alreadyApproved') === 'on',
      approvalMethod: String(form.get('approvalMethod') || 'IN_SHOP'),
      approvalNote: String(form.get('approvalNote') || ''),
    }
    try {
      const result = await api<{ repair: RepairTicket }>(`/repairs/${selected._id}/items`, { method: 'POST', body: JSON.stringify(payload) })
      setAddItemOpen(false)
      await refreshRepair(result.repair)
    } catch (reason) {
      setModalError(reason instanceof Error ? reason.message : 'Unable to add repair item')
    } finally {
      setBusy(false)
    }
  }

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !decision) return
    setBusy(true)
    setModalError('')
    const form = new FormData(event.currentTarget)
    try {
      let path = ''
      let body: Record<string, unknown> = {}
      if (decision.mode === 'cancel-ticket') {
        path = `/repairs/${selected._id}/cancel`
        body = { reason: String(form.get('reason') || '') }
      } else if (decision.item) {
        path = `/repairs/${selected._id}/items/${decision.item._id}/${decision.mode === 'cancel-item' ? 'cancel' : decision.mode}`
        body = decision.mode === 'approve'
          ? { approvalMethod: String(form.get('approvalMethod') || 'IN_SHOP'), note: String(form.get('note') || '') }
          : { reason: String(form.get('reason') || '') }
      }
      const result = await api<{ repair: RepairTicket }>(path, { method: 'POST', body: JSON.stringify(body) })
      setDecision(null)
      await refreshRepair(result.repair)
    } catch (reason) {
      setModalError(reason instanceof Error ? reason.message : 'Unable to update repair')
    } finally {
      setBusy(false)
    }
  }

  async function itemAction(item: RepairItem, action: 'start' | 'complete') {
    if (!selected || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await api<{ repair: RepairTicket }>(`/repairs/${selected._id}/items/${item._id}/${action}`, { method: 'POST', body: '{}' })
      await refreshRepair(result.repair)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update repair item')
    } finally {
      setBusy(false)
    }
  }

  async function updateStatus(nextStatus: RepairStatus) {
    if (!selected || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await api<{ repair: RepairTicket }>(`/repairs/${selected._id}/status`, { method: 'POST', body: JSON.stringify({ status: nextStatus }) })
      await refreshRepair(result.repair)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update repair status')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="repair-workspace">
      <header className="section-header repair-page-header">
        <div><span className="eyebrow">Operations</span><h2>Customer Repair</h2><p>Track phone repairs, customer approvals, extra work, cancellations, and final pickup.</p></div>
        <button type="button" className="primary-button" onClick={() => { setModalError(''); setCreateOpen(true) }}><Plus size={17} /> New repair</button>
      </header>

      {error && <div className="repair-alert" role="alert"><AlertTriangle size={17} /> {error}<button type="button" onClick={() => setError('')} aria-label="Dismiss"><XCircle size={15} /></button></div>}

      <SummaryStats
        label="Repair summary"
        items={[
          { label: 'Active repairs', value: summary.counts.received + summary.counts.checking + summary.counts.waitingApproval + summary.counts.inRepair, detail: `${summary.counts.ready} ready for pickup`, icon: Wrench, tone: 'violet' },
          { label: 'Waiting approval', value: summary.counts.waitingApproval, detail: money.format(summary.pendingValue), icon: Clock3, tone: 'orange' },
          { label: 'In repair', value: summary.counts.inRepair, detail: 'technician work in progress', icon: Hammer, tone: 'blue' },
          { label: 'Approved value', value: money.format(summary.approvedValue), detail: `${summary.counts.completed} completed tickets`, icon: CheckCircle2, tone: 'green', valueSize: 'compact' },
        ]}
      />

      <article className="surface-card repair-list-card">
        <div className="repair-status-tabs" role="tablist" aria-label="Repair status">
          {[
            ['ALL', 'All', summary.counts.total],
            ['RECEIVED', 'Received', summary.counts.received],
            ['CHECKING', 'Checking', summary.counts.checking],
            ['WAITING_APPROVAL', 'Waiting', summary.counts.waitingApproval],
            ['IN_REPAIR', 'In repair', summary.counts.inRepair],
            ['READY_FOR_PICKUP', 'Ready', summary.counts.ready],
            ['COMPLETED', 'Completed', summary.counts.completed],
            ['CANCELLED', 'Cancelled', summary.counts.cancelled],
          ].map(([value, label, count]) => <button key={String(value)} type="button" className={status === value ? 'active' : ''} onClick={() => setStatus(value as 'ALL' | RepairStatus)}>{label}<small>{count}</small></button>)}
        </div>

        <FilterToolbar search={search} onSearchChange={setSearch} searchLabel="Search repairs" placeholder="Search repair ID, customer, phone, IMEI, device...">
          <FilterSelect value={status} onChange={(event) => setStatus(event.target.value as 'ALL' | RepairStatus)} aria-label="Repair status filter">
            <option value="ALL">All statuses</option>
            <option value="RECEIVED">Received</option>
            <option value="CHECKING">Checking</option>
            <option value="WAITING_APPROVAL">Waiting approval</option>
            <option value="IN_REPAIR">In repair</option>
            <option value="READY_FOR_PICKUP">Ready for pickup</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </FilterSelect>
        </FilterToolbar>

        {loading ? <LoadingState label="Loading repairs" detail="Reading customer repair tickets..." /> : <div className="table-scroll repair-table-scroll">
          <table className="repair-table">
            <thead><tr><th>Repair ID</th><th>Customer</th><th>Device</th><th>Items</th><th>Approved</th><th>Potential</th><th>Status</th><th>Received</th></tr></thead>
            <tbody>
              {filtered.map((repair) => <tr key={repair._id} onClick={() => void openRepair(repair._id)} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') void openRepair(repair._id) }}>
                <td><strong className="mono">{repair.repairNo}</strong></td>
                <td><strong>{repair.customerSnapshot.name}</strong><small>{repair.customerSnapshot.phone}</small></td>
                <td><strong>{[repair.device.brand, repair.device.model].filter(Boolean).join(' ')}</strong><small>{repair.device.imei || repair.initialProblem}</small></td>
                <td>{repair.items.length}</td>
                <td><strong>{money.format(repair.totals?.approvedTotal || 0)}</strong></td>
                <td>{money.format(repair.totals?.potentialTotal || 0)}</td>
                <td><RepairBadge status={repair.status} /></td>
                <td>{dateText(repair.receivedAt || repair.createdAt)}</td>
              </tr>)}
              {!filtered.length && <tr><td colSpan={8}><div className="repair-empty"><Wrench size={28} /><strong>{repairs.length ? 'No matching repairs' : 'No customer repairs yet'}</strong><span>{repairs.length ? 'Try another filter or search.' : 'Create the first repair ticket to start tracking repair work.'}</span>{!repairs.length && <button type="button" className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={15} /> New repair</button>}</div></td></tr>}
            </tbody>
          </table>
        </div>}
      </article>

      {selected && <RepairDetail
        repair={{ ...selected, totals: selected.totals || emptyTotals() }}
        busy={busy}
        onClose={() => setSelected(null)}
        onAddItem={() => { setModalError(''); setAddItemOpen(true) }}
        onDecision={(mode, item) => { setModalError(''); setDecision({ mode, item }) }}
        onItemAction={(item, action) => void itemAction(item, action)}
        onStatus={(next) => void updateStatus(next)}
        onCancelTicket={() => { setModalError(''); setDecision({ mode: 'cancel-ticket' }) }}
      />}

      {createOpen && <CreateRepairModal customers={customers} busy={busy} error={modalError} onClose={() => !busy && setCreateOpen(false)} onSubmit={createRepair} />}
      {addItemOpen && <AddRepairItemModal busy={busy} error={modalError} onClose={() => !busy && setAddItemOpen(false)} onSubmit={addRepairItem} />}
      {decision && <DecisionModal mode={decision.mode} item={decision.item} busy={busy} error={modalError} onClose={() => !busy && setDecision(null)} onSubmit={submitDecision} />}
    </div>
  )
}
