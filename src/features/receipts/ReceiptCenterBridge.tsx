import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Banknote, ChevronDown, ChevronRight, HandCoins, History, Landmark, LoaderCircle, Printer, ReceiptText, RefreshCcw, Search, ShoppingCart, X } from 'lucide-react'
import { api, defaultShopProfile, type ShopProfile } from '../../lib/api'
import LoadingState from '../../components/LoadingState'
import ReceiptDocument from './ReceiptDocument'
import { fitReceiptPrintPage, writeReceiptPrintDocument } from './receipt-print'
import type { ReceiptDocumentType, ReceiptLayout, ReceiptOption, ReceiptOptionResponse, ReceiptRecord, ReceiptSourceType } from './receipt-types'
import './receipt-center.css'

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
  const [previousExpanded, setPreviousExpanded] = useState(false)
  const isPawn = response.sourceType === 'PAWN' || response.options.some((o) => o.documentType === 'PAWN_CONTRACT')
  const contracts = isPawn ? response.options.filter((o) => o.documentType === 'PAWN_CONTRACT') : []
  const payments = isPawn ? response.options.filter((o) => o.documentType !== 'PAWN_CONTRACT') : []
  const currentContract = contracts[0]
  const previousContracts = contracts.slice(1)

  const renderOptionButton = (option: ReceiptOption, isCurrent = false) => {
    const optionKey = `${option.documentType}-${option.sourceSubId}`
    const pending = pendingOptionKey === optionKey
    return (
      <button
        key={optionKey}
        type="button"
        className={`receipt-option-button ${isCurrent ? 'receipt-current-contract-card' : ''} ${pending ? 'is-loading' : ''}`}
        disabled={busy}
        aria-busy={pending}
        onClick={() => onSelect(option)}
      >
        <span><DocumentIcon type={option.documentType} /></span>
        <p>
          <span className="receipt-option-label-group">
            <strong>{option.label}</strong>
            {isCurrent && <span className="receipt-current-badge">Current</span>}
          </span>
          <small>{pending ? 'Preparing preview...' : dateText(option.issuedAt, true)}</small>
        </p>
        <div>
          <strong>{money(option.amount, option.currency)}</strong>
          <small>{option.currency}{isCurrent ? ' · Principal' : ''}</small>
        </div>
        {pending ? <LoaderCircle className="receipt-option-spinner" size={17} /> : isCurrent ? <Printer size={17} /> : <ChevronRight size={17} />}
      </button>
    )
  }

  return (
    <Modal className="receipt-option-picker-modal" title={response.referenceNo} description="Choose the historical document to preview or print." onClose={onClose}>
      {error && <div className="receipt-error" role="alert"><AlertTriangle size={16} /> {error}</div>}
      <div className="receipt-option-list">
        {isPawn ? (
          <>
            {currentContract && (
              <section className="receipt-picker-section receipt-current-contract-section" aria-label="Current contract — Print for customer">
                <span className="eyebrow receipt-section-eyebrow">Current contract — Print for customer</span>
                {renderOptionButton(currentContract, true)}
              </section>
            )}

            {previousContracts.length > 0 && (
              <section className="receipt-picker-section receipt-previous-contracts-section" aria-label="Previous contract versions">
                <button
                  type="button"
                  className="receipt-collapse-toggle"
                  onClick={() => setPreviousExpanded((open) => !open)}
                  aria-expanded={previousExpanded}
                >
                  <span className="receipt-collapse-left">
                    <History size={15} />
                    <strong>Previous contract versions ({previousContracts.length})</strong>
                  </span>
                  <ChevronDown size={16} className={`receipt-chevron ${previousExpanded ? 'is-rotated' : ''}`} />
                </button>
                {previousExpanded && (
                  <div className="receipt-previous-contracts-list">
                    {previousContracts.map((option) => renderOptionButton(option))}
                  </div>
                )}
              </section>
            )}

            {payments.length > 0 && (
              <section className="receipt-picker-section receipt-payments-section" aria-label="Payment receipts">
                <span className="eyebrow receipt-section-eyebrow">Payment receipts</span>
                <div className="receipt-payments-list">
                  {payments.map((option) => renderOptionButton(option))}
                </div>
              </section>
            )}
          </>
        ) : (
          response.options.map((option) => renderOptionButton(option))
        )}
      </div>
      <footer className="receipt-modal-actions"><button className="ghost-button" onClick={onClose}>Close</button></footer>
    </Modal>
  )
}

function Viewer({ initialReceipt, initialLayout = 'A4', onClose, onUpdated }: { initialReceipt: ReceiptRecord; initialLayout?: ReceiptLayout; onClose: () => void; onUpdated: (receipt: ReceiptRecord) => void }) {
  const [receipt, setReceipt] = useState(initialReceipt)
  const [layout, setLayout] = useState<ReceiptLayout>(initialLayout)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const paperRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const printingRef = useRef(false)
  const cancelPrintRef = useRef<(() => void) | null>(null)

  useEffect(() => () => cancelPrintRef.current?.(), [])

  useEffect(() => {
    previewRef.current?.scrollTo?.({ top: 0, left: 0 })
  }, [layout])

  async function printReceipt() {
    if (printingRef.current) return
    printingRef.current = true
    setBusy(true)
    setError('')
    let popup: Window | null = null
    try {
      popup = window.open('', '_blank', 'width=980,height=760')
    } catch {
      popup = null
    }
    if (!popup) {
      printingRef.current = false
      setBusy(false)
      setError(`The browser blocked the print window. Allow pop-ups for ${receipt.snapshot?.shop.name || 'this shop'} and try again.`)
      return
    }

    let cancelled = false
    let timer: number | undefined
    let resume = () => {}
    const controller = new AbortController()
    cancelPrintRef.current = () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timer)
      resume()
      popup?.close()
    }
    try {
      const result = await api<{ receipt: ReceiptRecord }>(`/receipts/${receipt._id}/printed`, { method: 'POST', body: JSON.stringify({ layout }), signal: controller.signal })
      if (cancelled) return
      setReceipt(result.receipt)
      onUpdated(result.receipt)
      const markup = paperRef.current?.innerHTML
      if (!markup) throw new Error('Receipt preview is unavailable')
      writeReceiptPrintDocument(popup.document, { markup, layout, title: receipt.receiptNo })
      popup.focus()
      await new Promise<void>((resolve) => {
        resume = resolve
        timer = window.setTimeout(resolve, 220)
      })
      if (cancelled) return
      await fitReceiptPrintPage(popup.document, layout, controller.signal)
      if (cancelled) return
      if (popup.closed || typeof popup.print !== 'function') throw new Error('The print window is unavailable. Please try again.')
      popup.print()
    } catch (reason) {
      if (!cancelled) {
        popup.close()
        setError(reason instanceof Error ? reason.message : 'Unable to print receipt')
      }
    } finally {
      window.clearTimeout(timer)
      cancelPrintRef.current = null
      printingRef.current = false
      if (!cancelled) setBusy(false)
    }
  }

  return <Modal title={receipt.receiptNo} description={`${documentLabel(receipt.documentType)} · ${receipt.referenceNo}`} onClose={onClose} wide>
    {error && <div className="receipt-error" role="alert"><AlertTriangle size={16} /> {error}</div>}
    <div className="receipt-viewer-toolbar">
      <div className="receipt-layout-switch"><button type="button" disabled={busy} className={layout === 'A4' ? 'active' : ''} aria-pressed={layout === 'A4'} onClick={() => setLayout('A4')}>A4 invoice</button><button type="button" disabled={busy} className={layout === 'THERMAL' ? 'active' : ''} aria-pressed={layout === 'THERMAL'} onClick={() => setLayout('THERMAL')}>80mm thermal</button></div>
      <div className="receipt-print-meta"><span>{receipt.printCount ? `${receipt.printCount} print${receipt.printCount === 1 ? '' : 's'}` : 'Not printed yet'}</span>{receipt.lastPrintedAt && <small>Last: {dateText(receipt.lastPrintedAt, true)}</small>}</div>
      <button className="primary-button" onClick={() => void printReceipt()} disabled={busy}><Printer size={16} /> {busy ? 'Preparing...' : 'Print / Save PDF'}</button>
    </div>
    <div ref={previewRef} className={`receipt-preview receipt-preview-${layout.toLowerCase()}`}><div ref={paperRef}><ReceiptDocument key={layout} receipt={receipt} layout={layout} /></div></div>
    <footer className="receipt-modal-actions"><button className="ghost-button" onClick={onClose}>Close</button></footer>
  </Modal>
}

export default function ReceiptCenterBridge() {
  const [actionTarget, setActionTarget] = useState<HTMLElement | null>(null)
  const [context, setContext] = useState<SourceContext | null>(null)
  const [picker, setPicker] = useState<(ReceiptOptionResponse & { source: SourceContext }) | null>(null)
  const [viewer, setViewer] = useState<ViewerState | null>(null)
  const [busy, setBusy] = useState(false)
  const [pendingOptionKey, setPendingOptionKey] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const generationController = useRef<AbortController | null>(null)
  const generationKeyRef = useRef<string | null>(null)
  const generationClosed = useRef(false)

  const locate = useCallback(() => {
    const tradeModal = document.querySelector<HTMLElement>('.trade-detail-modal')
    if (tradeModal) {
      const footer = tradeModal.querySelector<HTMLElement>('.detail-modal-footer')
      const reference = tradeModal.querySelector('h3')?.textContent?.trim()
      if (footer && reference) {
        let host = footer.querySelector<HTMLElement>('.receipt-action-host')
        if (!host) { host = document.createElement('span'); host.className = 'receipt-action-host'; footer.prepend(host) }
        setActionTarget(host)
        setContext((current) => current?.sourceType === 'TRADE' && current.reference === reference
          ? current
          : { sourceType: 'TRADE', reference })
        return
      }
    }

    const loanModal = document.querySelector<HTMLElement>('.loan-modal')
    const loanTitle = loanModal?.querySelector('h2')?.textContent?.trim() || ''
    const loanReference = loanTitle.match(/^(LN-[A-Z0-9-]+)/)?.[1]
    if (loanModal && loanReference) {
      if (loanModal.querySelector('.loan-detail-footer, .loan-footer-actions, .record-created-workflow')) {
        setActionTarget(null)
        setContext(null)
        return
      }
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
    return () => {
      observer.disconnect()
      document.querySelectorAll('.receipt-action-host').forEach((host) => host.remove())
    }
  }, [locate])

  const generate = useCallback(async (source: SourceContext, option: ReceiptOption, initialLayout: ReceiptLayout = 'A4') => {
    const generationKey = JSON.stringify([source.sourceType, source.reference, option.documentType, option.sourceSubId])
    if (generationKeyRef.current === generationKey && generationController.current && !generationController.current.signal.aborted) return
    generationController.current?.abort()
    const controller = new AbortController()
    generationController.current = controller
    generationKeyRef.current = generationKey
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
      if (controller.signal.aborted || generationController.current !== controller) return
      if (!result.receipt?._id) throw new Error('The receipt was created without a valid preview. Please try again.')
      setViewer({ receipt: result.receipt, initialLayout }); setPicker(null); setVersion((value) => value + 1)
      window.dispatchEvent(new CustomEvent('phoneflow:documents-opened', { detail: { receipt: result.receipt } }))
    } catch (reason) {
      if (generationController.current !== controller) return
      let message = 'Unable to generate receipt'
      if (reason instanceof DOMException && reason.name === 'AbortError') {
        if (!generationClosed.current) message = 'The receipt preview took too long to prepare. Please try again.'
        else message = ''
      } else if (reason instanceof Error) {
        message = reason.message
      }
      if (message) {
        setError(message)
        window.dispatchEvent(new CustomEvent('phoneflow:documents-error', { detail: { message } }))
      }
    } finally {
      window.clearTimeout(timeout)
      if (generationController.current === controller) {
        generationController.current = null
        generationKeyRef.current = null
        setPendingOptionKey(null)
        setBusy(false)
      }
    }
  }, [])

  const openDocumentsForSource = useCallback(async (source: SourceContext) => {
    setBusy(true)
    setError('')
    try {
      const query = new URLSearchParams({ sourceType: source.sourceType, reference: source.reference })
      const response = await api<ReceiptOptionResponse>(`/receipts/options?${query}`)
      setContext(source)
      if (response.options.length === 1) {
        await generate(source, response.options[0], source.sourceType === 'LOAN' || source.sourceType === 'PAWN' ? 'THERMAL' : 'A4')
      } else {
        setPicker({ ...response, source })
        window.dispatchEvent(new CustomEvent('phoneflow:documents-opened'))
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Unable to load receipt options'
      setError(message)
      window.dispatchEvent(new CustomEvent('phoneflow:documents-error', { detail: { message } }))
    } finally {
      setBusy(false)
    }
  }, [generate])

  const openDocuments = useCallback(async () => {
    if (!context) return
    await openDocumentsForSource(context)
  }, [context, openDocumentsForSource])

  useEffect(() => {
    const openDocumentsEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ sourceType?: ReceiptSourceType; reference?: string }>).detail
      const reference = detail?.reference?.trim()
      const sourceType = detail?.sourceType || 'PAWN'
      if (!reference) return
      void openDocumentsForSource({ sourceType, reference })
    }
    const openPawnTicket = (event: Event) => {
      const detail = (event as CustomEvent<{ reference?: string; sourceSubId?: string }>).detail
      const reference = detail?.reference?.trim()
      if (!reference) return
      const sourceSubId = detail?.sourceSubId?.trim() || 'latest-contract'
      void generate(
        { sourceType: 'PAWN', reference },
        { documentType: 'PAWN_CONTRACT', sourceSubId, label: 'Pawn contract', issuedAt: new Date().toISOString(), amount: 0, currency: 'USD' },
        'THERMAL',
      )
    }
    const openLoanReceipt = (event: Event) => {
      const detail = (event as CustomEvent<{ reference?: string; documentType?: 'LOAN_AGREEMENT' | 'LOAN_PAYMENT'; sourceSubId?: string; layout?: ReceiptLayout }>).detail
      const reference = detail?.reference?.trim()
      if (!reference) return
      const documentType = detail?.documentType || 'LOAN_AGREEMENT'
      const sourceSubId = detail?.sourceSubId?.trim() || (documentType === 'LOAN_AGREEMENT' ? 'agreement' : '')
      void generate(
        { sourceType: 'LOAN', reference },
        { documentType, sourceSubId, label: documentType === 'LOAN_AGREEMENT' ? 'Loan agreement' : 'Loan repayment receipt', issuedAt: new Date().toISOString(), amount: 0, currency: 'USD' },
        detail?.layout || 'THERMAL',
      )
    }
    const openTradeReceipt = (event: Event) => {
      const detail = (event as CustomEvent<{ reference?: string; currency?: 'USD' | 'KHR'; refreshOnClose?: boolean }>).detail
      const reference = detail?.reference?.trim()
      if (!reference) return
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
      void generate(
        { sourceType: 'TRADE', reference },
        { documentType: 'REFUND_RECEIPT', sourceSubId: 'refund', label: 'Refund receipt', issuedAt: new Date().toISOString(), amount: 0, currency: detail?.currency === 'KHR' ? 'KHR' : 'USD' },
        'THERMAL',
      )
    }
    window.addEventListener('phoneflow:open-documents', openDocumentsEvent)
    window.addEventListener('phoneflow:open-pawn-ticket', openPawnTicket)
    window.addEventListener('phoneflow:open-loan-receipt', openLoanReceipt)
    window.addEventListener('phoneflow:open-trade-receipt', openTradeReceipt)
    window.addEventListener('phoneflow:open-refund-receipt', openRefundReceipt)
    return () => {
      window.removeEventListener('phoneflow:open-documents', openDocumentsEvent)
      window.removeEventListener('phoneflow:open-pawn-ticket', openPawnTicket)
      window.removeEventListener('phoneflow:open-loan-receipt', openLoanReceipt)
      window.removeEventListener('phoneflow:open-trade-receipt', openTradeReceipt)
      window.removeEventListener('phoneflow:open-refund-receipt', openRefundReceipt)
    }
  }, [generate, openDocumentsForSource])

  const closeViewer = useCallback(() => {
    setViewer(null)
  }, [])

  const closePicker = useCallback(() => {
    generationClosed.current = true
    generationController.current?.abort()
    generationController.current = null
    generationKeyRef.current = null
    setPendingOptionKey(null)

    setBusy(false)
    setPicker(null)
    setError('')
  }, [])

  useEffect(() => () => generationController.current?.abort(), [])

  return <>
    {actionTarget && context && createPortal(<button className="secondary-button receipt-detail-action" onClick={() => void openDocuments()} disabled={busy}><Printer size={15} /> {busy ? 'Loading...' : context.sourceType === 'TRADE' ? 'Print receipt' : 'Documents'}</button>, actionTarget)}
    {picker && <OptionPicker response={picker} busy={busy} pendingOptionKey={pendingOptionKey} error={error} onSelect={(option) => void generate(picker.source, option, picker.source.sourceType === 'LOAN' || picker.source.sourceType === 'PAWN' ? 'THERMAL' : 'A4')} onClose={closePicker} />}
    {viewer && <Viewer key={viewer.receipt._id} initialReceipt={viewer.receipt} initialLayout={viewer.initialLayout} onClose={closeViewer} onUpdated={(receipt) => { setViewer((current) => current ? { ...current, receipt } : null); setVersion((value) => value + 1) }} />}
    {!picker && !viewer && error && createPortal(<div className="receipt-toast" role="alert"><AlertTriangle size={16} /> {error}<button onClick={() => setError('')}><X size={14} /></button></div>, document.body)}
  </>
}
