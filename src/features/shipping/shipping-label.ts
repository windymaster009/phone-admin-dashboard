import JsBarcode from 'jsbarcode'

export type ShippingLabelItem = {
  name: string
  quantity: number
  sku?: string
  imei?: string
}

export type ShippingLabelData = {
  shipmentNo: string
  recipientName: string
  recipientPhone: string
  address: string
  shippingDate?: string
  courierName?: string
  trackingNumber?: string
  items: ShippingLabelItem[]
}

export function shippingLabelBarcodeValue(data: ShippingLabelData): string {
  return String(data.trackingNumber || data.shipmentNo || '').trim()
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] || character)
}

function labelDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function itemSummary(items: ShippingLabelItem[]) {
  return items
    .slice(0, 3)
    .map((item) => `${item.quantity}× ${item.name}`)
    .join(' · ')
}

export function printShippingLabel(data: ShippingLabelData) {
  const barcodeValue = shippingLabelBarcodeValue(data)
  if (!barcodeValue) {
    window.alert('Shipment label needs a shipment or tracking number.')
    return false
  }

  let popup: Window | null = null
  try {
    popup = window.open('', 'phoneflow-shipping-label', 'width=560,height=680')
  } catch {
    popup = null
  }

  if (!popup || popup.closed) {
    window.alert('Allow pop-ups for PhoneFlow, then try printing the shipping label again.')
    return false
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  JsBarcode(svg, barcodeValue, {
    format: 'CODE128',
    width: 1.15,
    height: 31,
    displayValue: false,
    margin: 2,
    background: '#ffffff',
    lineColor: '#05070c',
  })

  const items = itemSummary(data.items)
  const extraCount = Math.max(0, data.items.length - 3)
  const courier = [data.courierName, data.trackingNumber && `#${data.trackingNumber}`].filter(Boolean).join(' · ')
  const date = labelDate(data.shippingDate)

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(data.shipmentNo)} shipping label</title><style>
    @page{size:60mm 40mm;margin:1.5mm}
    *{box-sizing:border-box}
    body{margin:0;background:#fff;color:#05070c;font-family:Arial,sans-serif}
    .label{width:57mm;height:37mm;display:flex;flex-direction:column;overflow:hidden}
    .top{display:flex;align-items:flex-start;justify-content:space-between;gap:2mm;border-bottom:.35mm solid #111;padding-bottom:.7mm}
    .ship-no{font:800 7.5pt ui-monospace,Consolas,monospace;white-space:nowrap}
    .date{font-size:6.3pt;white-space:nowrap}
    .to{margin-top:.7mm;font-size:5.8pt;font-weight:800;letter-spacing:.08em}
    .name{margin:.2mm 0 0;font-size:10.5pt;font-weight:900;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .phone{margin:.2mm 0 0;font-size:8.2pt;font-weight:800}
    .address{height:8.5mm;margin:.45mm 0 0;font-size:7.2pt;font-weight:700;line-height:1.14;overflow:hidden}
    .items{margin:.2mm 0 0;font-size:6.3pt;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .courier{margin:.25mm 0 0;font-size:5.9pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .barcode-row{margin-top:auto;display:flex;align-items:flex-end;gap:1mm;border-top:.25mm solid #ddd;padding-top:.5mm}
    .barcode{flex:1;min-width:0;text-align:center}
    .barcode svg{width:100%;max-height:8mm}
    .code{margin-top:-.2mm;font:700 5.4pt ui-monospace,Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .mark{font-size:5.5pt;font-weight:900;writing-mode:vertical-rl;transform:rotate(180deg)}
    @media screen{
      body{min-height:100vh;padding:18px;background:#eef0f4;display:flex;flex-direction:column;align-items:center}
      .toolbar{display:flex;gap:10px;margin-bottom:16px}
      .toolbar button{padding:8px 15px;border-radius:7px;border:1px solid #d1d5db;background:#fff;font:600 13px Arial;cursor:pointer}
      .toolbar .print{border-color:#6d28d9;background:#7c3aed;color:#fff}
      .label{background:#fff;border:1px dashed #999;box-shadow:0 2px 7px rgba(0,0,0,.12)}
    }
    @media print{.toolbar{display:none!important}}
  </style></head><body>
    <div class="toolbar"><button class="print" id="print-btn">Print label</button><button id="close-btn">Close</button></div>
    <section class="label">
      <div class="top"><span class="ship-no">${escapeHtml(data.shipmentNo)}</span><span class="date">${escapeHtml(date)}</span></div>
      <div class="to">SHIP TO</div>
      <div class="name">${escapeHtml(data.recipientName)}</div>
      <div class="phone">${escapeHtml(data.recipientPhone)}</div>
      <div class="address">${escapeHtml(data.address)}</div>
      <div class="items">${escapeHtml(items)}${extraCount ? ` · +${extraCount} more` : ''}</div>
      ${courier ? `<div class="courier">${escapeHtml(courier)}</div>` : ''}
      <div class="barcode-row"><div class="barcode">${svg.outerHTML}<div class="code">${escapeHtml(barcodeValue)}</div></div><div class="mark">PHONEFLOW</div></div>
    </section>
  </body></html>`

  try {
    popup.document.open()
    popup.document.write(html)
    popup.document.close()
    const printButton = popup.document.getElementById('print-btn')
    if (printButton) printButton.onclick = () => {
      popup?.focus()
      popup?.print()
    }
    const closeButton = popup.document.getElementById('close-btn')
    if (closeButton) closeButton.onclick = () => popup?.close()
  } catch {
    popup.close()
    return false
  }

  let printed = false
  const triggerPrint = () => {
    if (printed || popup?.closed) return
    printed = true
    try {
      popup?.focus()
      popup?.print()
    } catch {
      // Manual Print button remains available.
    }
  }

  if (popup.document.readyState === 'complete') setTimeout(triggerPrint, 60)
  else {
    try { popup.addEventListener('DOMContentLoaded', triggerPrint, { once: true }) } catch { /* ignore */ }
    setTimeout(triggerPrint, 180)
  }

  return true
}
