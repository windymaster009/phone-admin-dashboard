import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Banknote, ChevronRight, HandCoins, Landmark, Printer, ReceiptText, RefreshCcw, Search, ShoppingCart, X } from 'lucide-react'
import { api } from './api'
import ReceiptDocument, { receiptPrintStyles } from './ReceiptDocument'
import type { ReceiptDocumentType, ReceiptLayout, ReceiptOption, ReceiptOptionResponse, ReceiptRecord, ReceiptSourceType } from './receipt-types'

type SourceContext = { sourceType: ReceiptSourceType; reference: string }

function money(value: number, currency: 'USD' | 'KHR') {
  return currency === 'KHR'
    ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value || 0)} ៛`
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
    PAWN_CONTRACT: 'Pawn contract',
    PAWN_PAYMENT: 'Pawn payment receipt',
    PAWN_REDEMPTION: 'Pawn redemption receipt',
    LOAN_AGREEMENT: 'Loan agreement',
    LOAN_PAYMENT: 'Loan repayment receipt',
  }[type]
}

function DocumentIcon({ type, size = 17 }: { type: ReceiptDocumentType; size?: number }) {
  if (type === 'SALE_RECEIPT') return <ShoppingCart size={size} />
  if (type === 'PURCHASE_RECEIPT') return <Banknote size={size} />
  if (type.startsWith('LOAN_')) return <Landmark size={size} />
  return <HandCoins size={size} />
}

function Modal({ title, description, onClose, children, wide = false }: { title: string; description: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', escape)
    document.body.classList.add('operation-modal-open')
    return () => {
      document.removeEventListener('keydown', escape)
      document.body.classList.remove('operation-modal-open')
    }
  }, [onClose])

  return createPortal(
    <div className="receipt-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className={`receipt-modal surface-card ${wide ? 'receipt-modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="receipt-modal-header">
          <span className="receipt-modal-icon"><ReceiptText size={21} /></span>
          <div><span className="eyebrow">Receipts & invoices</span><h2>{title}</h2><p>{description}</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  )
}

function OptionPicker({ response, busy, error, onSelect, onClose }: { response: ReceiptOptionResponse; busy: boolean; error: string; onSelect: (option: ReceiptOption) => void; onClose: () => void }) {
  return <Modal title={response.referenceNo} description="Choose the historical document to preview or print." onClose={onClose}>
    {error && <div className="receipt-error"><AlertTriangle size={16} /> {error}</div>}
    <div className="receipt-option-list">
      {response.options.map((option) => <button key={`${option.documentType}-${option.sourceSubId}`} disabled={busy} onClick={() => onSelect(option)}>
        <span><DocumentIcon type={option.documentType} /></span>
        <p><strong>{option.label}</strong><small>{dateText(option.issuedAt, true)}</small></p>
        <div><strong>{money(option.amount, option.currency)}</strong><small>{option.currency}</small></div>
        <ChevronRight size={17} />
      </button>)}
    </div>
    <footer className="receipt-modal-actions"><button className="ghost-button" onClick={onClose} disabled={busy}>Close</button></footer>
  </Modal>
}

function Viewer({ initialReceipt, onClose, onUpdated }: { initialReceipt: ReceiptRecord; onClose: () => void; onUpdated: (receipt: ReceiptRecord) => void }) {
  const [receipt, setReceipt] = useState(initialReceipt)
  const [layout, setLayout] = useState<ReceiptLayout>('A4')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const paperRef = useRef<HTMLDivElement>(null)

  async function printReceipt() {
    const popup = window.open('', '_blank', 'width=980,height=760')
    if (!popup) {
      setError('The browser blocked the print window. Allow pop-ups for PhoneFlow and try again.')
      return
    }
    popup.opener = null
    popup.document.write('<!doctype html><title>Preparing receipt...</title><style>body{display:grid;min-height:100vh;place-items:center;font:14px Arial;color:#475569}</style>Preparing receipt...')
    popup.document.close()

    setBusy(true)
    setError('')
    try {
      const result = await api<{ receipt: ReceiptRecord }>(`/receipts/${receipt._id}/printed`, { method: 'POST', body: JSON.stringify({ layout }) })
      setReceipt(result.receipt)
      onUpdated(result.receipt)
      const markup = paperRef.current?.innerHTML
      if (!markup) throw new Error('Receipt preview is unavailable')
      const page = layout === 'THERMAL' ? '@page{size:80mm auto;margin:0}' : '@page{size:A4;margin:0}'
      popup.document.open()
      popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${receipt.receiptNo}</title><style>${page}${receiptPrintStyles}</style></head><body>${markup}</body></html>`)
      popup.document.close()
      popup.focus()
      window.setTimeout(() => popup.print(), 220)
    } catch (reason) {
      popup.close()
      setError(reason instanceof Error ? reason.message : 'Unable to print receipt')
    } finally {
      setBusy(false)
    }
  }

  return <Modal title={receipt.receiptNo} description={`${documentLabel(receipt.documentType)} · ${receipt.referenceNo}`} onClose={onClose} wide>
    {error && <div className="receipt-error"><AlertTriangle size={16} /> {error}</div>}
    <div className="receipt-viewer-toolbar">
      <div className="receipt-layout-switch"><button className={layout === 'A4' ? 'active' : ''} onClick={() => setLayout('A4')}>A4 invoice</button><button className={layout === 'THERMAL' ? 'active' : ''} onClick={() => setLayout('THERMAL')}>80mm thermal</button></div>
      <div className="receipt-print-meta"><span>{receipt.printCount ? `${receipt.printCount} print${receipt.printCount === 1 ? '' : 's'}` : 'Not printed yet'}</span>{receipt.lastPrintedAt && <small>Last: {dateText(receipt.lastPrintedAt, true)}</small>}</div>
      <button className="primary-button" onClick={() => void printReceipt()} disabled={busy}><Printer size={16} /> {busy ? 'Preparing...' : 'Print / Save PDF'}</button>
    </div>
    <div className="receipt-preview"><div ref={paperRef}><ReceiptDocument receipt={receipt} layout={layout} /></div></div>
    <footer className="receipt-modal-actions"><button className="ghost-button" onClick={onClose}>Close</button></footer>
  </Modal>
}

function Workspace({ refreshVersion, onOpen }: { refreshVersion: number; onOpen: (receipt: ReceiptRecord) => void }) {
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([])
  const [search, setSearch] = useState('')
  const [type, setType] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (search.trim()) query.set('search', search.trim())
      if (type !== 'ALL') query.set('documentType', type)
      const result = await api<{ receipts: ReceiptRecord[] }>(`/receipts?${query}`)
      setReceipts(result.receipts)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load receipts')
    } finally {
      setLoading(false)
    }
  }, [search, type])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180)
    return () => window.clearTimeout(timer)
  }, [load, refreshVersion])

  async function open(receipt: ReceiptRecord) {
    try {
      const result = await api<{ receipt: ReceiptRecord }>(`/receipts/${receipt._id}`)
      onOpen(result.receipt)
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

  return <div className="receipt-workspace-bridge">
    <div className="section-header"><div><span className="eyebrow">Finance & control</span><h2>Receipts & invoices</h2><p>Search immutable sales, purchase, pawn, and loan documents and reprint them in A4 or thermal format.</p></div><button className="ghost-button" onClick={() => void load()} disabled={loading}><RefreshCcw size={16} /> Refresh</button></div>
    {error && <div className="receipt-error"><AlertTriangle size={16} /> {error}</div>}
    <section className="receipt-stat-grid">
      <article className="surface-card"><ReceiptText /><p>Documents<strong>{stats.documents}</strong><small>saved snapshots</small></p></article>
      <article className="surface-card"><ShoppingCart /><p>Sales receipts<strong>{stats.sales}</strong><small>customer invoices</small></p></article>
      <article className="surface-card"><Landmark /><p>Agreements<strong>{stats.contract}</strong><small>pawn and loan contracts</small></p></article>
      <article className="surface-card"><Printer /><p>Total prints<strong>{stats.prints}</strong><small>including reprints</small></p></article>
    </section>
    <article className="surface-card table-card page-table receipt-table-card">
      <div className="filter-row receipt-filter-row"><div className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search receipt, reference, name or phone" /></div><select className="ghost-button filter-select" value={type} onChange={(event) => setType(event.target.value)}><option value="ALL">All documents</option><option value="SALE_RECEIPT">Sales receipts</option><option value="PURCHASE_RECEIPT">Purchase receipts</option><option value="PAWN_CONTRACT">Pawn contracts</option><option value="PAWN_PAYMENT">Pawn payments</option><option value="PAWN_REDEMPTION">Pawn redemptions</option><option value="LOAN_AGREEMENT">Loan agreements</option><option value="LOAN_PAYMENT">Loan repayments</option></select></div>
      <div className="table-scroll receipt-desktop-table"><table><thead><tr><th>Receipt</th><th>Document</th><th>Customer / borrower</th><th>Reference</th><th>Amount</th><th>Issued</th><th>Prints</th><th /></tr></thead><tbody>
        {receipts.map((receipt) => <tr key={receipt._id}><td><strong className="mono">{receipt.receiptNo}</strong></td><td><span className="receipt-type"><DocumentIcon type={receipt.documentType} /> {documentLabel(receipt.documentType)}</span></td><td><strong>{receipt.partyName || 'Walk-in customer'}</strong><small className="table-subtext">{receipt.partyPhone || 'No phone'}</small></td><td className="mono">{receipt.referenceNo}</td><td><strong>{money(receipt.total, receipt.currency)}</strong></td><td>{dateText(receipt.issuedAt)}</td><td>{receipt.printCount}</td><td><button className="icon-button" onClick={() => void open(receipt)}><ChevronRight size={17} /></button></td></tr>)}
        {!loading && receipts.length === 0 && <tr><td colSpan={8}>No receipt documents match these filters.</td></tr>}{loading && receipts.length === 0 && <tr><td colSpan={8}>Loading receipts...</td></tr>}
      </tbody></table></div>
      <div className="receipt-mobile-list">{receipts.map((receipt) => <button key={receipt._id} onClick={() => void open(receipt)}><span><DocumentIcon type={receipt.documentType} /></span><p><strong>{receipt.partyName || 'Walk-in customer'}</strong><small>{receipt.receiptNo} · {receipt.referenceNo}</small><small>{documentLabel(receipt.documentType)}</small></p><div><strong>{money(receipt.total, receipt.currency)}</strong><small>{dateText(receipt.issuedAt)} · {receipt.printCount} prints</small></div><ChevronRight size={16} /></button>)}{!loading && receipts.length === 0 && <div className="receipt-empty">No receipt documents yet.</div>}</div>
    </article>
  </div>
}

export default function ReceiptCenterBridge() {
  const [mainTarget, setMainTarget] = useState<HTMLElement | null>(null)
  const [navTarget, setNavTarget] = useState<HTMLElement | null>(null)
  const [actionTarget, setActionTarget] = useState<HTMLElement | null>(null)
  const [context, setContext] = useState<SourceContext | null>(null)
  const [active, setActive] = useState(() => window.location.pathname === '/receipts')
  const [picker, setPicker] = useState<ReceiptOptionResponse | null>(null)
  const [viewer, setViewer] = useState<ReceiptRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const directRoute = useRef(window.location.pathname === '/receipts')

  const locate = useCallback(() => {
    const main = document.querySelector<HTMLElement>('.main-content')
    setMainTarget(main)

    let navHost = document.querySelector<HTMLElement>('.receipt-nav-host')
    if (!navHost) {
      const group = Array.from(document.querySelectorAll<HTMLElement>('.nav-group')).find((item) => item.querySelector('.nav-group-label')?.textContent?.trim() === 'Finance & Control')
      if (group) {
        navHost = document.createElement('span')
        navHost.className = 'receipt-nav-host'
        const settings = Array.from(group.querySelectorAll<HTMLElement>(':scope > button')).find((button) => button.textContent?.includes('Settings'))
        if (settings) settings.before(navHost); else group.append(navHost)
      }
    }
    setNavTarget(navHost)

    const tradeOrPawn = document.querySelector<HTMLElement>('.trade-detail-modal, .pawn-detail-modal')
    if (tradeOrPawn) {
      const footer = tradeOrPawn.querySelector<HTMLElement>('.detail-modal-footer')
      const reference = tradeOrPawn.querySelector('h3')?.textContent?.trim()
      if (footer && reference) {
        let host = footer.querySelector<HTMLElement>('.receipt-action-host')
        if (!host) { host = document.createElement('span'); host.className = 'receipt-action-host'; footer.prepend(host) }
        setActionTarget(host)
        setContext({ sourceType: tradeOrPawn.classList.contains('trade-detail-modal') ? 'TRADE' : 'PAWN', reference })
        return
      }
    }

    const loanModal = document.querySelector<HTMLElement>('.loan-modal')
    const loanTitle = loanModal?.querySelector('h2')?.textContent?.trim() || ''
    const loanReference = loanTitle.match(/^(LN-[A-Z0-9-]+)/)?.[1]
    if (loanModal && loanReference) {
      const header = loanModal.querySelector<HTMLElement>('.operation-modal-header')
      if (header) {
        let host = header.querySelector<HTMLElement>('.receipt-action-host')
        if (!host) { host = document.createElement('span'); host.className = 'receipt-action-host receipt-loan-action-host'; header.querySelector('.operation-modal-close')?.before(host) }
        setActionTarget(host)
        setContext({ sourceType: 'LOAN', reference: loanReference })
        return
      }
    }

    setActionTarget(null)
    setContext(null)
  }, [])

  useEffect(() => {
    locate()
    const observer = new MutationObserver(locate)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    const pop = () => { setActive(window.location.pathname === '/receipts'); locate() }
    const sidebar = (event: MouseEvent) => {
      const button = event.target instanceof Element ? event.target.closest('.sidebar-nav button') : null
      if (button && !button.closest('.receipt-nav-host')) setActive(false)
    }
    window.addEventListener('popstate', pop)
    document.addEventListener('click', sidebar, true)
    return () => {
      observer.disconnect(); window.removeEventListener('popstate', pop); document.removeEventListener('click', sidebar, true)
      document.querySelector('.receipt-nav-host')?.remove(); document.querySelectorAll('.receipt-action-host').forEach((host) => host.remove()); document.querySelector('.main-content')?.classList.remove('receipt-route-active')
    }
  }, [locate])

  useEffect(() => {
    if (!directRoute.current || !mainTarget) return
    if (window.location.pathname !== '/receipts') window.history.replaceState({ view: 'receipts' }, '', '/receipts')
    setActive(true)
  }, [mainTarget])

  useEffect(() => {
    if (!mainTarget) return
    mainTarget.classList.toggle('receipt-route-active', active)
    if (active) { document.querySelectorAll('.sidebar-nav button.active').forEach((button) => button.classList.remove('active')); document.title = 'Receipts · PhoneFlow' }
  }, [active, mainTarget])

  const openPage = () => { if (window.location.pathname !== '/receipts') window.history.pushState({ view: 'receipts' }, '', '/receipts'); setActive(true) }

  const generate = useCallback(async (source: SourceContext, option: ReceiptOption) => {
    setBusy(true); setError('')
    try {
      const result = await api<{ receipt: ReceiptRecord }>('/receipts/generate', { method: 'POST', body: JSON.stringify({ sourceType: source.sourceType, reference: source.reference, documentType: option.documentType, sourceSubId: option.sourceSubId }) })
      setPicker(null); setViewer(result.receipt); setVersion((value) => value + 1)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to generate receipt') }
    finally { setBusy(false) }
  }, [])

  const openDocuments = useCallback(async () => {
    if (!context) return
    setBusy(true); setError('')
    try {
      const query = new URLSearchParams({ sourceType: context.sourceType, reference: context.reference })
      const response = await api<ReceiptOptionResponse>(`/receipts/options?${query}`)
      if (response.options.length === 1) await generate(context, response.options[0]); else setPicker(response)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load receipt options') }
    finally { setBusy(false) }
  }, [context, generate])

  return <>
    {navTarget && createPortal(<button className={active ? 'active' : ''} onClick={openPage}><ReceiptText size={19} /><span>Receipts</span></button>, navTarget)}
    {actionTarget && context && createPortal(<button className="secondary-button receipt-detail-action" onClick={() => void openDocuments()} disabled={busy}><Printer size={15} /> {busy ? 'Loading...' : context.sourceType === 'TRADE' ? 'Print receipt' : 'Documents'}</button>, actionTarget)}
    {active && mainTarget && createPortal(<Workspace refreshVersion={version} onOpen={setViewer} />, mainTarget)}
    {picker && context && <OptionPicker response={picker} busy={busy} error={error} onSelect={(option) => void generate(context, option)} onClose={() => { setPicker(null); setError('') }} />}
    {viewer && <Viewer key={viewer._id} initialReceipt={viewer} onClose={() => setViewer(null)} onUpdated={(receipt) => { setViewer(receipt); setVersion((value) => value + 1) }} />}
    {!picker && !viewer && error && createPortal(<div className="receipt-toast"><AlertTriangle size={16} /> {error}<button onClick={() => setError('')}><X size={14} /></button></div>, document.body)}
  </>
}
