import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  Banknote,
  ChevronRight,
  HandCoins,
  Landmark,
  Printer,
  ReceiptText,
  RefreshCcw,
  Search,
  ShoppingCart,
  X,
} from 'lucide-react'
import { api } from '../../lib/api'
import LoadingState from '../../components/LoadingState'
import SummaryStats from '../../components/SummaryStats'
import ReceiptDocument, { receiptPrintStyles } from './ReceiptDocument'
import type {
  ReceiptDocumentType,
  ReceiptLayout,
  ReceiptRecord,
} from './receipt-types'
import './receipt-center.css'

type ViewerState = { receipt: ReceiptRecord; initialLayout?: ReceiptLayout }

function money(value: number, currency: 'USD' | 'KHR') {
  return currency === 'KHR'
    ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round((value || 0) / 100) * 100)} ៛`
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value || 0)
}

function dateText(value?: string, withTime = false) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date)
}

function documentLabel(type: ReceiptDocumentType) {
  return {
    SALE_RECEIPT: 'Sales receipt / invoice',
    PURCHASE_RECEIPT: 'Purchase receipt',
    REFUND_RECEIPT: 'Refund receipt',
    PAWN_CONTRACT: 'Pawn contract',
    PAWN_PAYMENT: 'Pawn payment receipt',
    PAWN_REDEMPTION: 'Pawn redemption receipt',
    LOAN_AGREEMENT: 'Loan agreement',
    LOAN_PAYMENT: 'Loan repayment receipt',
    SERVICE_RECEIPT: 'Service receipt',
  }[type]
}

function DocumentIcon({ type, size = 17 }: { type: ReceiptDocumentType; size?: number }) {
  if (type === 'SALE_RECEIPT') return <ShoppingCart size={size} />
  if (type === 'PURCHASE_RECEIPT') return <Banknote size={size} />
  if (type === 'REFUND_RECEIPT') return <RefreshCcw size={size} />
  if (type === 'SERVICE_RECEIPT') return <ReceiptText size={size} />
  if (type.startsWith('LOAN_')) return <Landmark size={size} />
  return <HandCoins size={size} />
}

function Modal({ title, description, onClose, children, wide = false, className = '' }: { title: string; description: string; onClose: () => void; children: ReactNode; wide?: boolean; className?: string }) {
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseRef.current() }
    document.addEventListener('keydown', escape)
    document.body.classList.add('operation-modal-open')
    return () => {
      document.removeEventListener('keydown', escape)
      document.body.classList.remove('operation-modal-open')
    }
  }, [])

  return createPortal(
    <div className="operation-modal-backdrop receipt-modal-backdrop" role="presentation">
      <section className={`operation-modal receipt-modal${wide ? ' receipt-modal-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="operation-modal-header">
          <span className="operation-modal-icon"><ReceiptText size={21} /></span>
          <div><span className="eyebrow">Document Center</span><h2>{title}</h2><p>{description}</p></div>
          <button type="button" className="operation-modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  )
}

function ViewerModal({ viewer, onClose }: { viewer: ViewerState; onClose: () => void }) {
  const [layout, setLayout] = useState<ReceiptLayout>(viewer.initialLayout || 'A4')
  const [receipt, setReceipt] = useState(viewer.receipt)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const previewRef = useRef<HTMLDivElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLayout(viewer.initialLayout || 'A4')
    setReceipt(viewer.receipt)
  }, [viewer])

  const printReceipt = async () => {
    const printNode = paperRef.current
    if (!printNode) return
    setBusy(true)
    setError('')
    try {
      const updated = await api<{ receipt: ReceiptRecord }>(`/receipts/${receipt._id}/print`, {
        method: 'POST',
        body: JSON.stringify({ layout }),
      })
      setReceipt(updated.receipt)

      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.right = '0'
      iframe.style.bottom = '0'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = '0'
      document.body.append(iframe)

      const doc = iframe.contentWindow?.document
      if (!doc) throw new Error('Cannot open print preview')
      doc.open()
      doc.write(`<!doctype html><html><head><title>${receipt.receiptNo}</title><style>${receiptPrintStyles}</style></head><body>${printNode.innerHTML}</body></html>`)
      doc.close()

      window.setTimeout(() => {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
        window.setTimeout(() => iframe.remove(), 1000)
      }, 250)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to print receipt')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={receipt.receiptNo} description={`${documentLabel(receipt.documentType)} · ${receipt.partyName || 'Walk-in customer'}`} onClose={onClose} wide className="receipt-viewer-modal">
      {error && <div className="receipt-error"><AlertTriangle size={16} /> {error}</div>}
      <div className="receipt-viewer-toolbar">
        <div className="receipt-layout-switch">
          <button type="button" className={layout === 'A4' ? 'active' : ''} aria-pressed={layout === 'A4'} onClick={() => setLayout('A4')}>A4 invoice</button>
          <button type="button" className={layout === 'THERMAL' ? 'active' : ''} aria-pressed={layout === 'THERMAL'} onClick={() => setLayout('THERMAL')}>80mm thermal</button>
        </div>
        <div className="receipt-print-meta">
          <span>{receipt.printCount ? `${receipt.printCount} print${receipt.printCount === 1 ? '' : 's'}` : 'Not printed yet'}</span>
          {receipt.lastPrintedAt && <small>Last: {dateText(receipt.lastPrintedAt, true)}</small>}
        </div>
        <button className="primary-button" onClick={() => void printReceipt()} disabled={busy}>
          <Printer size={16} /> {busy ? 'Preparing...' : 'Print / Save PDF'}
        </button>
      </div>
      <div ref={previewRef} className={`receipt-preview receipt-preview-${layout.toLowerCase()}`}>
        <div ref={paperRef}>
          <ReceiptDocument key={layout} receipt={receipt} layout={layout} />
        </div>
      </div>
      <footer className="receipt-modal-actions">
        <button className="ghost-button" onClick={onClose}>Close</button>
      </footer>
    </Modal>
  )
}

export default function ReceiptCenterPage() {
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([])
  const [search, setSearch] = useState('')
  const [type, setType] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewer, setViewer] = useState<ViewerState | null>(null)
  const [version, setVersion] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (search.trim()) query.set('search', search.trim())
      if (type !== 'ALL') query.set('documentType', type)
      const result = await api<{ receipts: ReceiptRecord[] }>(`/receipts?${query}`)
      setReceipts(Array.isArray(result?.receipts) ? result.receipts : [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load receipts')
    } finally {
      setLoading(false)
    }
  }, [search, type])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180)
    return () => window.clearTimeout(timer)
  }, [load, version])

  async function open(receipt: ReceiptRecord) {
    try {
      const result = await api<{ receipt: ReceiptRecord }>(`/receipts/${receipt._id}`)
      setViewer({ receipt: result.receipt })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to open receipt')
    }
  }

  const stats = useMemo(() => ({
    documents: receipts.length,
    sales: receipts.filter((item) => item.documentType === 'SALE_RECEIPT').length,
    contract: receipts.filter((item) => ['PAWN_CONTRACT', 'LOAN_AGREEMENT'].includes(item.documentType)).length,
    prints: receipts.reduce((sum, item) => sum + Number(item.printCount || 0), 0),
  }), [receipts])

  return (
    <div className="receipt-workspace-bridge">
      <div className="section-header">
        <div>
          <span className="eyebrow">Finance & control</span>
          <h2>Receipts & invoices</h2>
          <p>Search immutable sales, purchase, service, pawn, and loan documents and reprint them in A4 or thermal format.</p>
        </div>
        <button className="ghost-button" onClick={() => void load()} disabled={loading}>
          <RefreshCcw size={16} /> Refresh
        </button>
      </div>

      {error && <div className="receipt-error"><AlertTriangle size={16} /> {error}</div>}

      <SummaryStats
        label="Receipt statistics"
        variant="compact"
        items={[
          { label: 'Documents', value: stats.documents, detail: 'saved snapshots', icon: ReceiptText, tone: 'violet' },
          { label: 'Sales receipts', value: stats.sales, detail: 'customer invoices', icon: ShoppingCart, tone: 'blue' },
          { label: 'Agreements', value: stats.contract, detail: 'pawn and loan contracts', icon: Landmark, tone: 'orange' },
          { label: 'Total prints', value: stats.prints, detail: 'including reprints', icon: Printer, tone: 'green' },
        ]}
      />

      <article className="surface-card table-card page-table receipt-table-card">
        <div className="filter-row receipt-filter-row">
          <div className="search-field">
            <Search size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search receipt, reference, name or phone" />
          </div>
          <select className="ghost-button filter-select" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="ALL">All documents</option>
            <option value="SALE_RECEIPT">Sales receipts</option>
            <option value="PURCHASE_RECEIPT">Purchase receipts</option>
            <option value="SERVICE_RECEIPT">Service receipts</option>
            <option value="REFUND_RECEIPT">Refund receipts</option>
            <option value="PAWN_CONTRACT">Pawn contracts</option>
            <option value="PAWN_PAYMENT">Pawn payments</option>
            <option value="PAWN_REDEMPTION">Pawn redemptions</option>
            <option value="LOAN_AGREEMENT">Loan agreements</option>
            <option value="LOAN_PAYMENT">Loan repayments</option>
          </select>
        </div>
        <div className="table-scroll receipt-desktop-table">
          <table>
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Document</th>
                <th>Customer / borrower</th>
                <th>Reference</th>
                <th>Amount</th>
                <th>Issued</th>
                <th>Prints</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => (
                <tr key={receipt._id}>
                  <td><strong className="mono">{receipt.receiptNo}</strong></td>
                  <td><span className="receipt-type"><DocumentIcon type={receipt.documentType} /> {documentLabel(receipt.documentType)}</span></td>
                  <td><strong>{receipt.partyName || 'Walk-in customer'}</strong><small className="table-subtext">{receipt.partyPhone || 'No phone'}</small></td>
                  <td className="mono">{receipt.referenceNo}</td>
                  <td><strong>{money(receipt.total, receipt.currency)}</strong></td>
                  <td>{dateText(receipt.issuedAt)}</td>
                  <td>{receipt.printCount}</td>
                  <td><button className="icon-button" onClick={() => void open(receipt)} aria-label={`Open receipt ${receipt.receiptNo}`}><ChevronRight size={17} /></button></td>
                </tr>
              ))}
              {!loading && receipts.length === 0 && <tr><td colSpan={8}>No receipt documents match these filters.</td></tr>}
              {loading && receipts.length === 0 && <tr><td colSpan={8}><LoadingState compact label="Loading receipts" detail="Reading printable records…" /></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="receipt-mobile-list">
          {receipts.map((receipt) => (
            <button key={receipt._id} onClick={() => void open(receipt)}>
              <span><DocumentIcon type={receipt.documentType} /></span>
              <p>
                <strong>{receipt.partyName || 'Walk-in customer'}</strong>
                <small>{receipt.receiptNo} · {receipt.referenceNo}</small>
                <small>{documentLabel(receipt.documentType)}</small>
              </p>
              <div>
                <strong>{money(receipt.total, receipt.currency)}</strong>
                <small>{dateText(receipt.issuedAt)} · {receipt.printCount} prints</small>
              </div>
              <ChevronRight size={16} />
            </button>
          ))}
          {loading && receipts.length === 0 && <LoadingState compact label="Loading receipts" />}
          {!loading && receipts.length === 0 && <div className="receipt-empty">No receipt documents yet.</div>}
        </div>
      </article>

      {viewer && (
        <ViewerModal
          viewer={viewer}
          onClose={() => {
            setViewer(null)
            setVersion((v) => v + 1)
          }}
        />
      )}
    </div>
  )
}
