import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  Barcode,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HandCoins,
  Package,
  Plus,
  Printer,
  ScanLine,
  ShoppingCart,
  Smartphone,
  Trash2,
  Wrench,
  X,
} from 'lucide-react'
import { api } from './api'
import { BarcodeGraphic, printInventoryLabels } from './barcode'

type ModalKind = 'stock' | 'purchase' | 'sale' | 'pawn' | 'scan' | 'label'
type StockCategory = 'PHONE' | 'ACCESSORY' | 'SPARE_PART'

type Customer = {
  _id: string
  name: string
  phone: string
}

type InventoryItem = {
  _id: string
  name: string
  sku: string
  category: StockCategory
  quantity: number
  sellPrice: number
  buyPrice?: number
  barcode?: string
  brand?: string
  model?: string
  condition?: string
  status: string
  imei1?: string
}

type Supplier = {
  _id: string
  name: string
  phone?: string
  nationalIdNumber?: string
}

type SellerType = 'EXISTING_SUPPLIER' | 'WALK_IN' | 'NEW_SUPPLIER'
type PurchaseCurrency = 'USD' | 'KHR'

type PurchaseDevice = {
  id: string
  collapsed: boolean
  imei: string
  brand: string
  model: string
  storage: string
  ram: string
  color: string
  condition: string
  batteryHealth: string
  carrierLock: string
  purchasePrice: string
  accessoriesIncluded: string[]
  notes: string
}

function newPurchaseDevice(): PurchaseDevice {
  return {
    id: crypto.randomUUID(), collapsed: false, imei: '', brand: '', model: '', storage: '', ram: '', color: '',
    condition: 'GOOD', batteryHealth: '', carrierLock: 'UNKNOWN', purchasePrice: '', accessoriesIncluded: [], notes: '',
  }
}

function localDateValue() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

const modalMeta: Record<ModalKind, { title: string; description: string; icon: ReactNode }> = {
  stock: {
    title: 'Add stock',
    description: 'Add a phone, accessory, or spare part to inventory.',
    icon: <Package size={21} />,
  },
  purchase: {
    title: 'New purchase',
    description: 'Buy a phone or item from a customer and add it to stock.',
    icon: <Smartphone size={21} />,
  },
  sale: {
    title: 'New sale',
    description: 'Sell an available inventory item to a customer.',
    icon: <ShoppingCart size={21} />,
  },
  pawn: {
    title: 'New pawn contract',
    description: 'Register customer collateral, value, principal, and due date.',
    icon: <HandCoins size={21} />,
  },
  scan: {
    title: 'Scan product',
    description: 'Use a barcode scanner, type a code, or scan with this device camera.',
    icon: <ScanLine size={21} />,
  },
  label: {
    title: 'Purchase completed',
    description: 'The product was added to stock and its barcode label is ready.',
    icon: <Printer size={21} />,
  },
}

function parsePlaceholderAlert(message?: string): ModalKind | null {
  const value = String(message || '').toLowerCase()
  if (value.startsWith('add stock')) return 'stock'
  if (value.startsWith('new purchase')) return 'purchase'
  if (value.startsWith('new sale')) return 'sale'
  if (value.startsWith('new pawn')) return 'pawn'
  return null
}

function ModalShell({ kind, error, busy, onClose, children }: {
  kind: ModalKind
  error: string
  busy: boolean
  onClose: () => void
  children: ReactNode
}) {
  const meta = modalMeta[kind]

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    document.body.classList.add('operation-modal-open')
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.body.classList.remove('operation-modal-open')
    }
  }, [busy, onClose])

  return (
    <div className="operation-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}>
      <section className={`operation-modal operation-modal-${kind}`} role="dialog" aria-modal="true" aria-label={meta.title}>
        <header className="operation-modal-header">
          <span className="operation-modal-icon">{meta.icon}</span>
          <div>
            <span className="eyebrow">PhoneFlow operation</span>
            <h2>{meta.title}</h2>
            <p>{meta.description}</p>
          </div>
          <button type="button" className="operation-modal-close" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={19} />
          </button>
        </header>
        {error && <div className="operation-modal-error"><AlertTriangle size={17} /> {error}</div>}
        {children}
      </section>
    </div>
  )
}

function StockFields({ category }: { category: StockCategory }) {
  return (
    <>
      <label>Item name<input name="name" required placeholder={category === 'PHONE' ? 'iPhone 15 Pro Max' : category === 'ACCESSORY' ? 'USB-C 20W adapter' : 'iPhone 13 OLED LCD'} /></label>
      <label>SKU<input name="sku" placeholder="Leave empty to generate" /></label>
      <label>Brand<input name="brand" placeholder={category === 'PHONE' ? 'Apple' : 'Optional'} /></label>
      <label>{category === 'SPARE_PART' ? 'Compatible model' : 'Model'}<input name="model" placeholder={category === 'SPARE_PART' ? 'iPhone 13' : 'Model'} /></label>
      {category === 'PHONE' && <>
        <label>IMEI 1<input name="imei1" required placeholder="15-digit IMEI" inputMode="numeric" /></label>
        <label>Serial number<input name="serialNumber" /></label>
        <label>Storage<input name="storage" placeholder="256GB" /></label>
        <label>Color<input name="color" /></label>
      </>}
      <label>Condition<select name="condition" defaultValue={category === 'PHONE' ? 'GOOD' : 'NEW'}>
        <option value="NEW">New</option>
        <option value="LIKE_NEW">Like new</option>
        <option value="GOOD">Good</option>
        <option value="FAIR">Fair</option>
        <option value="DAMAGED">Damaged</option>
      </select></label>
      <label>Quantity<input name="quantity" type="number" min="1" defaultValue="1" readOnly={category === 'PHONE'} /></label>
      <label>Low-stock level<input name="reorderLevel" type="number" min="0" defaultValue={category === 'PHONE' ? '0' : '2'} /></label>
      <label>Buy price<input name="buyPrice" type="number" min="0" step="0.01" required /></label>
      <label>Sell price<input name="sellPrice" type="number" min="0" step="0.01" required /></label>
    </>
  )
}

function CameraBarcodeReader({ onScan, onError }: { onScan: (code: string) => void; onError: (message: string) => void }) {
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!active) return
    let scanner: import('html5-qrcode').Html5Qrcode | null = null
    let disposed = false

    async function startCamera() {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
      if (disposed) return
      scanner = new Html5Qrcode('phoneflow-barcode-reader', {
        formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128],
        verbose: false,
      })
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 280, height: 130 } },
        (decodedText) => {
          if (disposed) return
          setActive(false)
          onScan(decodedText)
        },
        () => undefined,
      )
    }

    void startCamera().catch((reason: Error) => {
      setActive(false)
      onError(reason.message || 'Unable to start the camera. Check camera permission and try again.')
    })

    return () => {
      disposed = true
      if (scanner?.isScanning) void scanner.stop().finally(() => scanner?.clear())
      else scanner?.clear()
    }
  }, [active, onError, onScan])

  return (
    <div className="camera-scanner">
      <div id="phoneflow-barcode-reader" className={active ? 'active' : ''} />
      <button type="button" className="secondary-button" onClick={() => setActive((value) => !value)}>
        <Camera size={17} /> {active ? 'Stop camera' : 'Scan with camera'}
      </button>
      <small>Camera scanning requires permission and works on localhost or HTTPS.</small>
    </div>
  )
}

export default function OperationModalBridge() {
  const [kind, setKind] = useState<ModalKind | null>(null)
  const [category, setCategory] = useState<StockCategory>('PHONE')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [estimatedValue, setEstimatedValue] = useState(0)
  const [pawnPercentage, setPawnPercentage] = useState(45)
  const [scanCode, setScanCode] = useState('')
  const [scannedItem, setScannedItem] = useState<InventoryItem | null>(null)
  const [labelItems, setLabelItems] = useState<InventoryItem[]>([])
  const [saleItemId, setSaleItemId] = useState('')
  const [saleUnitPrice, setSaleUnitPrice] = useState('')
  const [sellerType, setSellerType] = useState<SellerType>('WALK_IN')
  const [supplierId, setSupplierId] = useState('')
  const [sellerName, setSellerName] = useState('')
  const [sellerPhone, setSellerPhone] = useState('')
  const [sellerNationalId, setSellerNationalId] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(localDateValue)
  const [purchasePaymentMethod, setPurchasePaymentMethod] = useState('CASH')
  const [purchaseCurrency, setPurchaseCurrency] = useState<PurchaseCurrency>('USD')
  const [purchaseAmountPaid, setPurchaseAmountPaid] = useState('0')
  const [purchaseNotes, setPurchaseNotes] = useState('')
  const [purchaseDevices, setPurchaseDevices] = useState<PurchaseDevice[]>(() => [newPurchaseDevice()])
  const [usdKhrRate, setUsdKhrRate] = useState(4100)
  const imeiInputs = useRef(new Map<string, HTMLInputElement>())

  const maximumPawn = useMemo(
    () => Math.max(0, estimatedValue * pawnPercentage / 100),
    [estimatedValue, pawnPercentage],
  )
  const purchaseTotal = useMemo(
    () => purchaseDevices.reduce((sum, device) => sum + Math.max(0, Number(device.purchasePrice) || 0), 0),
    [purchaseDevices],
  )
  const purchasePaid = Math.max(0, Number(purchaseAmountPaid) || 0)
  const purchaseBalance = Math.max(0, purchaseTotal - purchasePaid)
  const purchasePaymentStatus = purchasePaid <= 0 ? 'UNPAID' : purchasePaid < purchaseTotal ? 'PARTIAL' : 'PAID'

  useEffect(() => {
    const originalAlert = window.alert.bind(window)
    window.alert = (message?: unknown) => {
      const modal = parsePlaceholderAlert(String(message || ''))
      if (modal) {
        setError('')
        setKind(modal)
        return
      }
      originalAlert(String(message || ''))
    }
    return () => { window.alert = originalAlert }
  }, [])

  useEffect(() => {
    const openScanner = () => {
      setError('')
      setScanCode('')
      setScannedItem(null)
      setKind('scan')
    }
    window.addEventListener('phoneflow:open-scanner', openScanner)
    return () => window.removeEventListener('phoneflow:open-scanner', openScanner)
  }, [])

  useEffect(() => {
    if (!kind) return
    if (kind === 'sale' || kind === 'pawn') {
      api<{ customers: Customer[] }>('/customers')
        .then((result) => setCustomers(result.customers))
        .catch((reason: Error) => setError(reason.message))
    }
    if (kind === 'sale') {
      api<{ items: InventoryItem[] }>('/inventory?status=IN_STOCK')
        .then((result) => setInventory(result.items.filter((item) => item.quantity > 0)))
        .catch((reason: Error) => setError(reason.message))
    }
    if (kind === 'purchase') {
      api<{ suppliers: Supplier[] }>('/suppliers')
        .then((result) => setSuppliers(result.suppliers))
        .catch((reason: Error) => setError(reason.message))
      api<{ usdKhr: number }>('/exchange-rates')
        .then((result) => setUsdKhrRate(result.usdKhr))
        .catch(() => setUsdKhrRate(4100))
    }
  }, [kind])

  const close = () => {
    if (busy) return
    const shouldRefresh = kind === 'label' && labelItems.length > 0
    setKind(null)
    setError('')
    setCategory('PHONE')
    setEstimatedValue(0)
    setPawnPercentage(45)
    setScanCode('')
    setScannedItem(null)
    setLabelItems([])
    setSaleItemId('')
    setSaleUnitPrice('')
    setSellerType('WALK_IN')
    setSupplierId('')
    setSellerName('')
    setSellerPhone('')
    setSellerNationalId('')
    setPurchaseDate(localDateValue())
    setPurchasePaymentMethod('CASH')
    setPurchaseCurrency('USD')
    setPurchaseAmountPaid('0')
    setPurchaseNotes('')
    setPurchaseDevices([newPurchaseDevice()])
    if (shouldRefresh) window.location.reload()
  }

  const findScannedProduct = useCallback(async (rawCode: string) => {
    const code = rawCode.trim()
    if (!code) {
      setError('Scan or enter a barcode first')
      return
    }
    setBusy(true)
    setError('')
    setScannedItem(null)
    try {
      const result = await api<{ item: InventoryItem }>(`/inventory/scan/${encodeURIComponent(code)}`)
      setScanCode(code)
      setScannedItem(result.item)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to find this product')
    } finally {
      setBusy(false)
    }
  }, [])

  const handleCameraError = useCallback((message: string) => setError(message), [])

  function sellScannedProduct() {
    if (!scannedItem || scannedItem.status !== 'IN_STOCK' || scannedItem.quantity < 1 || scannedItem.sellPrice <= 0) return
    setInventory((current) => current.some((item) => item._id === scannedItem._id) ? current : [scannedItem, ...current])
    setSaleItemId(scannedItem._id)
    setSaleUnitPrice(String(scannedItem.sellPrice))
    setError('')
    setKind('sale')
  }

  async function submitStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const payload = {
      category,
      sku: String(form.get('sku') || ''),
      name: String(form.get('name') || ''),
      brand: String(form.get('brand') || ''),
      model: String(form.get('model') || ''),
      imei1: category === 'PHONE' ? String(form.get('imei1') || '') : undefined,
      serialNumber: category === 'PHONE' ? String(form.get('serialNumber') || '') : undefined,
      storage: category === 'PHONE' ? String(form.get('storage') || '') : undefined,
      color: category === 'PHONE' ? String(form.get('color') || '') : undefined,
      condition: String(form.get('condition') || 'NEW'),
      quantity: category === 'PHONE' ? 1 : Number(form.get('quantity') || 1),
      reorderLevel: Number(form.get('reorderLevel') || 0),
      buyPrice: Number(form.get('buyPrice') || 0),
      sellPrice: Number(form.get('sellPrice') || 0),
      status: 'IN_STOCK',
      source: 'SUPPLIER',
    }
    try {
      await api('/inventory', { method: 'POST', body: JSON.stringify(payload) })
      close()
      window.location.reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to add stock')
    } finally {
      setBusy(false)
    }
  }

  function updatePurchaseDevice(id: string, update: Partial<PurchaseDevice>) {
    setPurchaseDevices((current) => current.map((device) => device.id === id ? { ...device, ...update } : device))
  }

  function addPurchaseDevice() {
    const device = newPurchaseDevice()
    setPurchaseDevices((current) => [...current.map((item) => ({ ...item, collapsed: true })), device])
    window.setTimeout(() => imeiInputs.current.get(device.id)?.focus(), 0)
  }

  function removePurchaseDevice(id: string) {
    if (purchaseDevices.length === 1) return
    setPurchaseDevices((current) => current.filter((device) => device.id !== id))
    imeiInputs.current.delete(id)
  }

  async function submitPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const payload = {
      type: 'BUY',
      sellerType,
      supplier: sellerType === 'EXISTING_SUPPLIER' ? supplierId : undefined,
      seller: sellerType === 'EXISTING_SUPPLIER' ? undefined : { name: sellerName, phone: sellerPhone, nationalIdNumber: sellerNationalId },
      purchaseDate,
      paymentMethod: purchasePaymentMethod,
      currency: purchaseCurrency,
      exchangeRate: purchaseCurrency === 'KHR' ? usdKhrRate : 1,
      amountPaid: purchasePaid,
      notes: purchaseNotes,
      devices: purchaseDevices.map(({ id: _id, collapsed: _collapsed, ...device }) => device),
    }
    try {
      const result = await api<{ trade: { items: { inventoryItem: InventoryItem }[] } }>('/trades', { method: 'POST', body: JSON.stringify(payload) })
      const purchasedItems = result.trade.items.map((item) => item.inventoryItem).filter(Boolean)
      if (purchasedItems.length > 0) {
        setLabelItems(purchasedItems)
        setKind('label')
      } else {
        setKind(null)
        window.location.reload()
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save purchase')
    } finally {
      setBusy(false)
    }
  }

  async function submitSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const selected = inventory.find((item) => item._id === form.get('inventoryItem'))
    if (!selected) {
      setBusy(false)
      setError('Select an available inventory item')
      return
    }
    const quantity = selected.category === 'PHONE' ? 1 : Number(form.get('quantity') || 1)
    const unitPrice = Number(form.get('unitPrice') || selected.sellPrice)
    const discount = Number(form.get('discount') || 0)
    const total = Math.max(0, quantity * unitPrice - discount)
    const payload = {
      type: 'SELL',
      customer: form.get('customer') || undefined,
      items: [{ inventoryItem: selected._id, name: selected.name, quantity, unitPrice }],
      discount,
      amountPaid: Number(form.get('amountPaid') || total),
      paymentMethod: String(form.get('paymentMethod') || 'CASH'),
      notes: String(form.get('notes') || ''),
    }
    try {
      await api('/trades', { method: 'POST', body: JSON.stringify(payload) })
      close()
      window.location.reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to complete sale')
    } finally {
      setBusy(false)
    }
  }

  async function submitPawn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const payload = {
      customer: form.get('customer'),
      itemSnapshot: {
        name: String(form.get('name') || ''),
        brand: String(form.get('brand') || ''),
        model: String(form.get('model') || ''),
        imei: String(form.get('imei') || ''),
        condition: String(form.get('condition') || 'GOOD'),
        storage: String(form.get('storage') || ''),
        color: String(form.get('color') || ''),
      },
      estimatedValue,
      pawnPercentage,
      principal: Number(form.get('principal') || 0),
      interestRate: Number(form.get('interestRate') || 5),
      dueDate: form.get('dueDate'),
      identificationVerified: form.get('identificationVerified') === 'on',
      notes: String(form.get('notes') || ''),
    }
    try {
      await api('/pawns', { method: 'POST', body: JSON.stringify(payload) })
      close()
      window.location.reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create pawn contract')
    } finally {
      setBusy(false)
    }
  }

  if (!kind) return null

  return (
    <ModalShell kind={kind} error={error} busy={busy} onClose={close}>
      {kind === 'stock' && <form className="operation-form" onSubmit={submitStock}>
        <div className="operation-category-tabs" role="tablist" aria-label="Stock category">
          <button type="button" className={category === 'PHONE' ? 'active' : ''} onClick={() => setCategory('PHONE')}><Smartphone size={18} /> Phone</button>
          <button type="button" className={category === 'ACCESSORY' ? 'active' : ''} onClick={() => setCategory('ACCESSORY')}><Package size={18} /> Accessory</button>
          <button type="button" className={category === 'SPARE_PART' ? 'active' : ''} onClick={() => setCategory('SPARE_PART')}><Wrench size={18} /> Spare part</button>
        </div>
        <div className="operation-form-grid"><StockFields category={category} /></div>
        <footer className="operation-modal-actions"><button type="button" className="ghost-button" onClick={close}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving...' : `Add ${category === 'SPARE_PART' ? 'spare part' : category.toLowerCase()}`}</button></footer>
      </form>}

      {kind === 'purchase' && <form className="operation-form purchase-workflow-form" onSubmit={submitPurchase}>
        <section className="purchase-section-card">
          <div className="purchase-section-heading"><span>1</span><div><h3>Purchase</h3><p>Seller and payment details for this transaction.</p></div></div>
          <div className="purchase-seller-tabs">
            <button type="button" className={sellerType === 'EXISTING_SUPPLIER' ? 'active' : ''} onClick={() => setSellerType('EXISTING_SUPPLIER')}>Existing supplier</button>
            <button type="button" className={sellerType === 'WALK_IN' ? 'active' : ''} onClick={() => setSellerType('WALK_IN')}>Walk-in customer</button>
            <button type="button" className={sellerType === 'NEW_SUPPLIER' ? 'active' : ''} onClick={() => setSellerType('NEW_SUPPLIER')}>New supplier</button>
          </div>
          <div className="operation-form-grid purchase-fields-grid">
            {sellerType === 'EXISTING_SUPPLIER' ? <label className="operation-wide">Supplier<select required value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="" disabled>Select supplier</option>{suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}{supplier.phone ? ` — ${supplier.phone}` : ''}</option>)}</select></label> : <>
              <label>Seller name<input required value={sellerName} onChange={(event) => setSellerName(event.target.value)} placeholder={sellerType === 'NEW_SUPPLIER' ? 'Supplier or business name' : 'Customer name'} /></label>
              <label>Phone number <small>Optional</small><input value={sellerPhone} onChange={(event) => setSellerPhone(event.target.value)} placeholder="012 345 678" /></label>
              <label>National ID <small>Optional</small><input value={sellerNationalId} onChange={(event) => setSellerNationalId(event.target.value)} /></label>
            </>}
            <label>Purchase date<input type="date" required value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} /></label>
            <label>Payment method<select value={purchasePaymentMethod} onChange={(event) => setPurchasePaymentMethod(event.target.value)}><option value="CASH">Cash</option><option value="BANK">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label>
            <label>Currency<select value={purchaseCurrency} onChange={(event) => setPurchaseCurrency(event.target.value as PurchaseCurrency)}><option value="USD">USD — US Dollar</option><option value="KHR">KHR — Khmer Riel</option></select></label>
            <label>Amount paid<input type="number" min="0" max={purchaseTotal || undefined} step={purchaseCurrency === 'KHR' ? '100' : '0.01'} value={purchaseAmountPaid} onChange={(event) => setPurchaseAmountPaid(event.target.value)} /></label>
            <label className="operation-wide">Purchase notes <small>Optional</small><textarea rows={2} value={purchaseNotes} onChange={(event) => setPurchaseNotes(event.target.value)} /></label>
          </div>
          <div className="purchase-payment-summary">
            <div><span>Total amount</span><strong>{purchaseCurrency === 'KHR' ? `${purchaseTotal.toLocaleString()} ៛` : `$${purchaseTotal.toFixed(2)}`}</strong></div>
            <div><span>Amount paid</span><strong>{purchaseCurrency === 'KHR' ? `${purchasePaid.toLocaleString()} ៛` : `$${purchasePaid.toFixed(2)}`}</strong></div>
            <div><span>Balance due</span><strong>{purchaseCurrency === 'KHR' ? `${purchaseBalance.toLocaleString()} ៛` : `$${purchaseBalance.toFixed(2)}`}</strong></div>
            <div><span>Payment status</span><strong className={`payment-state ${purchasePaymentStatus.toLowerCase()}`}>{purchasePaymentStatus}</strong></div>
          </div>
        </section>

        <section className="purchase-section-card devices-section">
          <div className="purchase-section-heading"><span>2</span><div><h3>Devices</h3><p>Every phone receives its own IMEI, inventory record, and barcode.</p></div><b>{purchaseDevices.length} device{purchaseDevices.length === 1 ? '' : 's'}</b></div>
          <div className="purchase-device-list">
            {purchaseDevices.map((device, index) => <article className={`purchase-device-card ${device.collapsed ? 'collapsed' : ''}`} key={device.id}>
              <header><button type="button" className="device-collapse-button" onClick={() => updatePurchaseDevice(device.id, { collapsed: !device.collapsed })}><span>{index + 1}</span><p><strong>Device {index + 1}</strong><small>{[device.brand, device.model, device.storage].filter(Boolean).join(' ') || 'Enter phone information'}{device.imei ? ` · ${device.imei}` : ''}</small></p>{device.collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</button><button type="button" className="device-remove-button" onClick={() => removePurchaseDevice(device.id)} disabled={purchaseDevices.length === 1} aria-label={`Remove device ${index + 1}`}><Trash2 size={16} /></button></header>
              {!device.collapsed && <div className="device-fields-grid">
                <label className="device-imei-field"><span>IMEI</span><div><input ref={(node) => { if (node) imeiInputs.current.set(device.id, node); else imeiInputs.current.delete(device.id) }} required inputMode="numeric" pattern="[0-9]{15}" maxLength={15} value={device.imei} onChange={(event) => updatePurchaseDevice(device.id, { imei: event.target.value.replace(/\D/g, '').slice(0, 15) })} placeholder="15-digit IMEI" /><button type="button" className="secondary-button" onClick={() => imeiInputs.current.get(device.id)?.focus()}><ScanLine size={16} /> Scan IMEI</button></div><small>Click Scan IMEI, then use the barcode scanner.</small></label>
                <label>Brand<input required value={device.brand} onChange={(event) => updatePurchaseDevice(device.id, { brand: event.target.value })} placeholder="Apple" /></label>
                <label>Model<input required value={device.model} onChange={(event) => updatePurchaseDevice(device.id, { model: event.target.value })} placeholder="iPhone 13 Pro" /></label>
                <label>Storage<input required value={device.storage} onChange={(event) => updatePurchaseDevice(device.id, { storage: event.target.value })} placeholder="128GB" /></label>
                <label>RAM <small>Optional</small><input value={device.ram} onChange={(event) => updatePurchaseDevice(device.id, { ram: event.target.value })} placeholder="6GB" /></label>
                <label>Color<input required value={device.color} onChange={(event) => updatePurchaseDevice(device.id, { color: event.target.value })} placeholder="Blue" /></label>
                <label>Condition<select value={device.condition} onChange={(event) => updatePurchaseDevice(device.id, { condition: event.target.value })}><option value="NEW">New</option><option value="LIKE_NEW">Like new</option><option value="GOOD">Good</option><option value="FAIR">Fair</option><option value="DAMAGED">Damaged</option></select></label>
                <label>Battery health <small>iPhone</small><input type="number" min="0" max="100" value={device.batteryHealth} onChange={(event) => updatePurchaseDevice(device.id, { batteryHealth: event.target.value })} placeholder="88" /></label>
                <label>Carrier lock<select value={device.carrierLock} onChange={(event) => updatePurchaseDevice(device.id, { carrierLock: event.target.value })}><option value="UNKNOWN">Unknown</option><option value="UNLOCKED">Unlocked</option><option value="LOCKED">Carrier locked</option></select></label>
                <label>Purchase price ({purchaseCurrency})<input required type="number" min="0" step={purchaseCurrency === 'KHR' ? '100' : '0.01'} value={device.purchasePrice} onChange={(event) => updatePurchaseDevice(device.id, { purchasePrice: event.target.value })} /></label>
                <fieldset className="device-accessories"><legend>Accessories included</legend>{['BOX', 'CHARGER', 'CABLE', 'CASE', 'EARPHONES'].map((accessory) => <label key={accessory}><input type="checkbox" checked={device.accessoriesIncluded.includes(accessory)} onChange={(event) => updatePurchaseDevice(device.id, { accessoriesIncluded: event.target.checked ? [...device.accessoriesIncluded, accessory] : device.accessoriesIncluded.filter((item) => item !== accessory) })} /> {accessory.charAt(0) + accessory.slice(1).toLowerCase()}</label>)}</fieldset>
                <label className="device-notes-field">Device notes <small>Optional</small><textarea rows={2} value={device.notes} onChange={(event) => updatePurchaseDevice(device.id, { notes: event.target.value })} /></label>
              </div>}
            </article>)}
          </div>
          <button type="button" className="add-device-button" onClick={addPurchaseDevice}><Plus size={17} /> Add another device</button>
        </section>
        <footer className="operation-modal-actions"><div className="purchase-submit-summary"><span>{purchaseDevices.length} device{purchaseDevices.length === 1 ? '' : 's'}</span><strong>{purchaseCurrency === 'KHR' ? `${purchaseTotal.toLocaleString()} ៛` : `$${purchaseTotal.toFixed(2)}`}</strong></div><button type="button" className="ghost-button" onClick={close}>Cancel</button><button className="primary-button" disabled={busy || purchaseDevices.length === 0}>{busy ? 'Saving purchase...' : 'Complete purchase'}</button></footer>
      </form>}

      {kind === 'scan' && <div className={`scanner-workflow ${scannedItem ? 'has-result' : ''}`}>
        {!scannedItem ? <>
          <div className="scanner-intro"><h3>How would you like to scan?</h3><p>Use a barcode scanner for the fastest checkout, or open the camera on this device.</p></div>
          <form className="scanner-code-form" onSubmit={(event) => { event.preventDefault(); void findScannedProduct(scanCode) }}>
            <div className="scanner-method-heading"><span><Barcode size={18} /></span><div><strong>Barcode scanner</strong><small>Keep this field selected, then scan the label.</small></div></div>
            <div className="scanner-input-row"><input id="barcode-code" aria-label="Barcode, SKU, IMEI, or serial number" autoFocus value={scanCode} onChange={(event) => setScanCode(event.target.value)} placeholder="Scan or enter product code" autoComplete="off" /><button className="primary-button" disabled={busy}>{busy ? 'Finding...' : 'Find product'}</button></div>
            <small>Works with barcode, SKU, IMEI, and serial number. Most scanners press Enter automatically.</small>
          </form>
          <div className="scanner-divider"><span>or use this device</span></div>
          <CameraBarcodeReader onScan={findScannedProduct} onError={handleCameraError} />
        </> : <>
          <div className="scan-success-banner"><span><CheckCircle2 size={22} /></span><div><strong>Product found</strong><small>Code {scannedItem.barcode || scannedItem.sku} matched an inventory record.</small></div></div>
          <article className="scanned-product-card">
            <div className="scanned-product-heading"><span className="operation-modal-icon"><Package size={20} /></span><div><span className="eyebrow">Ready to continue</span><h3>{scannedItem.name}</h3><p>{[scannedItem.brand, scannedItem.model].filter(Boolean).join(' ') || scannedItem.sku}</p></div><span className={`status-badge status-${scannedItem.status.toLowerCase().replaceAll('_', '-')}`}>{scannedItem.status.replaceAll('_', ' ')}</span></div>
            <div className="scanned-product-details">
              <div><span>Inventory</span><p><small>SKU</small><strong>{scannedItem.sku}</strong></p><p><small>Available</small><strong>{scannedItem.quantity}</strong></p></div>
              <div><span>Device</span><p><small>IMEI</small><strong>{scannedItem.imei1 || 'Not recorded'}</strong></p><p><small>Condition</small><strong>{scannedItem.condition?.replaceAll('_', ' ') || 'Not recorded'}</strong></p></div>
              <div className="price-group"><span>Shop price</span><strong>{scannedItem.sellPrice > 0 ? `$${scannedItem.sellPrice.toFixed(2)}` : 'Not set'}</strong><small>{scannedItem.sellPrice > 0 ? 'Current selling price' : 'Set a price in Stock Information first'}</small></div>
            </div>
            <footer className="scanner-result-actions"><button type="button" className="secondary-button" onClick={() => { setScannedItem(null); setScanCode(''); setError('') }}><ScanLine size={17} /> Scan another</button><div><button type="button" className="ghost-button" onClick={close}>Close</button><button type="button" className="primary-button" onClick={sellScannedProduct} disabled={scannedItem.status !== 'IN_STOCK' || scannedItem.quantity < 1 || scannedItem.sellPrice <= 0}><ShoppingCart size={17} /> Sell product</button></div></footer>
          </article>
        </>}
      </div>}

      {kind === 'label' && labelItems.length > 0 && <div className="label-prompt">
        <div className="label-success"><span><Printer size={21} /></span><div><h3>Print barcode labels now?</h3><p>{labelItems.length} device{labelItems.length === 1 ? ' was' : 's were'} added to inventory. You can also print later from Stock Information.</p></div></div>
        <div className="barcode-label-preview-list">{labelItems.slice(0, 3).map((item) => <article className="barcode-label-preview" key={item.sku}><strong>{item.name}</strong><small>{item.imei1 || item.sku}</small><BarcodeGraphic item={item} compact /></article>)}{labelItems.length > 3 && <p>+ {labelItems.length - 3} more label{labelItems.length - 3 === 1 ? '' : 's'}</p>}</div>
        <footer className="operation-modal-actions"><button type="button" className="ghost-button" onClick={close}>Print later</button><button type="button" className="primary-button" onClick={() => { printInventoryLabels(labelItems); close() }}><Printer size={17} /> Print labels</button></footer>
      </div>}

      {kind === 'sale' && <form className="operation-form" onSubmit={submitSale}>
        <div className="operation-form-grid">
          <label>Customer<select name="customer" defaultValue=""><option value="">Walk-in customer</option>{customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name} — {customer.phone}</option>)}</select></label>
          <label className="operation-wide">Inventory item<select name="inventoryItem" required value={saleItemId} onChange={(event) => {
            const item = inventory.find((entry) => entry._id === event.target.value)
            setSaleItemId(event.target.value)
            setSaleUnitPrice(item ? String(item.sellPrice) : '')
          }}><option value="" disabled>Select available stock</option>{inventory.map((item) => <option key={item._id} value={item._id}>{item.name}{item.imei1 ? ` — ${item.imei1}` : ''} — Qty ${item.quantity} — ${item.sellPrice.toFixed(2)}</option>)}</select></label>
          <label>Quantity<input name="quantity" type="number" min="1" defaultValue="1" /></label><label>Selling price<input name="unitPrice" type="number" min="0" step="0.01" value={saleUnitPrice} onChange={(event) => setSaleUnitPrice(event.target.value)} placeholder="Uses stock price when empty" /></label>
          <label>Discount<input name="discount" type="number" min="0" step="0.01" defaultValue="0" /></label><label>Amount paid<input name="amountPaid" type="number" min="0" step="0.01" /></label>
          <label>Payment method<select name="paymentMethod"><option value="CASH">Cash</option><option value="BANK">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label>
          <label className="operation-wide">Notes<textarea name="notes" rows={3} /></label>
        </div>
        <footer className="operation-modal-actions"><button type="button" className="ghost-button" onClick={close}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving...' : 'Complete sale'}</button></footer>
      </form>}

      {kind === 'pawn' && <form className="operation-form" onSubmit={submitPawn}>
        <div className="operation-form-grid">
          <label>Customer<select name="customer" required defaultValue=""><option value="" disabled>Select customer</option>{customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name} — {customer.phone}</option>)}</select></label>
          <label>Phone name<input name="name" required /></label><label>Brand<input name="brand" /></label><label>Model<input name="model" /></label><label>IMEI<input name="imei" required /></label><label>Storage<input name="storage" /></label><label>Color<input name="color" /></label>
          <label>Condition<select name="condition" defaultValue="GOOD"><option value="LIKE_NEW">Like new</option><option value="GOOD">Good</option><option value="FAIR">Fair</option><option value="DAMAGED">Damaged</option></select></label>
          <label>Estimated resale value<input name="estimatedValue" type="number" min="0" step="0.01" required onChange={(event) => setEstimatedValue(Number(event.target.value))} /></label>
          <label>Pawn percentage<input name="pawnPercentage" type="number" min="40" max="50" value={pawnPercentage} onChange={(event) => setPawnPercentage(Number(event.target.value))} /></label>
          <label>Principal <small>Maximum ${maximumPawn.toFixed(2)}</small><input name="principal" type="number" min="0" max={maximumPawn || undefined} step="0.01" required /></label>
          <label>Interest rate %<input name="interestRate" type="number" min="0" step="0.01" defaultValue="5" /></label><label>Due date<input name="dueDate" type="date" required /></label>
          <label className="operation-checkbox"><input name="identificationVerified" type="checkbox" /> National ID verified</label>
          <label className="operation-wide">Notes<textarea name="notes" rows={3} /></label>
        </div>
        <footer className="operation-modal-actions"><button type="button" className="ghost-button" onClick={close}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving...' : 'Create pawn contract'}</button></footer>
      </form>}
    </ModalShell>
  )
}
