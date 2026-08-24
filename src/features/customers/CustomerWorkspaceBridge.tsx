import { useCallback, useEffect, useMemo, useState, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Power,
  Search,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { api } from '../../lib/api'
import LoadingState from '../../components/LoadingState'

type Customer = {
  _id: string
  name: string
  phone: string
  nationalIdNumber?: string
  address?: string
  notes?: string
  active?: boolean
  createdAt: string
}

const formatDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(date)
}

function CustomerActionButton({ tooltip, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  tooltip: string
  children: ReactNode
}) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const showTooltip = (button: HTMLButtonElement) => {
    const bounds = button.getBoundingClientRect()
    setPosition({ left: bounds.left + bounds.width / 2, top: bounds.bottom + 7 })
  }
  return <>
    <button {...props} onMouseEnter={(event) => showTooltip(event.currentTarget)} onMouseLeave={() => setPosition(null)} onFocus={(event) => showTooltip(event.currentTarget)} onBlur={() => setPosition(null)}>{children}</button>
    {position && createPortal(<span className="customer-action-tooltip" role="tooltip" style={position}>{tooltip}</span>, document.body)}
  </>
}

function CustomerModal({
  customer,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  customer: Customer | null
  busy: boolean
  error: string
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    document.body.classList.add('operation-modal-open')
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.body.classList.remove('operation-modal-open')
    }
  }, [busy, onClose])

  return (
    <div
      className="operation-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section className="operation-modal customer-modal" role="dialog" aria-modal="true" aria-label={customer ? 'Edit customer' : 'Add customer'}>
        <header className="operation-modal-header">
          <span className="operation-modal-icon"><UserRound size={21} /></span>
          <div>
            <span className="eyebrow">Customer record</span>
            <h2>{customer ? 'Edit customer' : 'Add customer'}</h2>
            <p>{customer ? 'Update customer contact and identification details.' : 'Create the customer before starting a pawn, purchase, or sale.'}</p>
          </div>
          <button type="button" className="operation-modal-close" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={19} />
          </button>
        </header>

        <form id="customer-record-form" className="operation-form" onSubmit={onSubmit} key={customer?._id || 'new'}>
          {error && <div className="operation-modal-error"><AlertTriangle size={17} /> {error}</div>}
          <div className="operation-form-grid">
            <label>Full name<input name="name" required autoFocus defaultValue={customer?.name || ''} placeholder="Customer full name" /></label>
            <label>Phone number <small className="optional-marker">Optional</small><input name="phone" defaultValue={customer?.phone || ''} placeholder="012 345 678" /></label>
            <label>National ID number <small className="optional-marker">Optional</small><input name="nationalIdNumber" defaultValue={customer?.nationalIdNumber || ''} placeholder="ID number" /></label>
            <label>Address <small className="optional-marker">Optional</small><input name="address" defaultValue={customer?.address || ''} placeholder="Village, district, province" /></label>
            <label className="operation-wide">Notes <small className="optional-marker">Optional</small><textarea name="notes" rows={4} defaultValue={customer?.notes || ''} placeholder="Ownership details, contact notes, or other information" /></label>
          </div>
        </form>
        <footer className="operation-modal-actions customer-modal-actions">
          <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="customer-record-form" className="primary-button" disabled={busy}>{busy ? 'Saving...' : customer ? 'Save changes' : 'Save customer'}</button>
        </footer>
      </section>
    </div>
  )
}

type CustomerSuccess = {
  action: 'saved' | 'deleted'
  message: string
}

function CustomerSuccessModal({ success, onClose }: { success: CustomerSuccess; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    document.body.classList.add('operation-modal-open')
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.body.classList.remove('operation-modal-open')
    }
  }, [onClose])

  return createPortal(
    <div className="operation-modal-backdrop customer-save-success-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="operation-modal customer-save-success-modal" role="dialog" aria-modal="true" aria-labelledby="customer-save-success-title">
        <span className="customer-save-success-icon"><CheckCircle2 size={30} /></span>
        <span className="eyebrow">Customer record {success.action === 'deleted' ? 'deleted' : 'saved'}</span>
        <h2 id="customer-save-success-title">{success.message}</h2>
        <p>{success.action === 'deleted' ? 'The customer profile has been removed from your shop.' : 'The customer profile is ready to use in your shop.'}</p>
        <button type="button" className="primary-button" onClick={onClose} autoFocus><CheckCircle2 size={16} /> Done</button>
      </section>
    </div>,
    document.body,
  )
}

function DeleteCustomerModal({ customer, busy, error, onClose, onConfirm }: {
  customer: Customer
  busy: boolean
  error: string
  onClose: () => void
  onConfirm: () => void
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', closeOnEscape)
    document.body.classList.add('operation-modal-open')
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.body.classList.remove('operation-modal-open')
    }
  }, [busy, onClose])

  return createPortal(
    <div className="operation-modal-backdrop customer-delete-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <section className="operation-modal customer-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-customer-title">
        <button type="button" className="customer-delete-close" onClick={onClose} disabled={busy} aria-label="Close"><X size={18} /></button>
        {error && <div className="operation-modal-error"><AlertTriangle size={17} /> {error}</div>}
        <div className="customer-delete-content">
          <span className="customer-delete-icon"><Trash2 size={22} /></span>
          <h2 id="delete-customer-title">Delete “{customer.name}”?</h2>
          <p>The customer profile will be permanently deleted. Customers linked to transaction history cannot be deleted.</p>
          <span className="customer-delete-warning"><AlertTriangle size={14} /> This action cannot be undone.</span>
        </div>
        <footer className="customer-delete-actions">
          <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="customer-delete-confirm" onClick={onConfirm} disabled={busy}><Trash2 size={15} /> {busy ? 'Deleting...' : 'Delete'}</button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}

function CustomerPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [success, setSuccess] = useState<CustomerSuccess | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState<Customer | null>(null)

  const loadCustomers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api<{ customers: Customer[] }>('/customers?includeInactive=true')
      setCustomers(result.customers)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load customers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCustomers()
  }, [loadCustomers])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return customers
    return customers.filter((customer) => [
      customer.name,
      customer.phone,
      customer.nationalIdNumber,
      customer.address,
    ].some((value) => String(value || '').toLowerCase().includes(term)))
  }, [customers, search])

  const verifiedCount = customers.filter((customer) => Boolean(customer.nationalIdNumber)).length
  const missingIdCount = customers.length - verifiedCount

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    setBusy(true)
    setModalError('')
    const form = new FormData(formElement)
    const payload = {
      name: String(form.get('name') || '').trim(),
      phone: String(form.get('phone') || '').trim(),
      nationalIdNumber: String(form.get('nationalIdNumber') || '').trim(),
      address: String(form.get('address') || '').trim(),
      notes: String(form.get('notes') || '').trim(),
    }
    const isEditing = Boolean(editing)

    try {
      await api(editing ? `/customers/${editing._id}` : '/customers', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      formElement.reset()
      setShowModal(false)
      setEditing(null)
      setSuccess({ action: 'saved', message: isEditing ? `${payload.name} updated` : `${payload.name} added` })
      await loadCustomers()
      window.dispatchEvent(new CustomEvent('phoneflow:customers-updated'))
    } catch (reason) {
      setModalError(reason instanceof Error ? reason.message : 'Unable to save customer')
    } finally {
      setBusy(false)
    }
  }

  async function deleteCustomer() {
    if (!deleting) return
    const customer = deleting
    setBusy(true)
    setDeleteError('')
    try {
      await api(`/customers/${customer._id}`, { method: 'DELETE' })
      setDeleting(null)
      await loadCustomers()
      window.dispatchEvent(new CustomEvent('phoneflow:customers-updated'))
      setSuccess({ action: 'deleted', message: `${customer.name} deleted` })
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : 'Unable to delete customer')
    } finally {
      setBusy(false)
    }
  }

  const openCreate = () => { setEditing(null); setModalError(''); setShowModal(true) }
  const openEdit = (customer: Customer) => { setEditing(customer); setModalError(''); setShowModal(true) }

  return (
    <div className="customer-workspace-bridge">
      <div className="section-header">
        <div>
          <span className="eyebrow">Operations</span>
          <h2>Customer management</h2>
          <p>Manage customer contacts and National ID information used by pawn, purchase, and sale transactions.</p>
        </div>
        <button className="primary-button" onClick={openCreate}>
          <Plus size={17} /> Add customer
        </button>
      </div>

      {error && <div className="customer-error"><AlertTriangle size={17} /> {error}</div>}

      <section className="mini-stats-grid customer-stats-grid">
        <article className="surface-card mini-stat"><Users /><p>Total customers<strong>{customers.length}</strong><small>saved in MongoDB</small></p></article>
        <article className="surface-card mini-stat"><BadgeCheck /><p>ID recorded<strong>{verifiedCount}</strong><small>ready for pawn verification</small></p></article>
        <article className="surface-card mini-stat"><AlertTriangle /><p>Missing ID<strong>{missingIdCount}</strong><small>can still be used for walk-in sales</small></p></article>
        <article className="surface-card mini-stat"><Phone /><p>Contact records<strong>{customers.filter((customer) => customer.phone).length}</strong><small>phone numbers available</small></p></article>
      </section>

      <article className="surface-card table-card page-table customer-table-card">
        <div className="filter-row customer-filter-row">
          <div className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, National ID, or address" /></div>
          <button className="ghost-button" onClick={() => void loadCustomers()}>Refresh</button>
        </div>

        <div className="table-scroll">
          <table>
            <thead><tr><th>Customer</th><th>Phone</th><th>National ID</th><th>Address</th><th>Added</th><th>Status</th><th /></tr></thead>
            <tbody>
              {filtered.map((customer) => (
                <tr key={customer._id}>
                  <td><div className="customer-name-cell"><span className="avatar">{customer.name.slice(0, 2).toUpperCase()}</span><p><strong>{customer.name}</strong><small>{customer.notes || 'No notes'}</small></p></div></td>
                  <td>{customer.phone}</td>
                  <td>{customer.nationalIdNumber || <span className="warning-text">Not recorded</span>}</td>
                  <td>{customer.address ? <span className="customer-address"><MapPin size={14} /> {customer.address}</span> : '—'}</td>
                  <td>{formatDate(customer.createdAt)}</td>
                  <td>{customer.active === false ? <span className="unverified"><Power size={15} /> Inactive</span> : customer.nationalIdNumber ? <span className="verified"><BadgeCheck size={15} /> ID ready</span> : <span className="unverified"><AlertTriangle size={15} /> Basic profile</span>}</td>
                  <td><div className="customer-row-actions"><CustomerActionButton className="icon-button customer-action-edit" onClick={() => openEdit(customer)} aria-label={`Edit ${customer.name}`} tooltip="Edit"><Pencil size={15} /></CustomerActionButton><CustomerActionButton className="icon-button customer-action-delete" disabled={busy} onClick={() => { setDeleteError(''); setDeleting(customer) }} aria-label={`Delete ${customer.name}`} tooltip="Delete"><Trash2 size={15} /></CustomerActionButton></div></td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && <tr><td colSpan={7}><div className="customer-empty"><UserRound size={30} /><strong>{customers.length === 0 ? 'No customers yet' : 'No matching customers'}</strong><span>{customers.length === 0 ? 'Add the first customer so they can be selected in pawn, purchase, and sale forms.' : 'Try another search term.'}</span><button className="primary-button" onClick={openCreate}><Plus size={16} /> Add customer</button></div></td></tr>}
              {loading && <tr><td colSpan={7}><LoadingState compact label="Loading customers" detail="Reading customer profiles…" /></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="customer-mobile-list">
          {filtered.map((customer) => (
            <article className="customer-mobile-card" key={customer._id}>
              <div className="customer-mobile-heading">
                <span className="avatar">{customer.name.slice(0, 2).toUpperCase()}</span>
                <p><strong>{customer.name}</strong><small>{customer.phone}</small></p>
                {customer.nationalIdNumber ? <span className="verified"><BadgeCheck size={14} /> ID ready</span> : <span className="unverified"><AlertTriangle size={14} /> Basic</span>}
              </div>
              <div className="customer-mobile-details">
                <div><span>National ID</span><strong>{customer.nationalIdNumber || 'Not recorded'}</strong></div>
                <div><span>Added</span><strong>{formatDate(customer.createdAt)}</strong></div>
              </div>
              {customer.address && <p className="customer-mobile-address"><MapPin size={13} /> {customer.address}</p>}
              <footer className="customer-mobile-actions"><button className="ghost-button customer-action-edit" onClick={() => openEdit(customer)}><Pencil size={14} /> Edit</button><button className="ghost-button customer-action-delete" disabled={busy} onClick={() => { setDeleteError(''); setDeleting(customer) }}><Trash2 size={14} /> Delete</button></footer>
            </article>
          ))}
          {!loading && filtered.length === 0 && <div className="customer-mobile-empty">{customers.length === 0 ? 'No customers yet.' : 'No matching customers.'}</div>}
          {loading && <LoadingState compact label="Loading customers" />}
        </div>
      </article>

      {showModal && <CustomerModal customer={editing} busy={busy} error={modalError} onClose={() => { if (!busy) { setShowModal(false); setEditing(null) } }} onSubmit={saveCustomer} />}
      {deleting && <DeleteCustomerModal customer={deleting} busy={busy} error={deleteError} onClose={() => { if (!busy) setDeleting(null) }} onConfirm={() => void deleteCustomer()} />}
      {success && <CustomerSuccessModal success={success} onClose={() => setSuccess(null)} />}
    </div>
  )
}

export default function CustomerWorkspaceBridge() {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    const sync = () => {
      const main = document.querySelector<HTMLElement>('.main-content')
      const activeButton = document.querySelector<HTMLElement>('.sidebar-nav .nav-group button.active')
      const label = activeButton?.querySelector('span')?.textContent?.trim()
      setTarget(main)
      setActive(label === 'Customers')
    }

    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  if (!target || !active) return null
  return createPortal(<CustomerPage />, target)
}
