import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle, ChevronDown, Download, Eye, FileImage, FileText, FolderLock, IdCard, Image,
  LockKeyhole, RefreshCcw, Search, ShieldCheck, Trash2, Upload, UserRound, Users, X,
} from 'lucide-react'
import { api, apiBlob, getSessionUser } from '../../lib/api'
import LoadingState from '../../components/LoadingState'

type Customer = { _id: string; name: string; phone?: string; active?: boolean }
type DocumentCategory = 'NATIONAL_ID_FRONT' | 'NATIONAL_ID_BACK' | 'CUSTOMER_PHOTO' | 'PAWN_ITEM_PHOTO' | 'SIGNED_AGREEMENT' | 'PURCHASE_EVIDENCE' | 'OTHER'
type CustomerDocument = {
  _id: string; category: DocumentCategory; relatedType: 'CUSTOMER' | 'PAWN' | 'TRADE'; relatedReference?: string
  originalName: string; mimeType: string; byteSize: number; note?: string
  uploadedBy?: { name?: string; role?: string }; createdAt: string
}
type SecurityStatus = {
  configured: boolean; keyId: string | null; maximumBytes: number; maximumCustomerBytes: number
  maximumTotalBytes: number; maximumCustomerDocuments: number; allowedMimeTypes: string[]
}
type DocumentSummary = { documentCount: number; encryptedBytes: number; customersWithDocuments: number }

const categoryLabels: Record<DocumentCategory, string> = {
  NATIONAL_ID_FRONT: 'National ID — front', NATIONAL_ID_BACK: 'National ID — back',
  CUSTOMER_PHOTO: 'Customer photo', PAWN_ITEM_PHOTO: 'Pawn item photo', SIGNED_AGREEMENT: 'Signed agreement',
  PURCHASE_EVIDENCE: 'Purchase evidence', OTHER: 'Other document',
}
const categories = Object.keys(categoryLabels) as DocumentCategory[]

function categoryIcon(category: DocumentCategory, size = 18) {
  if (category === 'NATIONAL_ID_FRONT' || category === 'NATIONAL_ID_BACK') return <IdCard size={size} aria-hidden="true" />
  if (category === 'CUSTOMER_PHOTO') return <UserRound size={size} aria-hidden="true" />
  if (category === 'PAWN_ITEM_PHOTO') return <Image size={size} aria-hidden="true" />
  if (category === 'SIGNED_AGREEMENT') return <FileText size={size} aria-hidden="true" />
  if (category === 'PURCHASE_EVIDENCE') return <FileImage size={size} aria-hidden="true" />
  return <FolderLock size={size} aria-hidden="true" />
}
function bytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}
function dateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
function fileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Unable to read the selected file'))
    reader.readAsDataURL(file)
  })
}
function initials(name = '') { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CU' }

function VaultWorkspace() {
  const user = getSessionUser()
  const canDelete = user?.role === 'OWNER' || user?.role === 'MANAGER'
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [documents, setDocuments] = useState<CustomerDocument[]>([])
  const [status, setStatus] = useState<SecurityStatus | null>(null)
  const [summary, setSummary] = useState<DocumentSummary>({ documentCount: 0, encryptedBytes: 0, customersWithDocuments: 0 })
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<DocumentCategory>('NATIONAL_ID_FRONT')
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [relatedReference, setRelatedReference] = useState('')
  const [loading, setLoading] = useState(true)
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [customerDirectoryOpen, setCustomerDirectoryOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<CustomerDocument | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const deleteDialogRef = useRef<HTMLDialogElement>(null)
  const documentRequestRef = useRef(0)
  const selectedCustomer = customers.find((customer) => customer._id === selectedCustomerId) || null

  useEffect(() => {
    const dialog = deleteDialogRef.current
    if (!dialog) return
    if (pendingDelete && !dialog.open) dialog.showModal()
    if (!pendingDelete && dialog.open) dialog.close()
  }, [pendingDelete])

  const loadSummary = useCallback(async () => setSummary(await api<DocumentSummary>('/customer-documents/summary')), [])
  const loadDocuments = useCallback(async (customerId: string) => {
    const requestId = ++documentRequestRef.current
    if (!customerId) { setDocuments([]); return }
    setDocumentsLoading(true); setError('')
    try {
      const result = await api<{ documents: CustomerDocument[] }>(`/customer-documents/customers/${customerId}`)
      if (requestId === documentRequestRef.current) setDocuments(result.documents)
    } catch (reason) {
      if (requestId === documentRequestRef.current) setError(reason instanceof Error ? reason.message : 'Unable to load secure documents')
    } finally { if (requestId === documentRequestRef.current) setDocumentsLoading(false) }
  }, [])
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [customerResult, securityResult, summaryResult] = await Promise.all([
        api<{ customers: Customer[] }>('/customers?includeInactive=true'), api<SecurityStatus>('/customer-documents/status'), api<DocumentSummary>('/customer-documents/summary'),
      ])
      setCustomers(customerResult.customers); setStatus(securityResult); setSummary(summaryResult)
      setSelectedCustomerId((current) => current || customerResult.customers[0]?._id || '')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load the secure document vault') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { void loadDocuments(selectedCustomerId) }, [loadDocuments, selectedCustomerId])

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase()
    return term ? customers.filter((customer) => [customer.name, customer.phone].some((value) => String(value || '').toLowerCase().includes(term))) : customers
  }, [customers, search])
  function chooseCustomer(customerId: string) { setSelectedCustomerId(customerId); setCustomerDirectoryOpen(false) }

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCustomer || !file) return
    if (!status?.configured) { setError('Configure DOCUMENT_ENCRYPTION_KEY on the server before uploading sensitive files.'); return }
    if (file.size > status.maximumBytes) { setError(`The selected file exceeds the ${bytes(status.maximumBytes)} limit.`); return }
    setBusy(true); setError('')
    try {
      await api(`/customer-documents/customers/${selectedCustomer._id}`, { method: 'POST', body: JSON.stringify({
        category, originalName: file.name, fileData: await fileDataUrl(file), note: note.trim(), relatedReference: relatedReference.trim(),
      }) })
      setFile(null); setNote(''); setRelatedReference('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      await Promise.all([loadDocuments(selectedCustomer._id), loadSummary()])
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to encrypt and save the document') }
    finally { setBusy(false) }
  }
  async function viewDocument(document: CustomerDocument) {
    const popup = window.open('', '_blank')
    if (popup) { popup.opener = null; popup.document.write('<!doctype html><title>Opening secure document</title><style>body{display:grid;min-height:100vh;place-items:center;color-scheme:dark;background:Canvas;color:CanvasText;font:14px system-ui}</style>Decrypting document…'); popup.document.close() }
    setError('')
    try {
      const result = await apiBlob(`/customer-documents/${document._id}/file`); const url = URL.createObjectURL(result.blob)
      if (popup) popup.location.replace(url); else window.location.assign(url)
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (reason) { popup?.close(); setError(reason instanceof Error ? reason.message : 'Unable to open the secure document') }
  }
  async function downloadDocument(document: CustomerDocument) {
    setError('')
    try {
      const result = await apiBlob(`/customer-documents/${document._id}/file?download=1`); const url = URL.createObjectURL(result.blob)
      const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = document.originalName; anchor.click(); URL.revokeObjectURL(url)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to download the secure document') }
  }
  async function confirmDelete() {
    if (!canDelete || !pendingDelete) return
    const document = pendingDelete; setBusy(true); setError('')
    try { await api(`/customer-documents/${document._id}`, { method: 'DELETE' }); setPendingDelete(null); await Promise.all([loadDocuments(selectedCustomerId), loadSummary()]) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to delete the secure document') }
    finally { setBusy(false) }
  }

  return <div className="secure-documents-workspace">
    <header className="secure-page-header">
      <div className="secure-page-title"><span className="secure-page-mark"><FolderLock size={22} aria-hidden="true" /></span><div><h2>Secure documents</h2><p>Select a customer, encrypt a file, and keep the evidence with their record.</p></div></div>
      <button className="ghost-button secure-refresh-button" onClick={() => void load()} disabled={loading}><RefreshCcw size={16} aria-hidden="true" /><span>Refresh</span></button>
    </header>
    <div className="secure-live-region" aria-live="polite">
      {error && <div className="secure-documents-error" role="alert"><AlertTriangle size={18} aria-hidden="true" /><span>{error}</span></div>}
      {status && !status.configured && <div className="secure-documents-config-warning"><LockKeyhole size={20} aria-hidden="true" /><div><strong>Encryption setup required</strong><span>Add DOCUMENT_ENCRYPTION_KEY to the server before uploading files.</span></div></div>}
    </div>
    <section className="secure-status-strip" aria-label="Document vault status">
      <div><ShieldCheck aria-hidden="true" /><span>Vault<strong>{status?.configured ? 'Ready' : 'Setup required'}</strong></span></div>
      <div><FolderLock aria-hidden="true" /><span>Documents<strong>{summary.documentCount}</strong></span></div>
      <div><Users aria-hidden="true" /><span>Customers<strong>{summary.customersWithDocuments}</strong></span></div>
      <div><LockKeyhole aria-hidden="true" /><span>Encrypted storage<strong>{bytes(summary.encryptedBytes)} used</strong></span></div>
    </section>
    <button className="secure-mobile-customer-trigger" type="button" aria-expanded={customerDirectoryOpen} onClick={() => setCustomerDirectoryOpen((current) => !current)}>
      <span className="secure-avatar">{initials(selectedCustomer?.name)}</span><span><small>Customer</small><strong>{selectedCustomer?.name || 'Choose a customer'}</strong></span><span className="secure-trigger-action">Change <ChevronDown size={16} aria-hidden="true" /></span>
    </button>

    <section className="secure-workbench">
      <aside className={`secure-customer-panel${customerDirectoryOpen ? ' is-open' : ''}`} aria-label="Customer directory">
        <div className="secure-panel-heading"><div><h3>Customer directory</h3><p>{filteredCustomers.length} available</p></div><button className="icon-button secure-directory-close" type="button" onClick={() => setCustomerDirectoryOpen(false)} aria-label="Close customer directory"><X size={17} aria-hidden="true" /></button></div>
        <label className="secure-search-field"><span className="sr-only">Search customers</span><Search size={17} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or phone" /></label>
        <div className="secure-customer-list" role="listbox" aria-label="Customers">
          {filteredCustomers.map((customer) => <button key={customer._id} type="button" role="option" aria-selected={selectedCustomerId === customer._id} className={selectedCustomerId === customer._id ? 'active' : ''} onClick={() => chooseCustomer(customer._id)}>
            <span className="secure-avatar">{initials(customer.name)}</span><span className="secure-customer-name"><strong>{customer.name}</strong><small>{customer.phone || 'No phone recorded'}</small></span><span className={`secure-profile-state${customer.active === false ? ' is-inactive' : ''}`} aria-label={customer.active === false ? 'Inactive customer' : 'Active customer'}><ShieldCheck size={15} aria-hidden="true" /></span>
          </button>)}
          {!loading && filteredCustomers.length === 0 && <div className="secure-empty secure-empty-compact"><Search size={22} aria-hidden="true" /><strong>No customers found</strong><span>Try a different name or phone number.</span></div>}
          {loading && <LoadingState compact label="Loading customers" />}
        </div>
      </aside>

      <main className="secure-document-content">
        <header className="secure-customer-context"><span className="secure-avatar secure-customer-avatar">{initials(selectedCustomer?.name)}</span><div><small>Secure record</small><h3>{selectedCustomer?.name || 'Select a customer'}</h3><p>{selectedCustomer?.phone || 'No phone recorded'} · {documents.length} {documents.length === 1 ? 'document' : 'documents'}</p></div><span className="secure-encryption-chip"><ShieldCheck size={15} aria-hidden="true" /> AES-256 encrypted</span></header>
        <section className="secure-upload-section" aria-labelledby="secure-upload-title">
          <div className="secure-section-heading"><div><h4 id="secure-upload-title">Upload a document</h4><p>The file is encrypted before it is stored.</p></div></div>
          <form onSubmit={uploadDocument}>
            <div className="secure-upload-primary-fields">
              <label><span>Document type</span><select value={category} onChange={(event) => setCategory(event.target.value as DocumentCategory)}>{categories.map((item) => <option value={item} key={item}>{categoryLabels[item]}</option>)}</select></label>
              <label className="secure-file-field"><span>File</span><input ref={fileInputRef} className="secure-file-input" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} required /><span className="secure-file-picker"><span className="secure-file-action"><Upload size={16} aria-hidden="true" /> Choose file</span><strong title={file?.name}>{file ? file.name : 'JPEG, PNG, WebP or PDF'}</strong></span></label>
            </div>
            <details className="secure-upload-options"><summary>Add a reference or internal note <ChevronDown size={16} aria-hidden="true" /></summary><div className="secure-upload-option-fields">
              <label><span>Pawn or transaction reference <small>Optional</small></span><input maxLength={120} value={relatedReference} onChange={(event) => setRelatedReference(event.target.value)} placeholder="PW-… or BY-/SL-…" /></label>
              <label><span>Internal note <small>Optional</small></span><input maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Short context for authorized staff" /></label>
            </div><p>Reference and note are metadata visible to authorized PhoneFlow staff.</p></details>
            <div className="secure-upload-summary"><span>{file ? `${bytes(file.size)} selected` : `Maximum file size ${bytes(status?.maximumBytes || 5 * 1024 * 1024)}`}</span><button className="primary-button" disabled={!selectedCustomer || !file || busy || !status?.configured}><Upload size={16} aria-hidden="true" /> {busy ? 'Encrypting…' : 'Encrypt & upload'}</button></div>
          </form>
        </section>

        <section className="secure-document-list-section" aria-labelledby="secure-files-title">
          <div className="secure-section-heading"><div><h4 id="secure-files-title">Stored documents</h4><p>Open, download, or manage this customer’s encrypted files.</p></div><span>{documents.length}</span></div>
          <div className="secure-document-list">
            {documents.map((document) => <article key={document._id}><span className="secure-document-icon">{categoryIcon(document.category)}</span><div className="secure-document-info"><strong>{categoryLabels[document.category]}</strong><span>{document.originalName}</span><small>{dateTime(document.createdAt)} · {bytes(document.byteSize)} · {document.uploadedBy?.name || 'Staff'}</small>{document.relatedReference && <small>Linked to {document.relatedReference}</small>}{document.note && <p>{document.note}</p>}</div><div className="secure-document-actions">
              <button type="button" onClick={() => void viewDocument(document)}><Eye size={16} aria-hidden="true" /><span>Open</span></button><button type="button" onClick={() => void downloadDocument(document)}><Download size={16} aria-hidden="true" /><span>Download</span></button>{canDelete && <button type="button" className="danger" disabled={busy} onClick={() => setPendingDelete(document)}><Trash2 size={16} aria-hidden="true" /><span>Delete</span></button>}
            </div></article>)}
            {!documentsLoading && selectedCustomer && documents.length === 0 && <div className="secure-empty"><FolderLock size={30} aria-hidden="true" /><strong>No documents for this customer</strong><span>Choose a file above to create their first encrypted record.</span><button type="button" className="ghost-button" onClick={() => fileInputRef.current?.click()} disabled={!status?.configured}><Upload size={16} aria-hidden="true" /> Choose first file</button></div>}
            {!selectedCustomer && <div className="secure-empty"><UserRound size={30} aria-hidden="true" /><strong>Choose a customer</strong><span>Select a profile from the directory to view its documents.</span></div>}
            {documentsLoading && <LoadingState compact label="Loading secure documents" detail="Reading encrypted file metadata…" />}
          </div>
        </section>
      </main>
    </section>

    <dialog ref={deleteDialogRef} className="secure-delete-dialog" onClose={() => setPendingDelete(null)}><div className="secure-delete-dialog-content"><span className="secure-delete-mark"><Trash2 size={21} aria-hidden="true" /></span><div><h3>Delete this secure document?</h3><p><strong>{pendingDelete?.originalName}</strong> will be permanently removed. This action cannot be undone.</p></div><div className="secure-delete-actions"><button type="button" className="ghost-button" onClick={() => setPendingDelete(null)} disabled={busy}>Cancel</button><button type="button" className="danger-button" onClick={() => void confirmDelete()} disabled={busy}>{busy ? 'Deleting…' : 'Delete document'}</button></div></div></dialog>
  </div>
}

export default function SecureDocumentsBridge() {
  const user = getSessionUser(); const allowed = user?.role !== 'STOCK'
  const [mainTarget, setMainTarget] = useState<HTMLElement | null>(null); const [navTarget, setNavTarget] = useState<HTMLElement | null>(null)
  const [active, setActive] = useState(() => window.location.pathname === '/secure-documents'); const directRoute = useRef(window.location.pathname === '/secure-documents')
  const locate = useCallback(() => {
    if (!allowed) return
    setMainTarget(document.querySelector<HTMLElement>('.main-content'))
    let host = document.querySelector<HTMLElement>('.secure-document-nav-host')
    if (!host) {
      const group = Array.from(document.querySelectorAll<HTMLElement>('.nav-group')).find((item) => item.querySelector('.nav-group-label')?.textContent?.trim() === 'Finance & Control')
      if (group) { host = document.createElement('span'); host.className = 'secure-document-nav-host'; const receiptHost = group.querySelector('.receipt-nav-host')
        if (receiptHost) receiptHost.before(host); else { const settings = Array.from(group.querySelectorAll<HTMLElement>(':scope > button')).find((button) => button.textContent?.includes('Settings')); if (settings) settings.before(host); else group.append(host) } }
    }
    setNavTarget(host)
  }, [allowed])
  useEffect(() => {
    if (!allowed) return
    locate(); const observer = new MutationObserver(locate); observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    const pop = () => setActive(window.location.pathname === '/secure-documents')
    const sidebar = (event: MouseEvent) => { const button = event.target instanceof Element ? event.target.closest('.sidebar-nav button') : null; if (button && !button.closest('.secure-document-nav-host')) setActive(false) }
    window.addEventListener('popstate', pop); document.addEventListener('click', sidebar, true)
    return () => { observer.disconnect(); window.removeEventListener('popstate', pop); document.removeEventListener('click', sidebar, true); document.querySelector('.secure-document-nav-host')?.remove(); document.querySelector('.main-content')?.classList.remove('secure-documents-route-active') }
  }, [allowed, locate])
  useEffect(() => { if (!directRoute.current || !mainTarget) return; if (window.location.pathname !== '/secure-documents') window.history.replaceState({ view: 'secure-documents' }, '', '/secure-documents'); setActive(true) }, [mainTarget])
  useEffect(() => { if (!mainTarget) return; mainTarget.classList.toggle('secure-documents-route-active', active); if (active) { document.querySelectorAll('.sidebar-nav button.active').forEach((button) => button.classList.remove('active')); document.title = 'Secure Documents · PhoneFlow' } }, [active, mainTarget])
  if (!allowed) return null
  const openPage = () => { if (window.location.pathname !== '/secure-documents') window.history.pushState({ view: 'secure-documents' }, '', '/secure-documents'); setActive(true) }
  return <>{navTarget && createPortal(<button className={active ? 'active' : ''} onClick={openPage}><FolderLock size={19} aria-hidden="true" /><span>Secure Documents</span></button>, navTarget)}{active && mainTarget && createPortal(<VaultWorkspace />, mainTarget)}</>
}
