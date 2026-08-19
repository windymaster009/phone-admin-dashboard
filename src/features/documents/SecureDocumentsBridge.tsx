import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  Download,
  Eye,
  FileImage,
  FileText,
  FolderLock,
  IdCard,
  Image,
  LockKeyhole,
  RefreshCcw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  Users,
} from 'lucide-react'
import { api, apiBlob, getSessionUser } from '../../lib/api'
import LoadingState from '../../components/LoadingState'

type Customer = {
  _id: string
  name: string
  phone: string
  nationalIdNumber?: string
  active?: boolean
}

type DocumentCategory =
  | 'NATIONAL_ID_FRONT'
  | 'NATIONAL_ID_BACK'
  | 'CUSTOMER_PHOTO'
  | 'PAWN_ITEM_PHOTO'
  | 'SIGNED_AGREEMENT'
  | 'PURCHASE_EVIDENCE'
  | 'OTHER'

type CustomerDocument = {
  _id: string
  category: DocumentCategory
  relatedType: 'CUSTOMER' | 'PAWN' | 'TRADE'
  relatedReference?: string
  originalName: string
  mimeType: string
  byteSize: number
  sha256: string
  note?: string
  uploadedBy?: { name?: string; role?: string }
  createdAt: string
}

type SecurityStatus = {
  configured: boolean
  keyId: string | null
  maximumBytes: number
  allowedMimeTypes: string[]
}

type DocumentSummary = {
  documentCount: number
  encryptedBytes: number
  customersWithDocuments: number
  recent: CustomerDocument[]
}

const categoryLabels: Record<DocumentCategory, string> = {
  NATIONAL_ID_FRONT: 'National ID — front',
  NATIONAL_ID_BACK: 'National ID — back',
  CUSTOMER_PHOTO: 'Customer photo',
  PAWN_ITEM_PHOTO: 'Pawn item photo',
  SIGNED_AGREEMENT: 'Signed agreement',
  PURCHASE_EVIDENCE: 'Purchase evidence',
  OTHER: 'Other document',
}

const categories = Object.keys(categoryLabels) as DocumentCategory[]

function categoryIcon(category: DocumentCategory, size = 18) {
  if (category === 'NATIONAL_ID_FRONT' || category === 'NATIONAL_ID_BACK') return <IdCard size={size} />
  if (category === 'CUSTOMER_PHOTO') return <UserRound size={size} />
  if (category === 'PAWN_ITEM_PHOTO') return <Image size={size} />
  if (category === 'SIGNED_AGREEMENT') return <FileText size={size} />
  if (category === 'PURCHASE_EVIDENCE') return <FileImage size={size} />
  return <FolderLock size={size} />
}

function bytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function dateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function fileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Unable to read the selected file'))
    reader.readAsDataURL(file)
  })
}

function VaultWorkspace() {
  const user = getSessionUser()
  const canDelete = user?.role === 'OWNER' || user?.role === 'MANAGER'
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [documents, setDocuments] = useState<CustomerDocument[]>([])
  const [status, setStatus] = useState<SecurityStatus | null>(null)
  const [summary, setSummary] = useState<DocumentSummary>({ documentCount: 0, encryptedBytes: 0, customersWithDocuments: 0, recent: [] })
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<DocumentCategory>('NATIONAL_ID_FRONT')
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [relatedReference, setRelatedReference] = useState('')
  const [loading, setLoading] = useState(true)
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedCustomer = customers.find((customer) => customer._id === selectedCustomerId) || null

  const loadSummary = useCallback(async () => {
    const result = await api<DocumentSummary>('/customer-documents/summary')
    setSummary(result)
  }, [])

  const loadDocuments = useCallback(async (customerId: string) => {
    if (!customerId) {
      setDocuments([])
      return
    }
    setDocumentsLoading(true)
    setError('')
    try {
      const result = await api<{ documents: CustomerDocument[] }>(`/customer-documents/customers/${customerId}`)
      setDocuments(result.documents)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load secure documents')
    } finally {
      setDocumentsLoading(false)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [customerResult, securityResult, summaryResult] = await Promise.all([
        api<{ customers: Customer[] }>('/customers?includeInactive=true'),
        api<SecurityStatus>('/customer-documents/status'),
        api<DocumentSummary>('/customer-documents/summary'),
      ])
      setCustomers(customerResult.customers)
      setStatus(securityResult)
      setSummary(summaryResult)
      setSelectedCustomerId((current) => current || customerResult.customers[0]?._id || '')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load the secure document vault')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => { void loadDocuments(selectedCustomerId) }, [loadDocuments, selectedCustomerId])

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return customers
    return customers.filter((customer) => [customer.name, customer.phone, customer.nationalIdNumber]
      .some((value) => String(value || '').toLowerCase().includes(term)))
  }, [customers, search])

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCustomer || !file) return
    if (!status?.configured) {
      setError('Configure DOCUMENT_ENCRYPTION_KEY on the server before uploading sensitive files.')
      return
    }
    if (file.size > status.maximumBytes) {
      setError(`The selected file exceeds the ${bytes(status.maximumBytes)} limit.`)
      return
    }

    setBusy(true)
    setError('')
    try {
      const fileData = await fileDataUrl(file)
      await api(`/customer-documents/customers/${selectedCustomer._id}`, {
        method: 'POST',
        body: JSON.stringify({
          category,
          originalName: file.name,
          fileData,
          note: note.trim(),
          relatedReference: relatedReference.trim(),
        }),
      })
      setFile(null)
      setNote('')
      setRelatedReference('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      await Promise.all([loadDocuments(selectedCustomer._id), loadSummary()])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to encrypt and save the document')
    } finally {
      setBusy(false)
    }
  }

  async function viewDocument(document: CustomerDocument) {
    const popup = window.open('', '_blank')
    if (popup) {
      popup.opener = null
      popup.document.write('<!doctype html><title>Opening secure document…</title><style>body{display:grid;min-height:100vh;place-items:center;background:#07101f;color:#cbd5e1;font:14px system-ui}</style>Decrypting document…')
      popup.document.close()
    }

    setError('')
    try {
      const result = await apiBlob(`/customer-documents/${document._id}/file`)
      const url = URL.createObjectURL(result.blob)
      if (popup) popup.location.replace(url)
      else window.location.assign(url)
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (reason) {
      popup?.close()
      setError(reason instanceof Error ? reason.message : 'Unable to open the secure document')
    }
  }

  async function downloadDocument(document: CustomerDocument) {
    setError('')
    try {
      const result = await apiBlob(`/customer-documents/${document._id}/file?download=1`)
      const url = URL.createObjectURL(result.blob)
      const anchor = window.document.createElement('a')
      anchor.href = url
      anchor.download = document.originalName
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to download the secure document')
    }
  }

  async function deleteDocument(document: CustomerDocument) {
    if (!canDelete || !window.confirm(`Delete “${document.originalName}”? This cannot be undone.`)) return
    setBusy(true)
    setError('')
    try {
      await api(`/customer-documents/${document._id}`, { method: 'DELETE' })
      await Promise.all([loadDocuments(selectedCustomerId), loadSummary()])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete the secure document')
    } finally {
      setBusy(false)
    }
  }

  return <div className="secure-documents-workspace">
    <div className="section-header">
      <div><span className="eyebrow">Privacy & control</span><h2>Secure customer documents</h2><p>Encrypted National IDs, customer photos, pawn evidence, signed agreements, and purchase records.</p></div>
      <button className="ghost-button" onClick={() => void load()} disabled={loading}><RefreshCcw size={16} /> Refresh</button>
    </div>

    {error && <div className="secure-documents-error"><AlertTriangle size={17} /> {error}</div>}
    {status && !status.configured && <div className="secure-documents-config-warning"><LockKeyhole size={20} /><div><strong>Encryption key required</strong><span>Set DOCUMENT_ENCRYPTION_KEY in the server .env before uploading. Existing customer data remains available.</span></div></div>}

    <section className="secure-document-stats">
      <article className="surface-card"><FolderLock /><p>Encrypted documents<strong>{summary.documentCount}</strong><small>stored as ciphertext</small></p></article>
      <article className="surface-card"><Users /><p>Protected customers<strong>{summary.customersWithDocuments}</strong><small>with at least one document</small></p></article>
      <article className="surface-card"><ShieldCheck /><p>Protected data<strong>{bytes(summary.encryptedBytes)}</strong><small>AES-256-GCM encrypted</small></p></article>
      <article className="surface-card"><LockKeyhole /><p>Encryption status<strong>{status?.configured ? 'Ready' : 'Setup'}</strong><small>{status?.keyId ? `Key ${status.keyId}` : 'key not configured'}</small></p></article>
    </section>

    <section className="secure-document-layout">
      <aside className="surface-card secure-customer-panel">
        <div className="secure-panel-heading"><div><span className="eyebrow">Customers</span><h3>Select a profile</h3></div><span>{filteredCustomers.length}</span></div>
        <div className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, phone or National ID" /></div>
        <div className="secure-customer-list">
          {filteredCustomers.map((customer) => <button key={customer._id} className={selectedCustomerId === customer._id ? 'active' : ''} onClick={() => setSelectedCustomerId(customer._id)}>
            <span className="avatar">{customer.name.slice(0, 2).toUpperCase()}</span>
            <p><strong>{customer.name}</strong><small>{customer.phone}</small></p>
            {customer.nationalIdNumber ? <IdCard size={16} /> : <AlertTriangle size={16} />}
          </button>)}
          {!loading && filteredCustomers.length === 0 && <div className="secure-empty">No matching customers.</div>}
          {loading && <LoadingState compact label="Loading customers" />}
        </div>
      </aside>

      <div className="secure-document-content">
        <article className="surface-card secure-upload-card">
          <div className="secure-panel-heading"><div><span className="eyebrow">Encrypted upload</span><h3>{selectedCustomer ? selectedCustomer.name : 'Select a customer'}</h3></div><ShieldCheck size={21} /></div>
          <form onSubmit={uploadDocument}>
            <label>Document type<select value={category} onChange={(event) => setCategory(event.target.value as DocumentCategory)}>{categories.map((item) => <option value={item} key={item}>{categoryLabels[item]}</option>)}</select></label>
            <label>File<input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} required /></label>
            <label>Pawn or transaction reference <small className="optional-marker">Optional</small><input value={relatedReference} onChange={(event) => setRelatedReference(event.target.value)} placeholder="PW-… or BY-/SL-…" /></label>
            <label>Note <small className="optional-marker">Optional</small><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Private note" /></label>
            <div className="secure-upload-summary"><span>{file ? `${file.name} · ${bytes(file.size)}` : `JPEG, PNG, WebP or PDF · max ${bytes(status?.maximumBytes || 5 * 1024 * 1024)}`}</span><button className="primary-button" disabled={!selectedCustomer || !file || busy || !status?.configured}><Upload size={16} /> {busy ? 'Encrypting…' : 'Encrypt & upload'}</button></div>
          </form>
        </article>

        <article className="surface-card secure-document-list-card">
          <div className="secure-panel-heading"><div><span className="eyebrow">Private files</span><h3>{selectedCustomer ? `${selectedCustomer.name}'s documents` : 'Documents'}</h3></div><span>{documents.length}</span></div>
          <div className="secure-document-list">
            {documents.map((document) => <article key={document._id}>
              <span className="secure-document-icon">{categoryIcon(document.category)}</span>
              <div className="secure-document-info"><strong>{categoryLabels[document.category]}</strong><span>{document.originalName}</span><small>{dateTime(document.createdAt)} · {bytes(document.byteSize)} · {document.uploadedBy?.name || 'Staff'}</small>{document.relatedReference && <small>Linked to {document.relatedReference}</small>}{document.note && <p>{document.note}</p>}</div>
              <div className="secure-document-actions"><button className="icon-button" onClick={() => void viewDocument(document)} aria-label={`View ${document.originalName}`}><Eye size={16} /></button><button className="icon-button" onClick={() => void downloadDocument(document)} aria-label={`Download ${document.originalName}`}><Download size={16} /></button>{canDelete && <button className="icon-button danger" disabled={busy} onClick={() => void deleteDocument(document)} aria-label={`Delete ${document.originalName}`}><Trash2 size={16} /></button>}</div>
            </article>)}
            {!documentsLoading && selectedCustomer && documents.length === 0 && <div className="secure-empty"><FolderLock size={30} /><strong>No secure documents yet</strong><span>Upload the customer's National ID, photo, agreement, or transaction evidence.</span></div>}
            {!selectedCustomer && <div className="secure-empty">Select a customer to view private documents.</div>}
            {documentsLoading && <LoadingState compact label="Loading secure documents" detail="Reading encrypted file metadata…" />}
          </div>
        </article>
      </div>
    </section>
  </div>
}

export default function SecureDocumentsBridge() {
  const user = getSessionUser()
  const allowed = user?.role !== 'STOCK'
  const [mainTarget, setMainTarget] = useState<HTMLElement | null>(null)
  const [navTarget, setNavTarget] = useState<HTMLElement | null>(null)
  const [active, setActive] = useState(() => window.location.pathname === '/secure-documents')
  const directRoute = useRef(window.location.pathname === '/secure-documents')

  const locate = useCallback(() => {
    if (!allowed) return
    setMainTarget(document.querySelector<HTMLElement>('.main-content'))
    let host = document.querySelector<HTMLElement>('.secure-document-nav-host')
    if (!host) {
      const group = Array.from(document.querySelectorAll<HTMLElement>('.nav-group')).find((item) => item.querySelector('.nav-group-label')?.textContent?.trim() === 'Finance & Control')
      if (group) {
        host = document.createElement('span')
        host.className = 'secure-document-nav-host'
        const receiptHost = group.querySelector('.receipt-nav-host')
        if (receiptHost) receiptHost.before(host)
        else {
          const settings = Array.from(group.querySelectorAll<HTMLElement>(':scope > button')).find((button) => button.textContent?.includes('Settings'))
          if (settings) settings.before(host); else group.append(host)
        }
      }
    }
    setNavTarget(host)
  }, [allowed])

  useEffect(() => {
    if (!allowed) return
    locate()
    const observer = new MutationObserver(locate)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    const pop = () => setActive(window.location.pathname === '/secure-documents')
    const sidebar = (event: MouseEvent) => {
      const button = event.target instanceof Element ? event.target.closest('.sidebar-nav button') : null
      if (button && !button.closest('.secure-document-nav-host')) setActive(false)
    }
    window.addEventListener('popstate', pop)
    document.addEventListener('click', sidebar, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('popstate', pop)
      document.removeEventListener('click', sidebar, true)
      document.querySelector('.secure-document-nav-host')?.remove()
      document.querySelector('.main-content')?.classList.remove('secure-documents-route-active')
    }
  }, [allowed, locate])

  useEffect(() => {
    if (!directRoute.current || !mainTarget) return
    if (window.location.pathname !== '/secure-documents') window.history.replaceState({ view: 'secure-documents' }, '', '/secure-documents')
    setActive(true)
  }, [mainTarget])

  useEffect(() => {
    if (!mainTarget) return
    mainTarget.classList.toggle('secure-documents-route-active', active)
    if (active) {
      document.querySelectorAll('.sidebar-nav button.active').forEach((button) => button.classList.remove('active'))
      document.title = 'Secure Documents · PhoneFlow'
    }
  }, [active, mainTarget])

  if (!allowed) return null
  const openPage = () => {
    if (window.location.pathname !== '/secure-documents') window.history.pushState({ view: 'secure-documents' }, '', '/secure-documents')
    setActive(true)
  }

  return <>
    {navTarget && createPortal(<button className={active ? 'active' : ''} onClick={openPage}><FolderLock size={19} /><span>Secure Documents</span></button>, navTarget)}
    {active && mainTarget && createPortal(<VaultWorkspace />, mainTarget)}
  </>
}
