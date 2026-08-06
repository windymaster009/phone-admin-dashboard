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

export function barcodeValue(item: LabelItem) {
  if (item.barcode?.startsWith('PF-LEGACY-') && item.sku) return item.sku
  if (item.sku && item.sku.length < String(item.barcode || '').length) return item.sku
  return item.barcode || item.sku
}

function drawBarcode(svg: SVGSVGElement, value: string, compact = false) {
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

  useEffect(() => {
    if (ref.current) drawBarcode(ref.current, barcodeValue(item), compact)
  }, [compact, item])

  return <svg ref={ref} className="barcode-graphic" aria-label={`Barcode ${barcodeValue(item)}`} />
}

export function printInventoryLabel(item: LabelItem) {
  return printInventoryLabels([item])
}

export function printInventoryLabels(items: LabelItem[]) {
  if (items.length === 0) return false
  const popup = window.open('', 'phoneflow-label', 'width=520,height=640')
  if (!popup) {
    window.alert('Allow pop-ups for PhoneFlow, then try printing the labels again.')
    return false
  }

  const labels = items.map((item) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const value = barcodeValue(item)
    drawBarcode(svg, value)
    const device = [item.brand, item.model].filter(Boolean).join(' ')
    const price = Number(item.sellPrice || 0) > 0 ? `<p class="price">$${Number(item.sellPrice).toFixed(2)}</p>` : ''
    return `<div class="label"><h1>${escapeHtml(item.name)}</h1><p class="meta">${escapeHtml(device || item.sku)}${item.imei1 ? ` · IMEI ${escapeHtml(item.imei1)}` : ''}</p><div class="barcode-box">${svg.outerHTML}</div><p class="scan-value">${escapeHtml(value)}</p>${price}</div>`
  }).join('')

  popup.document.write(`<!doctype html><html><head><title>PhoneFlow barcode labels</title><style>
    @page{size:60mm 40mm;margin:2mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#05070c;font-family:Arial,sans-serif}
    .label{width:56mm;height:36mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden;break-after:page;page-break-after:always}.label:last-child{break-after:auto;page-break-after:auto}
    h1{max-width:54mm;margin:0 0 .8mm;font-size:10.5pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.meta{margin:0 0 .8mm;font-size:7pt}.price{margin:0;font-size:10.5pt;font-weight:800}.scan-value{margin:.3mm 0 .8mm;font:700 6.5pt ui-monospace,Consolas,monospace}
    .barcode-box{width:54mm;display:flex;justify-content:center;overflow:hidden}svg{width:54mm;max-width:54mm;height:auto}@media screen{body{padding:20px}.label{margin:0 auto 20px;border:1px dashed #aaa}}
  </style></head><body>${labels}<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</script></body></html>`)
  popup.document.close()
  return true
}

function escapeHtml(value: string) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] || character)
}
