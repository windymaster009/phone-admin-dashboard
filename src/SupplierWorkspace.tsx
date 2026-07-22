import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, BadgeCheck, Building2, Pencil, Phone, Plus, Power, Search, X } from 'lucide-react'
import { api } from './api'
import './supplier-workspace.css'

type Supplier = {
  _id: string
  name: string
  phone?: string
  nationalIdNumber?: string
  notes?: string
  active: boolean
  createdAt: string
}

const formatDate = (value: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(value))

function SupplierModal({ supplier, busy, error, onClose, onSubmit }: {
  supplier: Supplier | null
  busy: boolean
  error: string
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
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

  return <div className="operation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="operation-modal supplier-modal" role="dialog" aria-modal="true" aria-label={supplier ? 'Edit supplier' : 'Add supplier'}>
      <header className="operation-modal-header">
        <span className="operation-modal-icon"><Building2 size={21} /></span>
        <div><span className="eyebrow">Supplier record</span><h2>{supplier ? 'Edit supplier' : 'Add supplier'}</h2><p>Maintain sellers that can be selected during a new purchase.</p></div>
        <button type="button" className="operation-modal-close" onClick={onClose} disabled={busy} aria-label="Close"><X size={19} /></button>
      </header>
      {error && <div className="operation-modal-error"><AlertTriangle size={17} /> {error}</div>}
      <form className="operation-form" onSubmit={onSubmit} key={supplier?._id || 'new'}>
        <div className="operation-form-grid">
          <label>Supplier name<input name="name" required autoFocus defaultValue={supplier?.name || ''} placeholder="Business or supplier name" /></label>
          <label>Phone number <small className="optional-marker">Optional</small><input name="phone" defaultValue={supplier?.phone || ''} placeholder="012 345 678" /></label>
          <label>National ID <small className="optional-marker">Optional</small><input name="nationalIdNumber" defaultValue={supplier?.nationalIdNumber || ''} /></label>
          <label className="operation-wide">Notes <small className="optional-marker">Optional</small><textarea name="notes" rows={4} defaultValue={supplier?.notes || ''} placeholder="Products supplied, payment terms, or contact notes" /></label>
        </div>
        <footer className="operation-modal-actions"><button type="button" className="ghost-button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving...' : supplier ? 'Save changes' : 'Save supplier'}</button></footer>
      </form>
    </section>
  </div>
}

export default function SupplierWorkspace() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const loadSuppliers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api<{ suppliers: Supplier[] }>('/suppliers?includeInactive=true')
      setSuppliers(result.suppliers)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load suppliers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadSuppliers() }, [loadSuppliers])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return suppliers
    return suppliers.filter((supplier) => [supplier.name, supplier.phone, supplier.nationalIdNumber, supplier.notes]
      .some((value) => String(value || '').toLowerCase().includes(term)))
  }, [search, suppliers])

  async function saveSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setModalError('')
    const form = new FormData(event.currentTarget)
    const payload = {
      name: String(form.get('name') || '').trim(),
      phone: String(form.get('phone') || '').trim(),
      nationalIdNumber: String(form.get('nationalIdNumber') || '').trim(),
      notes: String(form.get('notes') || '').trim(),
    }
    try {
      await api(editing ? `/suppliers/${editing._id}` : '/suppliers', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      setModalOpen(false)
      setEditing(null)
      await loadSuppliers()
      window.dispatchEvent(new CustomEvent('phoneflow:suppliers-updated'))
    } catch (reason) {
      setModalError(reason instanceof Error ? reason.message : 'Unable to save supplier')
    } finally {
      setBusy(false)
    }
  }

  async function toggleSupplier(supplier: Supplier) {
    if (supplier.active && !window.confirm(`Deactivate ${supplier.name}? They will no longer appear in New Purchase.`)) return
    setBusy(true)
    setError('')
    try {
      await api(`/suppliers/${supplier._id}`, { method: 'PATCH', body: JSON.stringify({ active: !supplier.active }) })
      await loadSuppliers()
      window.dispatchEvent(new CustomEvent('phoneflow:suppliers-updated'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update supplier')
    } finally {
      setBusy(false)
    }
  }

  const activeCount = suppliers.filter((supplier) => supplier.active).length
  const openCreate = () => { setEditing(null); setModalError(''); setModalOpen(true) }
  const openEdit = (supplier: Supplier) => { setEditing(supplier); setModalError(''); setModalOpen(true) }

  return <div className="supplier-workspace">
    <div className="section-header">
      <div><span className="eyebrow">Operations</span><h2>Supplier management</h2><p>Manage reusable suppliers for stock purchases and transaction history.</p></div>
      <button className="primary-button" onClick={openCreate}><Plus size={17} /> Add supplier</button>
    </div>
    {error && <div className="customer-error"><AlertTriangle size={17} /> {error}</div>}
    <section className="mini-stats-grid supplier-stats-grid">
      <article className="surface-card mini-stat"><Building2 /><p>Total suppliers<strong>{suppliers.length}</strong><small>saved in MongoDB</small></p></article>
      <article className="surface-card mini-stat"><BadgeCheck /><p>Active suppliers<strong>{activeCount}</strong><small>available for purchases</small></p></article>
      <article className="surface-card mini-stat"><Phone /><p>Phone contacts<strong>{suppliers.filter((supplier) => supplier.phone).length}</strong><small>contact numbers recorded</small></p></article>
      <article className="surface-card mini-stat"><AlertTriangle /><p>Inactive suppliers<strong>{suppliers.length - activeCount}</strong><small>hidden from new purchases</small></p></article>
    </section>
    <article className="surface-card table-card page-table supplier-table-card">
      <div className="filter-row supplier-filter-row"><div className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search supplier, phone, National ID, or notes" /></div><button className="ghost-button" onClick={() => void loadSuppliers()}>Refresh</button></div>
      <div className="table-scroll supplier-desktop-table"><table><thead><tr><th>Supplier</th><th>Phone</th><th>National ID</th><th>Added</th><th>Status</th><th /></tr></thead><tbody>
        {filtered.map((supplier) => <tr key={supplier._id}><td><div className="customer-name-cell"><span className="avatar">{supplier.name.slice(0, 2).toUpperCase()}</span><p><strong>{supplier.name}</strong><small>{supplier.notes || 'No notes'}</small></p></div></td><td>{supplier.phone || 'Not recorded'}</td><td>{supplier.nationalIdNumber || 'Not recorded'}</td><td>{formatDate(supplier.createdAt)}</td><td><span className={supplier.active ? 'verified' : 'unverified'}>{supplier.active ? <BadgeCheck size={14} /> : <Power size={14} />}{supplier.active ? 'Active' : 'Inactive'}</span></td><td><div className="supplier-row-actions"><button className="icon-button" onClick={() => openEdit(supplier)} aria-label={`Edit ${supplier.name}`}><Pencil size={15} /></button><button className="icon-button" disabled={busy} onClick={() => void toggleSupplier(supplier)} aria-label={`${supplier.active ? 'Deactivate' : 'Activate'} ${supplier.name}`}><Power size={15} /></button></div></td></tr>)}
        {!loading && filtered.length === 0 && <tr><td colSpan={6}><div className="customer-empty"><Building2 size={30} /><strong>{suppliers.length ? 'No matching suppliers' : 'No suppliers yet'}</strong><span>Add a supplier so employees can select it during a new purchase.</span><button className="primary-button" onClick={openCreate}><Plus size={16} /> Add supplier</button></div></td></tr>}
        {loading && <tr><td colSpan={6}>Loading suppliers...</td></tr>}
      </tbody></table></div>
      <div className="supplier-mobile-list">{filtered.map((supplier) => <article className="supplier-mobile-card" key={supplier._id}><div><span className="avatar">{supplier.name.slice(0, 2).toUpperCase()}</span><p><strong>{supplier.name}</strong><small>{supplier.phone || 'No phone recorded'}</small></p><span className={supplier.active ? 'verified' : 'unverified'}>{supplier.active ? 'Active' : 'Inactive'}</span></div><section><p><span>National ID</span><strong>{supplier.nationalIdNumber || 'Not recorded'}</strong></p><p><span>Added</span><strong>{formatDate(supplier.createdAt)}</strong></p></section><footer><button className="ghost-button" onClick={() => openEdit(supplier)}><Pencil size={14} /> Edit</button><button className="ghost-button" disabled={busy} onClick={() => void toggleSupplier(supplier)}><Power size={14} /> {supplier.active ? 'Deactivate' : 'Activate'}</button></footer></article>)}</div>
    </article>
    {modalOpen && <SupplierModal supplier={editing} busy={busy} error={modalError} onClose={() => { if (!busy) { setModalOpen(false); setEditing(null) } }} onSubmit={saveSupplier} />}
  </div>
}
