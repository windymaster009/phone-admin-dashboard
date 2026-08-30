import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Banknote, ChevronRight, HandCoins, Landmark, LoaderCircle, Printer, ReceiptText, RefreshCcw, Search, ShoppingCart, X } from 'lucide-react'
import { api, defaultShopProfile, type ShopProfile } from '../../lib/api'
import LoadingState from '../../components/LoadingState'
import ReceiptDocument, { receiptPrintStyles } from './ReceiptDocument'
import type { ReceiptDocumentType, ReceiptLayout, ReceiptOption, ReceiptOptionResponse, ReceiptRecord, ReceiptSourceType } from './receipt-types'

type SourceContext = { sourceType: ReceiptSourceType; reference: string }
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
    <div className="receipt-modal-backdrop">
      <section className={`receipt-modal surface-card ${wide ? 'receipt-modal-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
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

function OptionPicker({ response, busy, pendingOptionKey, error, onSelect, onClose }: { response: ReceiptOptionResponse; busy: boolean; pendingOptionKey: string | null; error: string; onSelect: (option: ReceiptOption) => void; onClose: () => void }) {
  return <Modal className="receipt-option-picker-modal" title={response.referenceNo} description="Choose the historical document to preview or print." onClose={onClose}>
    {error && <div className="receipt-error"><AlertTriangle size={16} /> {error}</div>}
    <div className="receipt-option-list">
      {response.options.map((option) => {
        const optionKey = `${option.documentType}-${option.sourceSubId}`
        const pending = pendingOptionKey === optionKey
        return <button key={optionKey} className={pending ? 'is-loading' : ''} disabled={busy} aria-busy={pending} onClick={() => onSelect(option)}>
          <span><DocumentIcon type={option.documentType} /></span>
          <p><strong>{option.label}</strong><small>{pending ? 'Preparing preview...' : dateText(option.issuedAt, true)}</small></p>
          <div><strong>{money(option.amount, option.currency)}</strong><small>{option.currency}</small></div>
          {pending ? <LoaderCircle className="receipt-option-spinner" size={17} /> : <ChevronRight size={17} />}
        </button>
      })}
    </div>
    <footer className="receipt-modal-actions"><button className="ghost-button" onClick={onClose}>Close</button></footer>
  </Modal>
}

function Viewer({ initialReceipt, initialLayout = 'A4', onClose, onUpdated }: { initialReceipt: ReceiptRecord; initialLayout?: ReceiptLayout; onClose: () => void; onUpdated: (receipt: ReceiptRecord) => void }) {
  const [receipt, setReceipt] = useState(initialReceipt)
  const [layout, setLayout] = useState<ReceiptLayout>(initialLayout)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const paperRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    previewRef.current?.scrollTo({ top: 0, left: 0 })
  }, [layout])

  async function printReceipt() {
    const popup = window.open('', '_blank', 'width=980,height=760')
    if (!popup) {
      setError(`The browser blocked the print window. Allow pop-ups for ${receipt.snapshot?.shop.name || 'this shop'} and try again.`)
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
      const thermalPaper = paperRef.current?.querySelector<HTMLElement>('.receipt-paper-thermal')
      const thermalHeightMm = thermalPaper
        ? Math.min(1200, Math.max(110, Math.ceil((thermalPaper.scrollHeight * 25.4) / 96) + 4))
        : 110
      const page = layout === 'THERMAL'
        ? `@page{size:80mm ${thermalHeightMm}mm;margin:0}`
        : '@page{size:A4;margin:0}'
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
      <div className="receipt-layout-switch"><button type="button" className={layout === 'A4' ? 'active' : ''} aria-pressed={layout === 'A4'} onClick={() => setLayout('A4')}>A4 invoice</button><button type="button" className={layout === 'THERMAL' ? 'active' : ''} aria-pressed={layout === 'THERMAL'} onClick={() => setLayout('THERMAL')}>80mm thermal</button></div>
      <div className="receipt-print-meta"><span>{receipt.printCount ? `${receipt.printCount} print${receipt.printCount === 1 ? '' : 's'}` : 'Not printed yet'}</span>{receipt.lastPrintedAt && <small>Last: {dateText(receipt.lastPrintedAt, true)}</small>}</div>
      <button className="primary-button" onClick={() => void printReceipt()} disabled={busy}><Printer size={16} /> {busy ? 'Preparing...' : 'Print / Save PDF'}</button>
    </div>
    <div ref={previewRef} className={`receipt-preview receipt-preview-${layout.toLowerCase()}`}><div ref={paperRef}><ReceiptDocument key={layout} receipt={receipt} layout={layout} /></div></div>
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
    <div className="section-header"><div><span className="eyebrow">Finance & control</span><h2>Receipts & invoices</h2><p>Search immutable sales, purchase, service, pawn, and loan documents and reprint them in A4 or thermal format.</p></div><button className="ghost-button" onClick={() => void load()} disabled={loading}><RefreshCcw size={16} /> Refresh</button></div>
    {error && <div className="receipt-error"><AlertTriangle size={16} /> {error}</div>}
    <section className="receipt-stat-grid">
      <article className="surface-card"><ReceiptText /><p>Documents<strong>{stats.documents}</strong><small>saved snapshots</small></p></article>
      <article className="surface-card"><ShoppingCart /><p>Sales receipts<strong>{stats.sales}</strong><small>customer invoices</small></p></article>
      <article className="surface-card"><Landmark /><p>Agreements<strong>{stats.contract}</strong><small>pawn and loan contracts</small></p></article>
      <article className="surface-card"><Printer /><p>Total prints<strong>{stats.prints}</strong><small>including reprints</small></p></article>
    </section>
    <article className="surface-card table-card page-table receipt-table-card">
      <div className="filter-row receipt-filter-row"><div className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search receipt, reference, name or phone" /></div><select className="ghost-button filter-select" value={type} onChange={(event) => setType(event.target.value)}><option value="ALL">All documents</option><option value="SALE_RECEIPT">Sales receipts</option><option value="PURCHASE_RECEIPT">Purchase receipts</option><option value="SERVICE_RECEIPT">Service receipts</option><option value="REFUND_RECEIPT">Refund receipts</option><option value="PAWN_CONTRACT">Pawn contracts</option><option value="PAWN_PAYMENT">Pawn payments</option><option value="PAWN_REDEMPTION">Pawn redemptions</option><option value="LOAN_AGREEMENT">Loan agreements</option><option value="LOAN_PAYMENT">Loan repayments</option></select></div>
      <div className="table-scroll receipt-desktop-table"><table><thead><tr><th>Receipt</th><th>Document</th><th>Customer / borrower</th><th>Reference</th><th>Amount</th><th>Issued</th><th>Prints</th><th /></tr></thead><tbody>
        {receipts.map((receipt) => <tr key={receipt._id}><td><strong className="mono">{receipt.receiptNo}</strong></td><td><span className="receipt-type"><DocumentIcon type={receipt.documentType} /> {documentLabel(receipt.documentType)}</span></td><td><strong>{receipt.partyName || 'Walk-in customer'}</strong><small className="table-subtext">{receipt.partyPhone || 'No phone'}</small></td><td className="mono">{receipt.referenceNo}</td><td><strong>{money(receipt.total, receipt.currency)}</strong></td><td>{dateText(receipt.issuedAt)}</td><td>{receipt.printCount}</td><td><button className="icon-button" onClick={() => void open(receipt)}><ChevronRight size={17} /></button></td></tr>)}
        {!loading && receipts.length === 0 && <tr><td colSpan={8}>No receipt documents match these filters.</td></tr>}{loading && receipts.length === 0 && <tr><td colSpan={8}><LoadingState compact label="Loading receipts" detail="Reading printable records…" /></td></tr>}
      </tbody></table></div>
      <div className="receipt-mobile-list">{receipts.map((receipt) => <button key={receipt._id} onClick={() => void open(receipt)}><span><DocumentIcon type={receipt.documentType} /></span><p><strong>{receipt.partyName || 'Walk-in customer'}</strong><small>{receipt.receiptNo} · {receipt.referenceNo}</small><small>{documentLabel(receipt.documentType)}</small></p><div><strong>{money(receipt.total, receipt.currency)}</strong><small>{dateText(receipt.issuedAt)} · {receipt.printCount} prints</small></div><ChevronRight size={16} /></button>)}{loading && receipts.length === 0 && <LoadingState compact label="Loading receipts" />}{!loading && receipts.length === 0 && <div className="receipt-empty">No receipt documents yet.</div>}</div>
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
  const [viewer, setViewer] = useState<ViewerState | null>(null)
  const [reloadAfterViewerClose, setReloadAfterViewerClose] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pendingOptionKey, setPendingOptionKey] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const [shopName, setShopName] = useState(defaultShopProfile.name)
  const directRoute = useRef(window.location.pathname === '/receipts')
  const generationController = useRef<AbortController | null>(null)
  const generationClosed = useRef(false)

  useEffect(() => {
    api<{ shop: ShopProfile }>('/shop')
      .then(({ shop }) => setShopName(shop.name))
      .catch(() => undefined)
  }, [])

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
        const sourceType = tradeOrPawn.classList.contains('trade-detail-modal') ? 'TRADE' : 'PAWN'
        setActionTarget(host)
        setContext((current) => current?.sourceType === sourceType && current.reference === reference
          ? current
          : { sourceType, reference })
        return
      }
    }

    const loanModal = document.querySelector<HTMLElement>('.loan-modal')
    const loanTitle = loanModal?.querySelector('h2')?.textContent?.trim() || ''
    const loanReference = loanTitle.match(/^(LN-[A-Z0-9-]+)/)?.[1]
    if (loanModal && loanReference) {
      const headerContent = loanModal.querySelector<HTMLElement>('.operation-modal-header > div')
      if (headerContent) {
        let host = headerContent.querySelector<HTMLElement>('.receipt-action-host')
        if (!host) {
          host = document.createElement('span')
          host.className = 'receipt-action-host receipt-loan-action-host'
          host.style.display = 'inline-flex'
          host.style.marginTop = '8px'
          headerContent.append(host)
        }
        setActionTarget(host)
        setContext((current) => current?.sourceType === 'LOAN' && current.reference === loanReference
          ? current
          : { sourceType: 'LOAN', reference: loanReference })
        return
      }
    }

    setActionTarget(null)
    setContext((current) => current === null ? current : null)
  }, [])

  useEffect(() => {
    locate()
    const observer = new MutationObserver(locate)
    observer.observe(document.body, { childList: true, subtree: true })
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
    if (active) { document.querySelectorAll('.sidebar-nav button.active').forEach((button) => button.classList.remove('active')); document.title = `Receipts · ${shopName}` }
  }, [active, mainTarget, shopName])

  const openPage = () => { if (window.location.pathname !== '/receipts') window.history.pushState({ view: 'receipts' }, '', '/receipts'); setActive(true) }

  const generate = useCallback(async (source: SourceContext, option: ReceiptOption, initialLayout: ReceiptLayout = 'A4') => {
    generationController.current?.abort()
    const controller = new AbortController()
    generationController.current = controller
    generationClosed.current = false
    const optionKey = `${option.documentType}-${option.sourceSubId}`
    const timeout = window.setTimeout(() => controller.abort(), 15_000)
    setPendingOptionKey(optionKey); setBusy(true); setError('')
    try {
      const result = await api<{ receipt: ReceiptRecord }>('/receipts/generate', {
        method: 'POST',
        body: JSON.stringify({ sourceType: source.sourceType, reference: source.reference, documentType: option.documentType, sourceSubId: option.sourceSubId }),
        signal: controller.signal,
      })
      if (!result.receipt?._id) throw new Error('The receipt was created without a valid preview. Please try again.')
      setViewer({ receipt: result.receipt, initialLayout }); setPicker(null); setVersion((value) => value + 1)
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') {
        if (!generationClosed.current) setError('The receipt preview took too long to prepare. Please try again.')
      } else {
        setError(reason instanceof Error ? reason.message : 'Unable to generate receipt')
      }
    } finally {
      window.clearTimeout(timeout)
      if (generationController.current === controller) {
        generationController.current = null
        setPendingOptionKey(null)
        setBusy(false)
      }
    }
  }, [])

  useEffect(() => {
    const openPawnTicket = (event: Event) => {
      const detail = (event as CustomEvent<{ reference?: string; sourceSubId?: string }>).detail
      const reference = detail?.reference?.trim()
      if (!reference) return
      setReloadAfterViewerClose(false)
      const sourceSubId = detail?.sourceSubId?.trim() || 'latest-contract'
      void generate(
        { sourceType: 'PAWN', reference },
        { documentType: 'PAWN_CONTRACT', sourceSubId, label: 'Pawn contract', issuedAt: new Date().toISOString(), amount: 0, currency: 'USD' },
        'THERMAL',
      )
    }
    const openTradeReceipt = (event: Event) => {
      const detail = (event as CustomEvent<{ reference?: string; currency?: 'USD' | 'KHR'; refreshOnClose?: boolean }>).detail
      const reference = detail?.reference?.trim()
      if (!reference) return
      setReloadAfterViewerClose(Boolean(detail?.refreshOnClose))
      void generate(
        { sourceType: 'TRADE', reference },
        { documentType: 'SALE_RECEIPT', sourceSubId: 'trade', label: 'Sales receipt / invoice', issuedAt: new Date().toISOString(), amount: 0, currency: detail?.currency === 'KHR' ? 'KHR' : 'USD' },
        'THERMAL',
      )
    }
    const openRefundReceipt = (event: Event) => {
      const detail = (event as CustomEvent<{ reference?: string; currency?: 'USD' | 'KHR'; refreshOnClose?: boolean }>).detail
      const reference = detail?.reference?.trim()
      if (!reference) return
      setReloadAfterViewerClose(Boolean(detail?.refreshOnClose))
      void generate(
        { sourceType: 'TRADE', reference },
        { documentType: 'REFUND_RECEIPT', sourceSubId: 'refund', label: 'Refund receipt', issuedAt: new Date().toISOString(), amount: 0, currency: detail?.currency === 'KHR' ? 'KHR' : 'USD' },
        'THERMAL',
      )
    }
    window.addEventListener('phoneflow:open-pawn-ticket', openPawnTicket)
    window.addEventListener('phoneflow:open-trade-receipt', openTradeReceipt)
    window.addEventListener('phoneflow:open-refund-receipt', openRefundReceipt)
    return () => {
      window.removeEventListener('phoneflow:open-pawn-ticket', openPawnTicket)
      window.removeEventListener('phoneflow:open-trade-receipt', openTradeReceipt)
      window.removeEventListener('phoneflow:open-refund-receipt', openRefundReceipt)
    }
  }, [generate])

  const closeViewer = useCallback(() => {
    setViewer(null)
    if (reloadAfterViewerClose) {
      setReloadAfterViewerClose(false)
      window.location.reload()
    }
  }, [reloadAfterViewerClose])

  const closePicker = useCallback(() => {
    generationClosed.current = true
    generationController.current?.abort()
    generationController.current = null
    setPendingOptionKey(null)
    setBusy(false)
    setPicker(null)
    setError('')
  }, [])

  useEffect(() => () => generationController.current?.abort(), [])

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
    {active && mainTarget && createPortal(<Workspace refreshVersion={version} onOpen={(receipt) => { setReloadAfterViewerClose(false); setViewer({ receipt }) }} />, mainTarget)}
    {picker && context && <OptionPicker response={picker} busy={busy} pendingOptionKey={pendingOptionKey} error={error} onSelect={(option) => void generate(context, option)} onClose={closePicker} />}
    {viewer && <Viewer key={viewer.receipt._id} initialReceipt={viewer.receipt} initialLayout={viewer.initialLayout} onClose={closeViewer} onUpdated={(receipt) => { setViewer((current) => current ? { ...current, receipt } : null); setVersion((value) => value + 1) }} />}
    {!picker && !viewer && error && createPortal(<div className="receipt-toast"><AlertTriangle size={16} /> {error}<button onClick={() => setError('')}><X size={14} /></button></div>, document.body)}
  </>
}
