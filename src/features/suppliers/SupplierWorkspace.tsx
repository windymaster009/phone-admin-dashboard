import { useCallback, useEffect, useMemo, useState, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, BadgeCheck, Building2, CheckCircle2, Pencil, Phone, Plus, Power, Search, Trash2, X } from 'lucide-react'
import { api } from '../../lib/api'
import LoadingState from '../../components/LoadingState'
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

function SupplierActionButton({ tooltip, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  tooltip: string
  children: ReactNode
}) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const showTooltip = (button: HTMLButtonElement) => {
    const bounds = button.getBoundingClientRect()
    setPosition({ left: bounds.left + bounds.width / 2, top: bounds.bottom + 7 })
  }

  return <>
    <button
      {...props}
      onMouseEnter={(event) => showTooltip(event.currentTarget)}
      onMouseLeave={() => setPosition(null)}
      onFocus={(event) => showTooltip(event.currentTarget)}
      onBlur={() => setPosition(null)}
    >
      {children}
    </button>
    {position && createPortal(
      <span className="supplier-action-tooltip" role="tooltip" style={position}>{tooltip}</span>,
      document.body,
    )}
  </>
}

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
      <form id="supplier-record-form" className="operation-form" onSubmit={onSubmit} key={supplier?._id || 'new'}>
        {error && <div className="operation-modal-error"><AlertTriangle size={17} /> {error}</div>}
        <div className="operation-form-grid">
          <label>Supplier name<input name="name" required autoFocus defaultValue={supplier?.name || ''} placeholder="Business or supplier name" /></label>
          <label>Phone number <small className="optional-marker">Optional</small><input name="phone" defaultValue={supplier?.phone || ''} placeholder="012 345 678" /></label>
          <label>National ID <small className="optional-marker">Optional</small><input name="nationalIdNumber" defaultValue={supplier?.nationalIdNumber || ''} /></label>
          <label className="operation-wide">Notes <small className="optional-marker">Optional</small><textarea name="notes" rows={4} defaultValue={supplier?.notes || ''} placeholder="Products supplied, payment terms, or contact notes" /></label>
        </div>
      </form>
      <footer className="operation-modal-actions supplier-modal-actions"><button type="button" className="ghost-button" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" form="supplier-record-form" className="primary-button" disabled={busy}>{busy ? 'Saving...' : supplier ? 'Save changes' : 'Save supplier'}</button></footer>
    </section>
  </div>
}

type SupplierSuccess = {
  action: 'saved' | 'deleted'
  message: string
}

function SupplierSuccessModal({ success, onClose }: { success: SupplierSuccess; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    document.body.classList.add('operation-modal-open')
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.body.classList.remove('operation-modal-open')
    }
  }, [onClose])

  return createPortal(
    <div className="operation-modal-backdrop supplier-save-success-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="operation-modal supplier-save-success-modal" role="dialog" aria-modal="true" aria-labelledby="supplier-save-success-title">
        <span className="supplier-save-success-icon"><CheckCircle2 size={30} /></span>
        <span className="eyebrow">Supplier record {success.action === 'deleted' ? 'deleted' : 'saved'}</span>
        <h2 id="supplier-save-success-title">{success.message}</h2>
        <p>{success.action === 'deleted' ? 'The supplier profile has been removed from your shop.' : 'The supplier profile is ready to use in new purchases.'}</p>
        <button type="button" className="primary-button" onClick={onClose} autoFocus><CheckCircle2 size={16} /> Done</button>
      </section>
    </div>,
    document.body,
  )
}

function DeleteSupplierModal({ supplier, busy, error, onClose, onConfirm }: {
  supplier: Supplier
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
    <div className="operation-modal-backdrop supplier-delete-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <section className="operation-modal supplier-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-supplier-title">
        <button type="button" className="supplier-delete-close" onClick={onClose} disabled={busy} aria-label="Close"><X size={18} /></button>
        {error && <div className="operation-modal-error"><AlertTriangle size={17} /> {error}</div>}
        <div className="supplier-delete-content">
          <span className="supplier-delete-icon"><Trash2 size={22} /></span>
          <h2 id="delete-supplier-title">Delete “{supplier.name}”?</h2>
          <p>The supplier profile and contact details will be permanently deleted. Purchase history will remain.</p>
          <span className="supplier-delete-warning"><AlertTriangle size={14} /> This action cannot be undone.</span>
        </div>
        <footer className="supplier-delete-actions">
          <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="supplier-delete-confirm" onClick={onConfirm} disabled={busy}><Trash2 size={15} /> {busy ? 'Deleting...' : 'Delete'}</button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}

export default function SupplierWorkspace() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [success, setSuccess] = useState<SupplierSuccess | null>(null)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [deleting, setDeleting] = useState<Supplier | null>(null)
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
    const isEditing = Boolean(editing)
    try {
      await api(editing ? `/suppliers/${editing._id}` : '/suppliers', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      setModalOpen(false)
      setEditing(null)
      setSuccess({ action: 'saved', message: isEditing ? `${payload.name} updated` : `${payload.name} added` })
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

  async function deleteSupplier() {
    if (!deleting) return
    const supplier = deleting
    setBusy(true)
    setDeleteError('')
    try {
      await api(`/suppliers/${supplier._id}`, { method: 'DELETE' })
      setDeleting(null)
      await loadSuppliers()
      window.dispatchEvent(new CustomEvent('phoneflow:suppliers-updated'))
      setSuccess({ action: 'deleted', message: `${supplier.name} deleted` })
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : 'Unable to delete supplier')
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
        {filtered.map((supplier) => <tr key={supplier._id}><td><div className="customer-name-cell"><span className="avatar">{supplier.name.slice(0, 2).toUpperCase()}</span><p><strong>{supplier.name}</strong><small>{supplier.notes || 'No notes'}</small></p></div></td><td>{supplier.phone || 'Not recorded'}</td><td>{supplier.nationalIdNumber || 'Not recorded'}</td><td>{formatDate(supplier.createdAt)}</td><td><span className={supplier.active ? 'verified' : 'unverified'}>{supplier.active ? <BadgeCheck size={14} /> : <Power size={14} />}{supplier.active ? 'Active' : 'Inactive'}</span></td><td><div className="supplier-row-actions"><SupplierActionButton className="icon-button supplier-action-edit" onClick={() => openEdit(supplier)} aria-label={`Edit ${supplier.name}`} tooltip="Edit"><Pencil size={15} /></SupplierActionButton><SupplierActionButton className="icon-button supplier-action-status" disabled={busy} onClick={() => void toggleSupplier(supplier)} aria-label={`${supplier.active ? 'Deactivate' : 'Activate'} ${supplier.name}`} tooltip={supplier.active ? 'Deactivate' : 'Activate'}><Power size={15} /></SupplierActionButton><SupplierActionButton className="icon-button supplier-action-delete" disabled={busy} onClick={() => { setDeleteError(''); setDeleting(supplier) }} aria-label={`Delete ${supplier.name}`} tooltip="Delete"><Trash2 size={15} /></SupplierActionButton></div></td></tr>)}
        {!loading && filtered.length === 0 && <tr><td colSpan={6}><div className="customer-empty"><Building2 size={30} /><strong>{suppliers.length ? 'No matching suppliers' : 'No suppliers yet'}</strong><span>Add a supplier so employees can select it during a new purchase.</span><button className="primary-button" onClick={openCreate}><Plus size={16} /> Add supplier</button></div></td></tr>}
        {loading && <tr><td colSpan={6}><LoadingState compact label="Loading suppliers" detail="Reading supplier records…" /></td></tr>}
      </tbody></table></div>
      <div className="supplier-mobile-list">{filtered.map((supplier) => <article className="supplier-mobile-card" key={supplier._id}><div><span className="avatar">{supplier.name.slice(0, 2).toUpperCase()}</span><p><strong>{supplier.name}</strong><small>{supplier.phone || 'No phone recorded'}</small></p><span className={supplier.active ? 'verified' : 'unverified'}>{supplier.active ? 'Active' : 'Inactive'}</span></div><section><p><span>National ID</span><strong>{supplier.nationalIdNumber || 'Not recorded'}</strong></p><p><span>Added</span><strong>{formatDate(supplier.createdAt)}</strong></p></section><footer><button className="ghost-button supplier-action-edit" onClick={() => openEdit(supplier)}><Pencil size={14} /> Edit</button><button className="ghost-button supplier-action-status" disabled={busy} onClick={() => void toggleSupplier(supplier)}><Power size={14} /> {supplier.active ? 'Deactivate' : 'Activate'}</button><button className="ghost-button supplier-action-delete" disabled={busy} onClick={() => { setDeleteError(''); setDeleting(supplier) }}><Trash2 size={14} /> Delete</button></footer></article>)}{loading && <LoadingState compact label="Loading suppliers" />}</div>
    </article>
    {modalOpen && <SupplierModal supplier={editing} busy={busy} error={modalError} onClose={() => { if (!busy) { setModalOpen(false); setEditing(null) } }} onSubmit={saveSupplier} />}
    {deleting && <DeleteSupplierModal supplier={deleting} busy={busy} error={deleteError} onClose={() => { if (!busy) setDeleting(null) }} onConfirm={() => void deleteSupplier()} />}
    {success && <SupplierSuccessModal success={success} onClose={() => setSuccess(null)} />}
  </div>
}
