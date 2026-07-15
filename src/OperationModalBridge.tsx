import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  HandCoins,
  Package,
  ShoppingCart,
  Smartphone,
  Wrench,
  X,
} from 'lucide-react'
import { api } from './api'

type ModalKind = 'stock' | 'purchase' | 'sale' | 'pawn'
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
  imei1?: string
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
      <section className="operation-modal" role="dialog" aria-modal="true" aria-label={meta.title}>
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

export default function OperationModalBridge() {
  const [kind, setKind] = useState<ModalKind | null>(null)
  const [category, setCategory] = useState<StockCategory>('PHONE')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [estimatedValue, setEstimatedValue] = useState(0)
  const [pawnPercentage, setPawnPercentage] = useState(45)

  const maximumPawn = useMemo(
    () => Math.max(0, estimatedValue * pawnPercentage / 100),
    [estimatedValue, pawnPercentage],
  )

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
  }, [kind])

  const close = () => {
    if (busy) return
    setKind(null)
    setError('')
    setCategory('PHONE')
    setEstimatedValue(0)
    setPawnPercentage(45)
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

  async function submitPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const purchaseCategory = String(form.get('category') || 'PHONE') as StockCategory
    const unitPrice = Number(form.get('unitPrice') || 0)
    const payload = {
      type: 'BUY',
      customer: form.get('customer') || undefined,
      items: [{
        category: purchaseCategory,
        name: String(form.get('name') || ''),
        brand: String(form.get('brand') || ''),
        model: String(form.get('model') || ''),
        imei1: purchaseCategory === 'PHONE' ? String(form.get('imei1') || '') : undefined,
        condition: String(form.get('condition') || 'GOOD'),
        quantity: purchaseCategory === 'PHONE' ? 1 : Number(form.get('quantity') || 1),
        unitPrice,
        sellPrice: Number(form.get('sellPrice') || 0),
      }],
      amountPaid: Number(form.get('amountPaid') || unitPrice),
      paymentMethod: String(form.get('paymentMethod') || 'CASH'),
      notes: String(form.get('notes') || ''),
    }
    try {
      await api('/trades', { method: 'POST', body: JSON.stringify(payload) })
      close()
      window.location.reload()
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

      {kind === 'purchase' && <form className="operation-form" onSubmit={submitPurchase}>
        <div className="operation-form-grid">
          <label>Seller<select name="customer" defaultValue=""><option value="">Walk-in / not selected</option>{customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name} — {customer.phone}</option>)}</select></label>
          <label>Category<select name="category" defaultValue="PHONE"><option value="PHONE">Phone</option><option value="ACCESSORY">Accessory</option><option value="SPARE_PART">Spare part</option></select></label>
          <label>Item name<input name="name" required /></label><label>Brand<input name="brand" /></label><label>Model<input name="model" /></label><label>IMEI<input name="imei1" /></label>
          <label>Condition<select name="condition" defaultValue="GOOD"><option value="NEW">New</option><option value="LIKE_NEW">Like new</option><option value="GOOD">Good</option><option value="FAIR">Fair</option><option value="DAMAGED">Damaged</option></select></label>
          <label>Quantity<input name="quantity" type="number" min="1" defaultValue="1" /></label><label>Purchase price<input name="unitPrice" type="number" min="0" step="0.01" required /></label><label>Expected selling price<input name="sellPrice" type="number" min="0" step="0.01" required /></label>
          <label>Amount paid<input name="amountPaid" type="number" min="0" step="0.01" /></label><label>Payment method<select name="paymentMethod"><option value="CASH">Cash</option><option value="BANK">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label>
          <label className="operation-wide">Notes<textarea name="notes" rows={3} /></label>
        </div>
        <footer className="operation-modal-actions"><button type="button" className="ghost-button" onClick={close}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving...' : 'Complete purchase'}</button></footer>
      </form>}

      {kind === 'sale' && <form className="operation-form" onSubmit={submitSale}>
        <div className="operation-form-grid">
          <label>Customer<select name="customer" defaultValue=""><option value="">Walk-in customer</option>{customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name} — {customer.phone}</option>)}</select></label>
          <label className="operation-wide">Inventory item<select name="inventoryItem" required defaultValue=""><option value="" disabled>Select available stock</option>{inventory.map((item) => <option key={item._id} value={item._id}>{item.name}{item.imei1 ? ` — ${item.imei1}` : ''} — Qty ${item.quantity} — ${item.sellPrice.toFixed(2)}</option>)}</select></label>
          <label>Quantity<input name="quantity" type="number" min="1" defaultValue="1" /></label><label>Selling price<input name="unitPrice" type="number" min="0" step="0.01" placeholder="Uses stock price when empty" /></label>
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
