import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

export type LabelItem = {
  sku: string
  barcode?: string
  name: string
  brand?: string
  model?: string
  imei1?: string
  sellPrice: number
}

const INVALID_CODE_VALUES = new Set(['null', 'undefined', 'n/a', 'none', '[null]', 'blank'])

export function sanitizeCode(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value).trim()
  if (!str) return ''
  if (INVALID_CODE_VALUES.has(str.toLowerCase())) return ''
  return str
}

export function barcodeValue(item: LabelItem): string {
  const barcode = sanitizeCode(item.barcode)
  const sku = sanitizeCode(item.sku)

  // For a valid non-legacy barcode, encode that barcode
  if (barcode && !barcode.startsWith('PF-LEGACY-')) {
    return barcode
  }

  // Use SKU only when barcode is missing or is a legacy placeholder
  if (sku) {
    return sku
  }

  // Migration-created PF-LEGACY codes are still valid inventory barcodes.
  return barcode
}

function drawBarcode(svg: SVGSVGElement, value: string, compact = false) {
  if (!value) {
    while (svg.firstChild) svg.removeChild(svg.firstChild)
    return
  }
  JsBarcode(svg, value, {
    format: 'CODE128',
    width: compact ? 1.25 : 1.6,
    height: compact ? 42 : 48,
    displayValue: false,
    font: 'monospace',
    fontSize: compact ? 10 : 11,
    margin: compact ? 4 : 5,
    background: '#ffffff',
    lineColor: '#05070c',
  })
}

export function BarcodeGraphic({ item, compact = false }: { item: LabelItem; compact?: boolean }) {
  const ref = useRef<SVGSVGElement>(null)
  const value = barcodeValue(item)

  useEffect(() => {
    if (ref.current) {
      if (value) {
        drawBarcode(ref.current, value, compact)
      } else {
        while (ref.current.firstChild) ref.current.removeChild(ref.current.firstChild)
      }
    }
  }, [compact, item, value])

  if (!value) return null

  return <svg ref={ref} className="barcode-graphic" aria-label={`Barcode ${value}`} />
}

export function printInventoryLabel(item: LabelItem) {
  return printInventoryLabels([item])
}

export function printInventoryLabels(items: LabelItem[]) {
  if (items.length === 0) return false
  if (items.some((item) => !barcodeValue(item))) {
    window.alert('A label cannot be printed because an item has no valid barcode or SKU. Correct the item code and try again.')
    return false
  }
  let popup: Window | null = null
  try {
    popup = window.open('', 'phoneflow-label', 'width=520,height=640')
  } catch {
    popup = null
  }

  if (!popup || popup.closed) {
    window.alert('Allow pop-ups for PhoneFlow, then try printing the labels again.')
    return false
  }

  const labels = items.map((item) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const value = barcodeValue(item)
    if (value) {
      drawBarcode(svg, value)
    }
    const safeSku = sanitizeCode(item.sku)
    const device = [item.brand, item.model].map((s) => s?.trim()).filter(Boolean).join(' ')
    const metaIdentifier = device || safeSku
    const metaSegments = [metaIdentifier, item.imei1?.trim() ? `IMEI ${item.imei1.trim()}` : ''].filter(Boolean)
    const metaHtml = metaSegments.length > 0 ? `<p class="meta">${escapeHtml(metaSegments.join(' · '))}</p>` : ''
    const scanHtml = value ? `<p class="scan-value">${escapeHtml(value)}</p>` : ''
    const price = Number(item.sellPrice || 0) > 0 ? `<p class="price">$${Number(item.sellPrice).toFixed(2)}</p>` : ''
    return `<div class="label"><h1>${escapeHtml(item.name || '')}</h1>${metaHtml}<div class="barcode-box">${svg.outerHTML}</div>${scanHtml}${price}</div>`
  }).join('')

  const doc = popup.document
  try {
    doc?.open?.()
    doc?.write?.(`<!doctype html><html><head><meta charset="utf-8"><title>PhoneFlow barcode labels</title><style>
      @page{size:60mm 40mm;margin:2mm}
      *{box-sizing:border-box}
      body{margin:0;background:#fff;color:#05070c;font-family:Arial,sans-serif}
      .label{width:56mm;height:36mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden;break-after:page;page-break-after:always}
      .label:last-child{break-after:auto;page-break-after:auto}
      h1{max-width:54mm;margin:0 0 .8mm;font-size:10.5pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .meta{margin:0 0 .8mm;font-size:7pt}
      .price{margin:0;font-size:10.5pt;font-weight:800}
      .scan-value{margin:.3mm 0 .8mm;font:700 6.5pt ui-monospace,Consolas,monospace}
      .barcode-box{width:54mm;display:flex;justify-content:center;overflow:hidden}
      svg{width:54mm;max-width:54mm;height:auto}
      @media print{
        .no-print{display:none !important}
      }
      @media screen{
        body{padding:16px;background:#f3f4f6;display:flex;flex-direction:column;align-items:center}
        .no-print{width:100%;max-width:320px;display:flex;gap:10px;justify-content:center;margin-bottom:16px}
        .manual-print-btn,.manual-close-btn{padding:8px 16px;font-size:13px;font-weight:600;border-radius:6px;cursor:pointer;border:1px solid transparent}
        .manual-print-btn{background:#0284c7;color:#fff}
        .manual-print-btn:hover{background:#0369a1}
        .manual-close-btn{background:#fff;color:#374151;border-color:#d1d5db}
        .manual-close-btn:hover{background:#f9fafb}
        .label{margin:0 auto 20px;border:1px dashed #9ca3af;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.1)}
      }
    </style></head><body>
      <div class="no-print" id="toolbar">
        <button type="button" id="manual-print-btn" class="manual-print-btn">Print label</button>
        <button type="button" id="manual-close-btn" class="manual-close-btn">Close</button>
      </div>
      ${labels}
    </body></html>`)
    doc?.close?.()
  } catch {
    popup.close()
    return false
  }

  // Attach button click listeners safely without inline scripts
  try {
    const printBtn = doc?.getElementById?.('manual-print-btn')
    if (printBtn) {
      printBtn.onclick = () => {
        try {
          popup?.focus?.()
          popup?.print?.()
        } catch {
          // ignore
        }
      }
    }
    const closeBtn = doc?.getElementById?.('manual-close-btn')
    if (closeBtn) {
      closeBtn.onclick = () => {
        try {
          popup?.close?.()
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }

  // Trigger print once after popup document is ready
  let printed = false
  const triggerPrintOnce = () => {
    if (printed) return
    printed = true
    try {
      if (!popup?.closed) {
        popup?.focus?.()
        popup?.print?.()
      }
    } catch {
      // Automatic print blocked by browser; manual print button remains visible
    }
  }

  try {
    popup?.addEventListener?.('afterprint', () => {
      try {
        popup?.close?.()
      } catch {
        // ignore
      }
    }, { once: true })
  } catch {
    // ignore
  }

  if (doc?.readyState === 'complete') {
    setTimeout(triggerPrintOnce, 50)
  } else {
    try {
      popup?.addEventListener?.('DOMContentLoaded', triggerPrintOnce, { once: true })
    } catch {
      // ignore
    }
    setTimeout(triggerPrintOnce, 150)
  }

  return true
}

function escapeHtml(value: string) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] || character)
}
