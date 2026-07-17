import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  BadgeCheck,
  MapPin,
  Phone,
  Plus,
  Search,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { api } from './api'

type Customer = {
  _id: string
  name: string
  phone: string
  nationalIdNumber?: string
  address?: string
  notes?: string
  createdAt: string
}

const formatDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(date)
}

function CustomerModal({
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
      <section className="operation-modal customer-modal" role="dialog" aria-modal="true" aria-label="Add customer">
        <header className="operation-modal-header">
          <span className="operation-modal-icon"><UserRound size={21} /></span>
          <div>
            <span className="eyebrow">Customer record</span>
            <h2>Add customer</h2>
            <p>Create the customer before starting a pawn, purchase, or sale.</p>
          </div>
          <button type="button" className="operation-modal-close" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={19} />
          </button>
        </header>

        {error && <div className="operation-modal-error"><AlertTriangle size={17} /> {error}</div>}

        <form className="operation-form" onSubmit={onSubmit}>
          <div className="operation-form-grid">
            <label>Full name<input name="name" required autoFocus placeholder="Customer full name" /></label>
            <label>Phone number<input name="phone" required placeholder="012 345 678" /></label>
            <label>National ID number<input name="nationalIdNumber" placeholder="Optional for normal sale" /></label>
            <label>Address<input name="address" placeholder="Village, district, province" /></label>
            <label className="operation-wide">Notes<textarea name="notes" rows={4} placeholder="Ownership details, contact notes, or other information" /></label>
          </div>
          <footer className="operation-modal-actions">
            <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="primary-button" disabled={busy}>{busy ? 'Saving...' : 'Save customer'}</button>
          </footer>
        </form>
      </section>
    </div>
  )
}

function CustomerPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [showModal, setShowModal] = useState(false)

  const loadCustomers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api<{ customers: Customer[] }>('/customers')
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

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setModalError('')
    const form = new FormData(event.currentTarget)
    const payload = {
      name: String(form.get('name') || '').trim(),
      phone: String(form.get('phone') || '').trim(),
      nationalIdNumber: String(form.get('nationalIdNumber') || '').trim(),
      address: String(form.get('address') || '').trim(),
      notes: String(form.get('notes') || '').trim(),
    }

    try {
      await api('/customers', { method: 'POST', body: JSON.stringify(payload) })
      event.currentTarget.reset()
      setShowModal(false)
      await loadCustomers()
      window.dispatchEvent(new CustomEvent('phoneflow:customers-updated'))
    } catch (reason) {
      setModalError(reason instanceof Error ? reason.message : 'Unable to save customer')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="customer-workspace-bridge">
      <div className="section-header">
        <div>
          <span className="eyebrow">Operations</span>
          <h2>Customer management</h2>
          <p>Manage customer contacts and National ID information used by pawn, purchase, and sale transactions.</p>
        </div>
        <button className="primary-button" onClick={() => { setModalError(''); setShowModal(true) }}>
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
            <thead><tr><th>Customer</th><th>Phone</th><th>National ID</th><th>Address</th><th>Added</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map((customer) => (
                <tr key={customer._id}>
                  <td><div className="customer-name-cell"><span className="avatar">{customer.name.slice(0, 2).toUpperCase()}</span><p><strong>{customer.name}</strong><small>{customer.notes || 'No notes'}</small></p></div></td>
                  <td>{customer.phone}</td>
                  <td>{customer.nationalIdNumber || <span className="warning-text">Not recorded</span>}</td>
                  <td>{customer.address ? <span className="customer-address"><MapPin size={14} /> {customer.address}</span> : '—'}</td>
                  <td>{formatDate(customer.createdAt)}</td>
                  <td>{customer.nationalIdNumber ? <span className="verified"><BadgeCheck size={15} /> ID ready</span> : <span className="unverified"><AlertTriangle size={15} /> Basic profile</span>}</td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && <tr><td colSpan={6}><div className="customer-empty"><UserRound size={30} /><strong>{customers.length === 0 ? 'No customers yet' : 'No matching customers'}</strong><span>{customers.length === 0 ? 'Add the first customer so they can be selected in pawn, purchase, and sale forms.' : 'Try another search term.'}</span><button className="primary-button" onClick={() => setShowModal(true)}><Plus size={16} /> Add customer</button></div></td></tr>}
              {loading && <tr><td colSpan={6}>Loading customers...</td></tr>}
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
            </article>
          ))}
          {!loading && filtered.length === 0 && <div className="customer-mobile-empty">{customers.length === 0 ? 'No customers yet.' : 'No matching customers.'}</div>}
          {loading && <div className="customer-mobile-empty">Loading customers...</div>}
        </div>
      </article>

      {showModal && <CustomerModal busy={busy} error={modalError} onClose={() => !busy && setShowModal(false)} onSubmit={createCustomer} />}
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
