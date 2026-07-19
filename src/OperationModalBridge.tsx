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
type StockCategory = 'PHONE' | 'TABLET' | 'ACCESSORY' | 'SPARE_PART' | 'OTHER'

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

type SellerType = 'EXISTING_CUSTOMER' | 'EXISTING_SUPPLIER' | 'WALK_IN' | 'NEW_CUSTOMER' | 'NEW_SUPPLIER'
type PurchaseCurrency = 'USD' | 'KHR'

type PurchaseDevice = {
  id: string
  collapsed: boolean
  category: StockCategory
  name: string
  sku: string
  quantity: string
  imei: string
  brand: string
  model: string
  storage: string
  ram: string
  color: string
  condition: string
  batteryHealth: string
  carrierLock: string
  compatibleModels: string
  oemQuality: string
  purchasePrice: string
  accessoriesIncluded: string[]
  notes: string
}

function newPurchaseDevice(): PurchaseDevice {
  return {
    id: crypto.randomUUID(), collapsed: false, category: 'PHONE', name: '', sku: '', quantity: '1', imei: '', brand: '', model: '', storage: '', ram: '', color: '',
    condition: 'GOOD', batteryHealth: '', carrierLock: 'UNKNOWN', compatibleModels: '', oemQuality: '', purchasePrice: '', accessoriesIncluded: [], notes: '',
  }
}

function localDateValue() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

const modalMeta: Record<ModalKind, { title: string; description: string; icon: ReactNode }> = {
  stock: {
    title: 'Add stock',
    description: 'Add any supported product category to inventory.',
    icon: <Package size={21} />,
  },
  purchase: {
    title: 'New purchase',
    description: 'Buy one or more products and add them to inventory.',
    icon: <Package size={21} />,
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
  const serialized = category === 'PHONE'
  return (
    <>
      <label>{category === 'SPARE_PART' ? 'Part name' : 'Item name'}<input name="name" required placeholder={category === 'PHONE' ? 'iPhone 15 Pro Max' : category === 'ACCESSORY' ? 'USB-C 20W adapter' : category === 'SPARE_PART' ? 'iPhone 13 OLED LCD' : 'Product name'} /></label>
      <label>SKU<input name="sku" required={category === 'ACCESSORY'} placeholder={category === 'ACCESSORY' ? 'Required SKU' : 'Leave empty to generate'} /></label>
      {(category === 'PHONE' || category === 'TABLET' || category === 'ACCESSORY') && <label>Brand<input name="brand" required placeholder="Brand" /></label>}
      {(category === 'PHONE' || category === 'TABLET') && <label>Model<input name="model" required placeholder="Model" /></label>}
      {category === 'SPARE_PART' && <><label>Compatible models<input name="compatibleModels" required placeholder="iPhone 13, iPhone 13 Pro" /></label><label>OEM quality<select name="oemQuality" required defaultValue=""><option value="" disabled>Select quality</option><option value="OEM">OEM</option><option value="ORIGINAL">Original</option><option value="AFTERMARKET_PREMIUM">Aftermarket premium</option><option value="AFTERMARKET">Aftermarket</option></select></label></>}
      {serialized && <>
        <label>IMEI 1<input name="imei1" required placeholder="15-digit IMEI" inputMode="numeric" /></label>
        <label>Serial number<input name="serialNumber" /></label>
      </>}
      {(category === 'PHONE' || category === 'TABLET') && <><label>Storage<input name="storage" required placeholder="256GB" /></label><label>Color<input name="color" required /></label></>}
      <label>Condition<select name="condition" defaultValue={category === 'PHONE' ? 'GOOD' : 'NEW'}>
        <option value="NEW">New</option>
        <option value="LIKE_NEW">Like new</option>
        <option value="GOOD">Good</option>
        <option value="FAIR">Fair</option>
        <option value="DAMAGED">Damaged</option>
      </select></label>
      <label>Quantity<input name="quantity" type="number" min="1" step="1" defaultValue="1" readOnly={serialized} /></label>
      <label>Low-stock level<input name="reorderLevel" type="number" min="0" defaultValue={serialized ? '0' : '2'} /></label>
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
  const [sellerCustomerId, setSellerCustomerId] = useState('')
  const [sellerName, setSellerName] = useState('')
  const [sellerPhone, setSellerPhone] = useState('')
  const [sellerNationalId, setSellerNationalId] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(localDateValue)
  const [purchasePaymentMethod, setPurchasePaymentMethod] = useState('CASH')
  const [purchaseCurrency, setPurchaseCurrency] = useState<PurchaseCurrency>('USD')
  const [purchaseAmountPaid, setPurchaseAmountPaid] = useState('0')
  const [purchaseNotes, setPurchaseNotes] = useState('')
  const [purchaseDevices, setPurchaseDevices] = useState<PurchaseDevice[]>(() => [newPurchaseDevice()])
  const [purchaseStep, setPurchaseStep] = useState<1 | 2>(1)
  const [purchaseAttempted, setPurchaseAttempted] = useState(false)
  const [usdKhrRate, setUsdKhrRate] = useState(4100)
  const imeiInputs = useRef(new Map<string, HTMLInputElement>())

  const maximumPawn = useMemo(
    () => Math.max(0, estimatedValue * pawnPercentage / 100),
    [estimatedValue, pawnPercentage],
  )
  const purchaseTotal = useMemo(
    () => purchaseDevices.reduce((sum, item) => sum + Math.max(0, Number(item.purchasePrice) || 0) * (item.category === 'PHONE' ? 1 : Math.max(1, Number(item.quantity) || 1)), 0),
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
    if (kind === 'sale' || kind === 'pawn' || kind === 'purchase') {
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
    setSellerCustomerId('')
    setSellerName('')
    setSellerPhone('')
    setSellerNationalId('')
    setPurchaseDate(localDateValue())
    setPurchasePaymentMethod('CASH')
    setPurchaseCurrency('USD')
    setPurchaseAmountPaid('0')
    setPurchaseNotes('')
    setPurchaseDevices([newPurchaseDevice()])
    setPurchaseStep(1)
    setPurchaseAttempted(false)
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
      storage: category === 'PHONE' || category === 'TABLET' ? String(form.get('storage') || '') : undefined,
      color: category === 'PHONE' || category === 'TABLET' ? String(form.get('color') || '') : undefined,
      compatibleModels: category === 'SPARE_PART' ? String(form.get('compatibleModels') || '').split(',').map((value) => value.trim()).filter(Boolean) : undefined,
      oemQuality: category === 'SPARE_PART' ? String(form.get('oemQuality') || '') : undefined,
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

  function purchaseItemErrors(item: PurchaseDevice) {
    const errors: Record<string, string> = {}
    const price = Number(item.purchasePrice)
    const quantity = Number(item.quantity)
    if (!Number.isFinite(price) || price < 0 || item.purchasePrice === '') errors.purchasePrice = 'Enter a valid unit purchase price'
    if (item.category !== 'PHONE' && (!Number.isInteger(quantity) || quantity < 1)) errors.quantity = 'Quantity must be at least 1'
    if (item.category === 'PHONE') {
      if (!/^\d{15}$/.test(item.imei)) errors.imei = 'IMEI must contain exactly 15 digits'
      if (!item.brand.trim()) errors.brand = 'Brand is required'
      if (!item.model.trim()) errors.model = 'Model is required'
      if (!item.storage.trim()) errors.storage = 'Storage is required'
      if (!item.color.trim()) errors.color = 'Color is required'
    } else if (item.category === 'TABLET') {
      if (!item.brand.trim()) errors.brand = 'Brand is required'
      if (!item.model.trim()) errors.model = 'Model is required'
      if (!item.storage.trim()) errors.storage = 'Storage is required'
      if (!item.color.trim()) errors.color = 'Color is required'
    } else {
      if (!item.name.trim()) errors.name = item.category === 'SPARE_PART' ? 'Part name is required' : 'Item name is required'
      if (item.category === 'ACCESSORY' && !item.brand.trim()) errors.brand = 'Brand is required'
      if (item.category === 'ACCESSORY' && !item.sku.trim()) errors.sku = 'SKU is required'
      if (item.category === 'SPARE_PART' && !item.compatibleModels.trim()) errors.compatibleModels = 'Compatible models are required'
      if (item.category === 'SPARE_PART' && !item.oemQuality) errors.oemQuality = 'Select OEM quality'
    }
    return errors
  }

  const purchaseSellerValid = sellerType === 'EXISTING_SUPPLIER'
    ? Boolean(supplierId)
    : sellerType === 'EXISTING_CUSTOMER'
      ? Boolean(sellerCustomerId)
      : Boolean(sellerName.trim()) && (sellerType !== 'NEW_CUSTOMER' || Boolean(sellerPhone.trim()))
  const purchaseItemsValid = purchaseDevices.length > 0 && purchaseDevices.every((item) => Object.keys(purchaseItemErrors(item)).length === 0)

  function openPurchaseItem(id: string) {
    setPurchaseDevices((current) => current.map((item) => ({ ...item, collapsed: item.id !== id })))
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
    setPurchaseAttempted(true)
    if (!purchaseSellerValid) {
      setPurchaseStep(1)
      setError('Complete the required seller information before continuing')
      return
    }
    if (!purchaseItemsValid || purchasePaid > purchaseTotal) {
      const firstInvalid = purchaseDevices.find((item) => Object.keys(purchaseItemErrors(item)).length > 0)
      setPurchaseStep(2)
      if (firstInvalid) openPurchaseItem(firstInvalid.id)
      setError(purchasePaid > purchaseTotal ? 'Amount paid cannot exceed the purchase total' : 'Complete the highlighted item fields')
      return
    }
    setBusy(true)
    setError('')
    const payload = {
      type: 'BUY',
      sellerType,
      supplier: sellerType === 'EXISTING_SUPPLIER' ? supplierId : undefined,
      customer: sellerType === 'EXISTING_CUSTOMER' ? sellerCustomerId : undefined,
      seller: sellerType.startsWith('EXISTING_') ? undefined : { name: sellerName, phone: sellerPhone, nationalIdNumber: sellerNationalId },
      purchaseDate,
      paymentMethod: purchasePaymentMethod,
      currency: purchaseCurrency,
      exchangeRate: purchaseCurrency === 'KHR' ? usdKhrRate : 1,
      amountPaid: purchasePaid,
      notes: purchaseNotes,
      items: purchaseDevices.map(({ id: _id, collapsed: _collapsed, ...item }) => item),
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
          <button type="button" className={category === 'TABLET' ? 'active' : ''} onClick={() => setCategory('TABLET')}><Smartphone size={18} /> Tablet</button>
          <button type="button" className={category === 'ACCESSORY' ? 'active' : ''} onClick={() => setCategory('ACCESSORY')}><Package size={18} /> Accessory</button>
          <button type="button" className={category === 'SPARE_PART' ? 'active' : ''} onClick={() => setCategory('SPARE_PART')}><Wrench size={18} /> Spare part</button>
          <button type="button" className={category === 'OTHER' ? 'active' : ''} onClick={() => setCategory('OTHER')}><Package size={18} /> Other</button>
        </div>
        <div className="operation-form-grid"><StockFields category={category} /></div>
        <footer className="operation-modal-actions"><button type="button" className="ghost-button" onClick={close}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving...' : `Add ${category === 'SPARE_PART' ? 'spare part' : category.toLowerCase()}`}</button></footer>
      </form>}

      {kind === 'purchase' && <form className="operation-form purchase-workflow-form" onSubmit={submitPurchase}>
        <nav className="purchase-stepper" aria-label="Purchase progress">
          <button type="button" className={purchaseStep === 1 ? 'active' : purchaseSellerValid ? 'complete' : ''} onClick={() => setPurchaseStep(1)}><span>{purchaseSellerValid ? <CheckCircle2 size={15} /> : '1'}</span><p><strong>Seller & purchase</strong><small>Transaction details</small></p></button>
          <i />
          <button type="button" className={purchaseStep === 2 ? 'active' : purchaseItemsValid ? 'complete' : ''} onClick={() => { if (purchaseSellerValid) { setError(''); setPurchaseAttempted(false); setPurchaseStep(2) } else { setPurchaseAttempted(true); setError('Complete the seller information first') } }}><span>{purchaseItemsValid ? <CheckCircle2 size={15} /> : '2'}</span><p><strong>Items & payment</strong><small>Products and settlement</small></p></button>
        </nav>

        {purchaseStep === 1 && <>
        <div className="purchase-step-content">
        <section className="purchase-section-card">
          <div className="purchase-section-heading"><span>1</span><div><h3>Purchase</h3><p>Seller and payment details for this transaction.</p></div></div>
          <div className="purchase-seller-tabs">
            <button type="button" className={sellerType === 'EXISTING_CUSTOMER' ? 'active' : ''} onClick={() => setSellerType('EXISTING_CUSTOMER')}>Existing customer</button>
            <button type="button" className={sellerType === 'EXISTING_SUPPLIER' ? 'active' : ''} onClick={() => setSellerType('EXISTING_SUPPLIER')}>Existing supplier</button>
            <button type="button" className={sellerType === 'WALK_IN' ? 'active' : ''} onClick={() => setSellerType('WALK_IN')}>Walk-in customer</button>
            <button type="button" className={sellerType === 'NEW_CUSTOMER' ? 'active' : ''} onClick={() => setSellerType('NEW_CUSTOMER')}>New customer</button>
            <button type="button" className={sellerType === 'NEW_SUPPLIER' ? 'active' : ''} onClick={() => setSellerType('NEW_SUPPLIER')}>New supplier</button>
          </div>
          <div className="operation-form-grid purchase-fields-grid">
            {sellerType === 'EXISTING_SUPPLIER' ? <label className={`operation-wide ${purchaseAttempted && !supplierId ? 'field-invalid' : ''}`}>Supplier<select required value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="" disabled>Select supplier</option>{suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}{supplier.phone ? ` — ${supplier.phone}` : ''}</option>)}</select>{purchaseAttempted && !supplierId && <small>Select a supplier</small>}</label> : sellerType === 'EXISTING_CUSTOMER' ? <label className={`operation-wide ${purchaseAttempted && !sellerCustomerId ? 'field-invalid' : ''}`}>Customer<select required value={sellerCustomerId} onChange={(event) => setSellerCustomerId(event.target.value)}><option value="" disabled>Select customer</option>{customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name} — {customer.phone}</option>)}</select>{purchaseAttempted && !sellerCustomerId && <small>Select a customer</small>}</label> : <>
              <label className={purchaseAttempted && !sellerName.trim() ? 'field-invalid' : ''}>Seller name<input required value={sellerName} onChange={(event) => setSellerName(event.target.value)} placeholder={sellerType === 'NEW_SUPPLIER' ? 'Supplier or business name' : 'Customer name'} />{purchaseAttempted && !sellerName.trim() && <small>Seller name is required</small>}</label>
              <label className={purchaseAttempted && sellerType === 'NEW_CUSTOMER' && !sellerPhone.trim() ? 'field-invalid' : ''}>Phone number {sellerType !== 'NEW_CUSTOMER' && <small className="optional-marker">Optional</small>}<input required={sellerType === 'NEW_CUSTOMER'} value={sellerPhone} onChange={(event) => setSellerPhone(event.target.value)} placeholder="012 345 678" />{purchaseAttempted && sellerType === 'NEW_CUSTOMER' && !sellerPhone.trim() && <small>Phone number is required for a new customer</small>}</label>
              <label>National ID <small className="optional-marker">Optional</small><input value={sellerNationalId} onChange={(event) => setSellerNationalId(event.target.value)} /></label>
            </>}
            <label>Purchase date<input type="date" required value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} /></label>
            <label>Payment method<select value={purchasePaymentMethod} onChange={(event) => setPurchasePaymentMethod(event.target.value)}><option value="CASH">Cash</option><option value="BANK">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label>
            <label>Currency<select value={purchaseCurrency} onChange={(event) => setPurchaseCurrency(event.target.value as PurchaseCurrency)}><option value="USD">USD — US Dollar</option><option value="KHR">KHR — Khmer Riel</option></select></label>
            <label className="operation-wide">Purchase notes <small className="optional-marker">Optional</small><textarea rows={2} value={purchaseNotes} onChange={(event) => setPurchaseNotes(event.target.value)} /></label>
          </div>
        </section>
        </div>

        <footer className="operation-modal-actions"><div className="purchase-submit-summary"><span>Step 1 of 2</span><strong>Seller & purchase</strong></div><button type="button" className="ghost-button" onClick={close}>Cancel</button><button type="button" className="primary-button" onClick={() => { setPurchaseAttempted(true); if (purchaseSellerValid) { setError(''); setPurchaseAttempted(false); setPurchaseStep(2) } else setError('Complete the required seller information') }}>Continue to items</button></footer>
        </>}

        {purchaseStep === 2 && <>
        <div className="purchase-step-content">
        <section className="purchase-section-card devices-section">
          <div className="purchase-section-heading"><span>2</span><div><h3>Inventory items</h3><p>Choose a category for each item. The required fields adjust automatically.</p></div><b>{purchaseDevices.length} item{purchaseDevices.length === 1 ? '' : 's'}</b></div>
          <div className="purchase-device-list">
            {purchaseDevices.map((device, index) => {
              const itemErrors = purchaseItemErrors(device)
              const itemComplete = Object.keys(itemErrors).length === 0
              return <article className={`purchase-device-card ${device.collapsed ? 'collapsed' : ''} ${itemComplete ? 'complete' : purchaseAttempted ? 'invalid' : ''}`} key={device.id} onBlur={(event) => { if (itemComplete && !event.currentTarget.contains(event.relatedTarget as Node | null)) updatePurchaseDevice(device.id, { collapsed: true }) }}>
              <header><button type="button" className="device-collapse-button" onClick={() => device.collapsed ? openPurchaseItem(device.id) : updatePurchaseDevice(device.id, { collapsed: true })}><span>{itemComplete ? <CheckCircle2 size={17} /> : index + 1}</span><p><strong>{device.category.replace('_', ' ')} {index + 1}</strong><small>{itemComplete ? 'Ready to save' : device.category === 'PHONE' ? ([device.brand, device.model, device.storage].filter(Boolean).join(' ') || 'Enter phone information') : (device.name || 'Enter item information')}{device.imei ? ` · ${device.imei}` : ''}</small></p>{device.collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</button><button type="button" className="device-remove-button" onClick={() => removePurchaseDevice(device.id)} disabled={purchaseDevices.length === 1} aria-label={`Remove item ${index + 1}`}><Trash2 size={16} /></button></header>
              {!device.collapsed && <div className="device-fields-grid">
                {purchaseAttempted && Object.keys(itemErrors).length > 0 && <div className="item-validation-summary"><AlertTriangle size={15} /><span>Complete {Object.keys(itemErrors).length} highlighted field{Object.keys(itemErrors).length === 1 ? '' : 's'}.</span></div>}
                <label className="purchase-category-select">Category<select value={device.category} onChange={(event) => updatePurchaseDevice(device.id, { category: event.target.value as StockCategory, quantity: event.target.value === 'PHONE' ? '1' : device.quantity })}>{(['PHONE', 'TABLET', 'ACCESSORY', 'SPARE_PART', 'OTHER'] as StockCategory[]).map((value) => <option value={value} key={value}>{value.replace('_', ' ')}</option>)}</select></label>
                <fieldset className="purchase-category-picker"><legend>Category</legend>{(['PHONE', 'TABLET', 'ACCESSORY', 'SPARE_PART', 'OTHER'] as StockCategory[]).map((value) => <button type="button" key={value} className={device.category === value ? 'active' : ''} onClick={() => updatePurchaseDevice(device.id, { category: value, quantity: value === 'PHONE' ? '1' : device.quantity })}>{value.replace('_', ' ')}</button>)}</fieldset>

                <div className="device-group-label"><span>Product identity</span><small>Required identification information</small></div>
                {device.category === 'PHONE' ? <>
                  <label className={`device-imei-field ${purchaseAttempted && itemErrors.imei ? 'field-invalid' : ''}`}><span>IMEI</span><div><input ref={(node) => { if (node) imeiInputs.current.set(device.id, node); else imeiInputs.current.delete(device.id) }} required inputMode="numeric" pattern="[0-9]{15}" maxLength={15} value={device.imei} onChange={(event) => updatePurchaseDevice(device.id, { imei: event.target.value.replace(/\D/g, '').slice(0, 15) })} placeholder="15-digit IMEI" /><button type="button" className="secondary-button" onClick={() => imeiInputs.current.get(device.id)?.focus()}><ScanLine size={16} /> Scan IMEI</button></div><small>{purchaseAttempted && itemErrors.imei ? itemErrors.imei : 'Click Scan IMEI, then use the barcode scanner.'}</small></label>
                  <label className={purchaseAttempted && itemErrors.brand ? 'field-invalid' : ''}>Brand<input required value={device.brand} onChange={(event) => updatePurchaseDevice(device.id, { brand: event.target.value })} placeholder="Apple" />{purchaseAttempted && itemErrors.brand && <small>{itemErrors.brand}</small>}</label>
                  <label className={purchaseAttempted && itemErrors.model ? 'field-invalid' : ''}>Model<input required value={device.model} onChange={(event) => updatePurchaseDevice(device.id, { model: event.target.value })} placeholder="iPhone 13 Pro" />{purchaseAttempted && itemErrors.model && <small>{itemErrors.model}</small>}</label>
                  <label className={purchaseAttempted && itemErrors.storage ? 'field-invalid' : ''}>Storage<input required value={device.storage} onChange={(event) => updatePurchaseDevice(device.id, { storage: event.target.value })} placeholder="128GB" />{purchaseAttempted && itemErrors.storage && <small>{itemErrors.storage}</small>}</label>
                  <label>RAM <small className="optional-marker">Optional</small><input value={device.ram} onChange={(event) => updatePurchaseDevice(device.id, { ram: event.target.value })} placeholder="6GB" /></label>
                  <label className={purchaseAttempted && itemErrors.color ? 'field-invalid' : ''}>Color<input required value={device.color} onChange={(event) => updatePurchaseDevice(device.id, { color: event.target.value })} placeholder="Blue" />{purchaseAttempted && itemErrors.color && <small>{itemErrors.color}</small>}</label>
                  <label>Battery health <small className="optional-marker">Optional</small><input type="number" min="0" max="100" value={device.batteryHealth} onChange={(event) => updatePurchaseDevice(device.id, { batteryHealth: event.target.value })} placeholder="88" /></label>
                  <label>Carrier lock<select value={device.carrierLock} onChange={(event) => updatePurchaseDevice(device.id, { carrierLock: event.target.value })}><option value="UNKNOWN">Unknown</option><option value="UNLOCKED">Unlocked</option><option value="LOCKED">Carrier locked</option></select></label>
                  <fieldset className="device-accessories"><legend>Accessories included</legend>{['BOX', 'CHARGER', 'CABLE', 'CASE', 'EARPHONES'].map((accessory) => <label key={accessory}><input type="checkbox" checked={device.accessoriesIncluded.includes(accessory)} onChange={(event) => updatePurchaseDevice(device.id, { accessoriesIncluded: event.target.checked ? [...device.accessoriesIncluded, accessory] : device.accessoriesIncluded.filter((item) => item !== accessory) })} /> {accessory.charAt(0) + accessory.slice(1).toLowerCase()}</label>)}</fieldset>
                </> : <>
                  {device.category === 'TABLET' ? <>
                    <label className={purchaseAttempted && itemErrors.brand ? 'field-invalid' : ''}>Brand<input required value={device.brand} onChange={(event) => updatePurchaseDevice(device.id, { brand: event.target.value })} placeholder="Apple" />{purchaseAttempted && itemErrors.brand && <small>{itemErrors.brand}</small>}</label>
                    <label className={purchaseAttempted && itemErrors.model ? 'field-invalid' : ''}>Model<input required value={device.model} onChange={(event) => updatePurchaseDevice(device.id, { model: event.target.value })} placeholder="iPad Air" />{purchaseAttempted && itemErrors.model && <small>{itemErrors.model}</small>}</label>
                    <label className={purchaseAttempted && itemErrors.storage ? 'field-invalid' : ''}>Storage<input required value={device.storage} onChange={(event) => updatePurchaseDevice(device.id, { storage: event.target.value })} placeholder="256GB" />{purchaseAttempted && itemErrors.storage && <small>{itemErrors.storage}</small>}</label>
                    <label className={purchaseAttempted && itemErrors.color ? 'field-invalid' : ''}>Color<input required value={device.color} onChange={(event) => updatePurchaseDevice(device.id, { color: event.target.value })} placeholder="Space Gray" />{purchaseAttempted && itemErrors.color && <small>{itemErrors.color}</small>}</label>
                    <label>SKU <small className="optional-marker">Optional</small><input value={device.sku} onChange={(event) => updatePurchaseDevice(device.id, { sku: event.target.value.toUpperCase() })} placeholder="Generated if empty" /></label>
                  </> : <>
                    <label className={purchaseAttempted && itemErrors.name ? 'field-invalid' : ''}>{device.category === 'SPARE_PART' ? 'Part name' : 'Item name'}<input required value={device.name} onChange={(event) => updatePurchaseDevice(device.id, { name: event.target.value })} placeholder={device.category === 'ACCESSORY' ? 'USB-C charger' : device.category === 'SPARE_PART' ? 'OLED display assembly' : 'Product name'} />{purchaseAttempted && itemErrors.name && <small>{itemErrors.name}</small>}</label>
                    {device.category === 'ACCESSORY' && <label className={purchaseAttempted && itemErrors.brand ? 'field-invalid' : ''}>Brand<input required value={device.brand} onChange={(event) => updatePurchaseDevice(device.id, { brand: event.target.value })} placeholder="Anker" />{purchaseAttempted && itemErrors.brand && <small>{itemErrors.brand}</small>}</label>}
                    <label className={purchaseAttempted && itemErrors.sku ? 'field-invalid' : ''}>SKU {device.category !== 'ACCESSORY' && <small className="optional-marker">Optional</small>}<input required={device.category === 'ACCESSORY'} value={device.sku} onChange={(event) => updatePurchaseDevice(device.id, { sku: event.target.value.toUpperCase() })} placeholder={device.category === 'ACCESSORY' ? 'Required SKU' : 'Generated if empty'} />{purchaseAttempted && itemErrors.sku && <small>{itemErrors.sku}</small>}</label>
                  </>}
                  {device.category === 'SPARE_PART' && <><label className={purchaseAttempted && itemErrors.compatibleModels ? 'field-invalid' : ''}>Compatible models<input required value={device.compatibleModels} onChange={(event) => updatePurchaseDevice(device.id, { compatibleModels: event.target.value })} placeholder="iPhone 13, iPhone 13 Pro" />{purchaseAttempted && itemErrors.compatibleModels && <small>{itemErrors.compatibleModels}</small>}</label><label className={purchaseAttempted && itemErrors.oemQuality ? 'field-invalid' : ''}>OEM quality<select required value={device.oemQuality} onChange={(event) => updatePurchaseDevice(device.id, { oemQuality: event.target.value })}><option value="" disabled>Select quality</option><option value="OEM">OEM</option><option value="ORIGINAL">Original</option><option value="AFTERMARKET_PREMIUM">Aftermarket premium</option><option value="AFTERMARKET">Aftermarket</option></select>{purchaseAttempted && itemErrors.oemQuality && <small>{itemErrors.oemQuality}</small>}</label></>}
                  <label className={purchaseAttempted && itemErrors.quantity ? 'field-invalid' : ''}>Quantity<input required type="number" min="1" step="1" value={device.quantity} onChange={(event) => updatePurchaseDevice(device.id, { quantity: event.target.value })} />{purchaseAttempted && itemErrors.quantity && <small>{itemErrors.quantity}</small>}</label>
                </>}
                <div className="device-group-label"><span>Condition & purchase</span><small>Stock condition, cost, and optional notes</small></div>
                <label>Condition<select value={device.condition} onChange={(event) => updatePurchaseDevice(device.id, { condition: event.target.value })}><option value="NEW">New</option><option value="LIKE_NEW">Like new</option><option value="GOOD">Good</option><option value="FAIR">Fair</option><option value="DAMAGED">Damaged</option></select></label>
                <label className={purchaseAttempted && itemErrors.purchasePrice ? 'field-invalid' : ''}>Unit purchase price ({purchaseCurrency})<input required type="number" min="0" step={purchaseCurrency === 'KHR' ? '100' : '0.01'} value={device.purchasePrice} onChange={(event) => updatePurchaseDevice(device.id, { purchasePrice: event.target.value })} />{purchaseAttempted && itemErrors.purchasePrice && <small>{itemErrors.purchasePrice}</small>}</label>
                <label className="device-notes-field">Item notes <small className="optional-marker">Optional</small><textarea rows={2} value={device.notes} onChange={(event) => updatePurchaseDevice(device.id, { notes: event.target.value })} /></label>
              </div>}
            </article>})}
          </div>
          <button type="button" className="add-device-button" onClick={addPurchaseDevice}><Plus size={17} /> Add another item</button>
        </section>
        <section className="purchase-section-card purchase-settlement-card">
          <div className="purchase-section-heading"><span><CheckCircle2 size={17} /></span><div><h3>Payment settlement</h3><p>Confirm what was paid after reviewing the complete purchase total.</p></div></div>
          <div className="operation-form-grid purchase-fields-grid"><label className={purchasePaid > purchaseTotal ? 'field-invalid' : ''}>Amount paid ({purchaseCurrency})<input type="number" min="0" max={purchaseTotal || undefined} step={purchaseCurrency === 'KHR' ? '100' : '0.01'} value={purchaseAmountPaid} onChange={(event) => setPurchaseAmountPaid(event.target.value)} />{purchasePaid > purchaseTotal && <small>Amount paid cannot exceed the total</small>}</label></div>
          <div className="purchase-payment-summary">
            <div><span>Total amount</span><strong>{purchaseCurrency === 'KHR' ? `${purchaseTotal.toLocaleString()} ៛` : `$${purchaseTotal.toFixed(2)}`}</strong></div>
            <div><span>Amount paid</span><strong>{purchaseCurrency === 'KHR' ? `${purchasePaid.toLocaleString()} ៛` : `$${purchasePaid.toFixed(2)}`}</strong></div>
            <div><span>Balance due</span><strong>{purchaseCurrency === 'KHR' ? `${purchaseBalance.toLocaleString()} ៛` : `$${purchaseBalance.toFixed(2)}`}</strong></div>
            <div><span>Payment status</span><strong className={`payment-state ${purchasePaymentStatus.toLowerCase()}`}>{purchasePaymentStatus}</strong></div>
          </div>
        </section>
        </div>
        <footer className="operation-modal-actions"><div className="purchase-submit-summary"><span>Step 2 of 2 · {purchaseDevices.length} item{purchaseDevices.length === 1 ? '' : 's'}</span><strong>{purchaseCurrency === 'KHR' ? `${purchaseTotal.toLocaleString()} ៛` : `$${purchaseTotal.toFixed(2)}`}</strong></div><button type="button" className="ghost-button" onClick={() => { setError(''); setPurchaseAttempted(false); setPurchaseStep(1) }}>Back</button><button className="primary-button" disabled={busy} aria-disabled={!purchaseItemsValid || purchasePaid > purchaseTotal}>{busy ? 'Saving purchase...' : purchaseItemsValid ? 'Complete purchase' : 'Complete required fields'}</button></footer>
        </>}
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
              <div><span>Product</span><p><small>{scannedItem.category === 'PHONE' ? 'IMEI' : 'Category'}</small><strong>{scannedItem.category === 'PHONE' ? scannedItem.imei1 || 'Not recorded' : scannedItem.category.replaceAll('_', ' ')}</strong></p><p><small>Condition</small><strong>{scannedItem.condition?.replaceAll('_', ' ') || 'Not recorded'}</strong></p></div>
              <div className="price-group"><span>Shop price</span><strong>{scannedItem.sellPrice > 0 ? `$${scannedItem.sellPrice.toFixed(2)}` : 'Not set'}</strong><small>{scannedItem.sellPrice > 0 ? 'Current selling price' : 'Set a price in Stock Information first'}</small></div>
            </div>
            <footer className="scanner-result-actions"><button type="button" className="secondary-button" onClick={() => { setScannedItem(null); setScanCode(''); setError('') }}><ScanLine size={17} /> Scan another</button><div><button type="button" className="ghost-button" onClick={close}>Close</button><button type="button" className="primary-button" onClick={sellScannedProduct} disabled={scannedItem.status !== 'IN_STOCK' || scannedItem.quantity < 1 || scannedItem.sellPrice <= 0}><ShoppingCart size={17} /> Sell product</button></div></footer>
          </article>
        </>}
      </div>}

      {kind === 'label' && labelItems.length > 0 && <div className="label-prompt">
        <div className="label-success"><span><Printer size={21} /></span><div><h3>Print barcode labels now?</h3><p>{labelItems.length} inventory item{labelItems.length === 1 ? ' was' : 's were'} added. You can also print later from Stock Information.</p></div></div>
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
