import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Barcode, CheckCircle2, Printer, ReceiptText } from 'lucide-react'
import { printInventoryLabel, type LabelItem } from '../inventory/barcode'
import ReceiptDocument from '../receipts/ReceiptDocument'
import { printReceiptWindow, SAMPLE_TEST_RECEIPT } from '../receipts/receipt-print'
import type { ReceiptLayout } from '../receipts/receipt-types'

const SAMPLE_TEST_LABEL: LabelItem = {
  sku: 'TEST-SKU-0000',
  barcode: 'TEST-0000',
  name: 'TEST LABEL — SAMPLE DEVICE',
  brand: 'SAMPLE BRAND',
  model: 'TEST 60x40',
  imei1: '000000000000000',
  sellPrice: 0,
}

type Feedback = {
  type: 'error' | 'success'
  message: string
}

export default function PrintingSettings() {
  const [receiptLayout, setReceiptLayout] = useState<ReceiptLayout>('THERMAL')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const receiptPaperRef = useRef<HTMLDivElement>(null)
  const printingRef = useRef(false)
  const [printingReceipt, setPrintingReceipt] = useState(false)
  const printControllerRef = useRef<AbortController | null>(null)
  useEffect(() => () => printControllerRef.current?.abort(), [])

  const handleTestLabel = () => {
    setFeedback(null)
    try {
      const opened = printInventoryLabel(SAMPLE_TEST_LABEL)
      if (!opened) {
        setFeedback({
          type: 'error',
          message: 'The browser blocked the print window. Allow pop-ups for PhoneFlow and try again.',
        })
      } else {
        setFeedback({
          type: 'success',
          message: 'Print window opened. Choose your printer in the browser’s print dialog.',
        })
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'The browser blocked the print window.',
      })
    }
  }

  const handleTestReceipt = async () => {
    if (printingRef.current) return
    printingRef.current = true
    const controller = new AbortController()
    printControllerRef.current = controller
    setPrintingReceipt(true)
    setFeedback(null)
    try {
      const paperNode = receiptPaperRef.current
      const markup = paperNode?.innerHTML
      if (!markup) {
        setFeedback({
          type: 'error',
          message: 'Receipt preview is unavailable. Please try again.',
        })
        return
      }

      const opened = await printReceiptWindow({
        markup,
        layout: receiptLayout,
        title: 'PhoneFlow Test Receipt',
      }, controller.signal)

      if (controller.signal.aborted) return

      if (!opened) {
        setFeedback({
          type: 'error',
          message: 'The browser blocked the print window. Allow pop-ups for PhoneFlow and try again.',
        })
      } else {
        setFeedback({
          type: 'success',
          message: 'Print window opened. Choose your printer in the browser’s print dialog.',
        })
      }
    } catch (err) {
      if (controller.signal.aborted) return
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'The browser blocked the print window.',
      })
    } finally {
      printingRef.current = false
      printControllerRef.current = null
      if (!controller.signal.aborted) setPrintingReceipt(false)
    }
  }

  return (
    <article className="surface-card settings-card printing-settings-card">
      <div className="settings-card-heading">
        <span className="settings-icon blue"><Printer size={20} /></span>
        <div>
          <h3>Printing</h3>
          <p>Test browser printing for labels and receipts.</p>
        </div>
      </div>

      <div className="printing-list">
        <div>
          <div className="printing-item-main">
            <span className="environment-icon"><Barcode size={17} /></span>
            <div className="printing-item-text">
              <strong>Barcode labels</strong>
              <small>60 × 40 mm label roll</small>
              <small>Printer: select in print dialog</small>
            </div>
          </div>
          <div className="printing-item-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={handleTestLabel}
            >
              <Printer size={14} />Test label
            </button>
          </div>
        </div>

        <div>
          <div className="printing-item-main">
            <span className="environment-icon"><ReceiptText size={17} /></span>
            <div className="printing-item-text">
              <strong>Receipts</strong>
              <small>Customer transactions & agreements</small>
              <small>Printer: select in print dialog</small>
            </div>
          </div>
          <div className="printing-item-actions">
            <div className="printing-layout-toggle" role="radiogroup" aria-label="Receipt format">
              <button
                type="button"
                role="radio"
                aria-checked={receiptLayout === 'THERMAL'}
                className={receiptLayout === 'THERMAL' ? 'active' : ''}
                onClick={() => setReceiptLayout('THERMAL')}
                disabled={printingReceipt}
              >
                80 mm thermal
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={receiptLayout === 'A4'}
                className={receiptLayout === 'A4' ? 'active' : ''}
                onClick={() => setReceiptLayout('A4')}
                disabled={printingReceipt}
              >
                A4
              </button>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={handleTestReceipt}
              disabled={printingReceipt}
            >
              <Printer size={14} />Test receipt
            </button>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`printing-feedback ${feedback.type === 'error' ? 'printing-error' : 'printing-success'}`}
          role={feedback.type === 'error' ? 'alert' : 'status'}
        >
          {feedback.type === 'error' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="settings-card-footer">
        <div>
          <p>Choose your printer in the browser’s print dialog.</p>
          <p>Thermal receipts: use 80 mm roll paper, 100% scale, no margins, and turn off headers and footers.</p>
        </div>
      </div>

      {/* Hidden offscreen container to render ReceiptDocument with live barcodes for print extraction */}
      <div
        style={{
          position: 'fixed',
          left: '-9999px',
          top: '-9999px',
          width: receiptLayout === 'THERMAL' ? '80mm' : '210mm',
          opacity: 0,
          pointerEvents: 'none',
        }}
        aria-hidden="true"
        data-testid="test-receipt-paper-container"
      >
        <div ref={receiptPaperRef}>
          <ReceiptDocument key={receiptLayout} receipt={SAMPLE_TEST_RECEIPT} layout={receiptLayout} />
        </div>
      </div>
    </article>
  )
}
