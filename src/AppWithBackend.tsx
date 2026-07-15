import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  BarChart3,
  Boxes,
  Calculator,
  CircleDollarSign,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  ShoppingCart,
  Smartphone,
  Sun,
  TrendingDown,
  UserRound,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { api, getToken, setToken, type SessionUser } from './api'

 type ViewKey = 'dashboard' | 'pawn' | 'trade' | 'inventory' | 'customers' | 'depreciation' | 'reports' | 'settings'

type Customer = {
  _id: string
  name: string
  phone: string
  nationalIdNumber?: string
  address?: string
  createdAt: string
}

type InventoryItem = {
  _id: string
  sku: string
  category: 'PHONE' | 'ACCESSORY' | 'SPARE_PART'
  name: string
  brand?: string
  model?: string
  imei1?: string
  condition: string
  quantity: number
  reorderLevel: number
  buyPrice: number
  sellPrice: number
  status: string
}

type Pawn = {
  _id: string
  pawnNo: string
  customer: Customer
  itemSnapshot: { name: string; brand?: string; model?: string; imei?: string }
  estimatedValue: number
  pawnPercentage: number
  principal: number
  interestRate: number
  dueDate: string
  status: string
  identificationVerified: boolean
}

type Trade = {
  _id: string
  tradeNo: string
  type: 'BUY' | 'SELL'
  customer?: Customer
  items: { name: string; quantity: number; unitPrice: number }[]
  total: number
  amountPaid: number
  balance: number
  paymentMethod: string
  createdAt: string
}

type DashboardData = {
  metrics: {
    salesToday: number
    purchasesToday: number
    activePawnValue: number
    phonesInStock: number
    overdueContracts: number
    lowStock: number
    customerCount: number
  }
  recentPawns: Pawn[]
  recentTrades: Trade[]
  inventoryMix: { _id: string; count: number; value: number }[]
  monthPerformance: { _id: string; total: number }[]
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const dateText = (value: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(value))

const navGroups: { label: string; items: { key: ViewKey; label: string; icon: LucideIcon }[] }[] = [
  { label: 'Overview', items: [{ key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    label: 'Operations',
    items: [
      { key: 'pawn', label: 'Pawn Management', icon: HandCoins },
      { key: 'trade', label: 'Buy & Sell', icon: ShoppingCart },
      { key: 'inventory', label: 'Stock Information', icon: Boxes },
      { key: 'customers', label: 'Customers', icon: Users },
    ],
  },
  {
    label: 'Finance & Control',
    items: [
      { key: 'depreciation', label: 'Depreciation', icon: TrendingDown },
      { key: 'reports', label: 'Reports', icon: BarChart3 },
      { key: 'settings', label: 'Settings', icon: Settings },
    ],
  },
]

function StatusBadge({ status }: { status: string }) {
  const text = status.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
  const slug = status.toLowerCase().replaceAll('_', '-').replaceAll(' ', '-')
  return <span className={`status-badge status-${slug}`}>{text}</span>
}

function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="section-header">
      <div>
        <span className="eyebrow">PhoneFlow workspace</span>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <Package size={32} />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  )
}

function ErrorNotice({ message }: { message: string }) {
  return <div className="error-notice"><AlertTriangle size={16} /> {message}</div>
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: SessionUser) => void }) {
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<{ setupRequired: boolean }>('/auth/status')
      .then((result) => setSetupRequired(result.setupRequired))
      .catch((reason: Error) => setError(reason.message))
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const payload = {
      name: String(form.get('name') || ''),
      email: String(form.get('email') || ''),
      password: String(form.get('password') || ''),
    }

    try {
      const result = await api<{ token: string; user: SessionUser }>(setupRequired ? '/auth/bootstrap' : '/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setToken(result.token)
      onAuthenticated(result.user)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-visual">
        <div className="auth-logo"><Smartphone size={28} /></div>
        <span className="eyebrow">Internal phone shop system</span>
        <h1>One workspace for pawn, stock, buying and selling.</h1>
        <p>Track every phone by IMEI, protect National ID records, calculate safe pawn values and keep an audit trail of staff actions.</p>
        <div className="auth-features">
          <span><HandCoins size={18} /> Pawn contracts</span>
          <span><Boxes size={18} /> Live inventory</span>
          <span><BadgeCheck size={18} /> Role-based access</span>
        </div>
      </section>

      <section className="auth-card surface-card">
        <span className="eyebrow">{setupRequired ? 'First-time setup' : 'Welcome back'}</span>
        <h2>{setupRequired ? 'Create the owner account' : 'Sign in to PhoneFlow'}</h2>
        <p>{setupRequired ? 'This account will have full control of the shop.' : 'Use your staff account to continue.'}</p>
        {error && <ErrorNotice message={error} />}
        {setupRequired === null ? (
          <div className="loading-line">Checking server connection...</div>
        ) : (
          <form className="form-stack" onSubmit={submit}>
            {setupRequired && <label>Owner name<input name="name" required placeholder="Shop owner" /></label>}
            <label>Email address<input name="email" type="email" required placeholder="owner@shop.com" /></label>
            <label>Password<input name="password" type="password" minLength={8} required placeholder="At least 8 characters" /></label>
            <button className="primary-button full-width" disabled={busy}>{busy ? 'Please wait...' : setupRequired ? 'Create shop account' : 'Sign in'}</button>
          </form>
        )}
      </section>
    </main>
  )
}

function DashboardView({ goTo }: { goTo: (view: ViewKey) => void }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')

  const load = () => {
    setError('')
    api<DashboardData>('/dashboard').then(setData).catch((reason: Error) => setError(reason.message))
  }
  useEffect(load, [])

  const metrics = data ? [
    { label: "Today's sales", value: money.format(data.metrics.salesToday), icon: CircleDollarSign, tone: 'violet' },
    { label: 'Active pawn value', value: money.format(data.metrics.activePawnValue), icon: HandCoins, tone: 'blue' },
    { label: 'Phones in stock', value: String(data.metrics.phonesInStock), icon: Smartphone, tone: 'orange' },
    { label: 'Overdue contracts', value: String(data.metrics.overdueContracts), icon: AlertTriangle, tone: 'rose' },
  ] : []

  return (
    <>
      <SectionHeader
        title="Shop dashboard"
        description="Live information from MongoDB, not demo values."
        action={<button className="primary-button" onClick={() => goTo('trade')}><Plus size={17} /> New transaction</button>}
      />
      {error && <ErrorNotice message={error} />}
      {!data ? <div className="loading-card surface-card">Loading dashboard...</div> : (
        <>
          <section className="metrics-grid">
            {metrics.map(({ label, value, icon: Icon, tone }) => (
              <article className="metric-card surface-card" key={label}>
                <div className={`metric-icon tone-${tone}`}><Icon size={21} /></div>
                <div className="metric-copy"><p>{label}</p><h3>{value}</h3></div>
              </article>
            ))}
          </section>

          <section className="dashboard-grid">
            <article className="surface-card overview-panel">
              <div className="card-heading"><div><span className="eyebrow">Today</span><h3>Cash movement</h3></div><button className="icon-button" onClick={load}><RefreshCcw size={16} /></button></div>
              <div className="cash-summary">
                <div><span>Sales income</span><strong>{money.format(data.metrics.salesToday)}</strong></div>
                <div><span>Purchases paid</span><strong>{money.format(data.metrics.purchasesToday)}</strong></div>
                <div><span>Customers</span><strong>{data.metrics.customerCount}</strong></div>
                <div><span>Low stock</span><strong>{data.metrics.lowStock}</strong></div>
              </div>
            </article>
            <article className="surface-card overview-panel">
              <div className="card-heading"><div><span className="eyebrow">Quick actions</span><h3>Start work</h3></div></div>
              <div className="quick-action-grid">
                <button onClick={() => goTo('pawn')}><HandCoins /> New pawn</button>
                <button onClick={() => goTo('trade')}><ShoppingCart /> Buy or sell</button>
                <button onClick={() => goTo('inventory')}><Boxes /> Add stock</button>
                <button onClick={() => goTo('customers')}><Users /> Customer</button>
              </div>
            </article>
          </section>

          <section className="surface-card data-card">
            <div className="card-heading"><div><span className="eyebrow">Recent contracts</span><h3>Pawn activity</h3></div><button className="text-button" onClick={() => goTo('pawn')}>View all</button></div>
            {data.recentPawns.length === 0 ? <EmptyState title="No pawn contracts yet" text="Create the first contract from Pawn Management." /> : (
              <div className="table-wrap"><table><thead><tr><th>Contract</th><th>Customer</th><th>Item</th><th>Principal</th><th>Due date</th><th>Status</th></tr></thead><tbody>
                {data.recentPawns.map((pawn) => <tr key={pawn._id}><td><strong>{pawn.pawnNo}</strong></td><td>{pawn.customer?.name}</td><td>{pawn.itemSnapshot.name}</td><td>{money.format(pawn.principal)}</td><td>{dateText(pawn.dueDate)}</td><td><StatusBadge status={pawn.status} /></td></tr>)}
              </tbody></table></div>
            )}
          </section>
        </>
      )}
    </>
  )
}

function CustomersView() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')

  const load = () => api<{ customers: Customer[] }>('/customers').then((result) => setCustomers(result.customers)).catch((reason: Error) => setError(reason.message))
  useEffect(load, [])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      await api('/customers', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) })
      event.currentTarget.reset()
      setShowForm(false)
      load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create customer') }
  }

  return (
    <>
      <SectionHeader title="Customers" description="Customer identity, contact details and National ID records." action={<button className="primary-button" onClick={() => setShowForm(!showForm)}><Plus size={17} /> Add customer</button>} />
      {error && <ErrorNotice message={error} />}
      {showForm && <article className="surface-card form-card"><form className="form-grid" onSubmit={create}>
        <label>Full name<input name="name" required /></label><label>Phone number<input name="phone" required /></label>
        <label>National ID number<input name="nationalIdNumber" /></label><label>Address<input name="address" /></label>
        <label className="wide-field">Notes<textarea name="notes" rows={3} /></label>
        <div className="form-actions wide-field"><button type="button" className="ghost-button" onClick={() => setShowForm(false)}>Cancel</button><button className="primary-button">Save customer</button></div>
      </form></article>}
      <article className="surface-card data-card">
        {customers.length === 0 ? <EmptyState title="No customers yet" text="Add a customer before creating a pawn contract." /> : <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Phone</th><th>National ID</th><th>Address</th><th>Created</th></tr></thead><tbody>
          {customers.map((customer) => <tr key={customer._id}><td><strong>{customer.name}</strong></td><td>{customer.phone}</td><td>{customer.nationalIdNumber || 'Not recorded'}</td><td>{customer.address || '—'}</td><td>{dateText(customer.createdAt)}</td></tr>)}
        </tbody></table></div>}
      </article>
    </>
  )
}

function InventoryView() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const load = () => api<{ items: InventoryItem[] }>('/inventory').then((result) => setItems(result.items)).catch((reason: Error) => setError(reason.message))
  useEffect(load, [])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload = Object.fromEntries(form)
    Object.assign(payload, {
      quantity: Number(form.get('quantity') || 1), reorderLevel: Number(form.get('reorderLevel') || 2),
      buyPrice: Number(form.get('buyPrice') || 0), sellPrice: Number(form.get('sellPrice') || 0),
    })
    try {
      await api('/inventory', { method: 'POST', body: JSON.stringify(payload) })
      event.currentTarget.reset(); setShowForm(false); load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to add stock') }
  }

  return (
    <>
      <SectionHeader title="Stock information" description="IMEI-level phones and quantity-based accessories or spare parts." action={<button className="primary-button" onClick={() => setShowForm(!showForm)}><Plus size={17} /> Add stock</button>} />
      {error && <ErrorNotice message={error} />}
      {showForm && <article className="surface-card form-card"><form className="form-grid" onSubmit={create}>
        <label>Category<select name="category"><option value="PHONE">Phone</option><option value="ACCESSORY">Accessory</option><option value="SPARE_PART">Spare part</option></select></label>
        <label>SKU<input name="sku" placeholder="Auto-generated when empty" /></label><label>Item name<input name="name" required /></label>
        <label>Brand<input name="brand" /></label><label>Model<input name="model" /></label><label>IMEI 1<input name="imei1" /></label>
        <label>Condition<select name="condition"><option value="NEW">New</option><option value="LIKE_NEW">Like new</option><option value="GOOD">Good</option><option value="FAIR">Fair</option><option value="DAMAGED">Damaged</option></select></label>
        <label>Quantity<input name="quantity" type="number" min="0" defaultValue="1" /></label><label>Low-stock level<input name="reorderLevel" type="number" min="0" defaultValue="2" /></label>
        <label>Buy price<input name="buyPrice" type="number" min="0" step="0.01" /></label><label>Sell price<input name="sellPrice" type="number" min="0" step="0.01" /></label>
        <div className="form-actions wide-field"><button type="button" className="ghost-button" onClick={() => setShowForm(false)}>Cancel</button><button className="primary-button">Save stock</button></div>
      </form></article>}
      <article className="surface-card data-card">
        {items.length === 0 ? <EmptyState title="Inventory is empty" text="Add phones, accessories or spare parts." /> : <div className="table-wrap"><table><thead><tr><th>SKU</th><th>Item</th><th>Category</th><th>IMEI</th><th>Quantity</th><th>Buy</th><th>Sell</th><th>Status</th></tr></thead><tbody>
          {items.map((item) => <tr key={item._id}><td><strong>{item.sku}</strong></td><td>{item.name}<small className="cell-note">{[item.brand, item.model].filter(Boolean).join(' ')}</small></td><td>{item.category.replace('_', ' ')}</td><td>{item.imei1 || '—'}</td><td className={item.quantity <= item.reorderLevel ? 'warning-text' : ''}>{item.quantity}</td><td>{money.format(item.buyPrice)}</td><td>{money.format(item.sellPrice)}</td><td><StatusBadge status={item.status} /></td></tr>)}
        </tbody></table></div>}
      </article>
    </>
  )
}

function PawnView({ user }: { user: SessionUser }) {
  const [pawns, setPawns] = useState<Pawn[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [percentage, setPercentage] = useState(45)
  const [estimatedValue, setEstimatedValue] = useState(0)

  const load = () => Promise.all([api<{ pawns: Pawn[] }>('/pawns'), api<{ customers: Customer[] }>('/customers')])
    .then(([pawnResult, customerResult]) => { setPawns(pawnResult.pawns); setCustomers(customerResult.customers) })
    .catch((reason: Error) => setError(reason.message))
  useEffect(load, [])

  const maxPawn = estimatedValue * percentage / 100

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload = {
      customer: form.get('customer'),
      itemSnapshot: {
        name: form.get('itemName'), brand: form.get('brand'), model: form.get('model'), imei: form.get('imei'),
        condition: form.get('condition'), color: form.get('color'), storage: form.get('storage'),
      },
      estimatedValue: Number(form.get('estimatedValue')),
      pawnPercentage: Number(form.get('pawnPercentage')),
      principal: Number(form.get('principal')),
      interestRate: Number(form.get('interestRate')),
      dueDate: form.get('dueDate'),
      identificationVerified: form.get('identificationVerified') === 'on',
      notes: form.get('notes'),
    }
    try {
      await api('/pawns', { method: 'POST', body: JSON.stringify(payload) })
      event.currentTarget.reset(); setShowForm(false); load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create pawn') }
  }

  async function action(id: string, name: 'redeem' | 'forfeit') {
    if (!window.confirm(`Confirm ${name} for this pawn contract?`)) return
    try { await api(`/pawns/${id}/${name}`, { method: 'POST', body: JSON.stringify({}) }); load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Action failed') }
  }

  return (
    <>
      <SectionHeader title="Pawn management" description="National ID checks, valuation limits, due dates, redemption and forfeiture." action={<button className="primary-button" onClick={() => setShowForm(!showForm)}><Plus size={17} /> New pawn</button>} />
      {error && <ErrorNotice message={error} />}
      {showForm && <article className="surface-card form-card"><form className="form-grid" onSubmit={create}>
        <label>Customer<select name="customer" required defaultValue=""><option value="" disabled>Select customer</option>{customers.map((customer) => <option value={customer._id} key={customer._id}>{customer.name} — {customer.phone}</option>)}</select></label>
        <label>Phone name<input name="itemName" required placeholder="iPhone 15 Pro Max" /></label><label>Brand<input name="brand" /></label><label>Model<input name="model" /></label>
        <label>IMEI<input name="imei" /></label><label>Storage<input name="storage" /></label><label>Color<input name="color" /></label>
        <label>Condition<select name="condition"><option value="LIKE_NEW">Like new</option><option value="GOOD">Good</option><option value="FAIR">Fair</option><option value="DAMAGED">Damaged</option></select></label>
        <label>Estimated resale value<input name="estimatedValue" type="number" min="0" step="0.01" required onChange={(event) => setEstimatedValue(Number(event.target.value))} /></label>
        <label>Pawn percentage<input name="pawnPercentage" type="number" min="40" max="50" value={percentage} onChange={(event) => setPercentage(Number(event.target.value))} /></label>
        <label>Principal <small>Maximum {money.format(maxPawn)}</small><input name="principal" type="number" min="0" max={maxPawn || undefined} step="0.01" required /></label>
        <label>Interest rate %<input name="interestRate" type="number" min="0" step="0.01" defaultValue="5" /></label><label>Due date<input name="dueDate" type="date" required /></label>
        <label className="checkbox-field"><input name="identificationVerified" type="checkbox" /> National ID verified</label>
        <label className="wide-field">Notes<textarea name="notes" rows={3} /></label>
        <div className="form-actions wide-field"><button type="button" className="ghost-button" onClick={() => setShowForm(false)}>Cancel</button><button className="primary-button">Create pawn contract</button></div>
      </form></article>}
      <article className="surface-card data-card">
        {pawns.length === 0 ? <EmptyState title="No pawn contracts" text="Add a customer, then create the first pawn." /> : <div className="table-wrap"><table><thead><tr><th>Contract</th><th>Customer</th><th>Phone</th><th>ID</th><th>Value / Principal</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {pawns.map((pawn) => <tr key={pawn._id}><td><strong>{pawn.pawnNo}</strong></td><td>{pawn.customer?.name}<small className="cell-note">{pawn.customer?.phone}</small></td><td>{pawn.itemSnapshot.name}<small className="cell-note">{pawn.itemSnapshot.imei || 'No IMEI'}</small></td><td>{pawn.identificationVerified ? <span className="verified"><BadgeCheck size={15} /> Verified</span> : <span className="warning-text">Missing</span>}</td><td>{money.format(pawn.estimatedValue)}<small className="cell-note">Loan {money.format(pawn.principal)} ({pawn.pawnPercentage}%)</small></td><td>{dateText(pawn.dueDate)}</td><td><StatusBadge status={pawn.status} /></td><td><div className="row-actions">{['ACTIVE', 'DUE_SOON', 'OVERDUE', 'RENEWED'].includes(pawn.status) && <button onClick={() => action(pawn._id, 'redeem')}>Redeem</button>}{['OWNER', 'MANAGER'].includes(user.role) && pawn.status === 'OVERDUE' && <button className="danger-link" onClick={() => action(pawn._id, 'forfeit')}>Forfeit</button>}</div></td></tr>)}
        </tbody></table></div>}
      </article>
    </>
  )
}

function TradeView() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [showForm, setShowForm] = useState(false)
  const [tradeType, setTradeType] = useState<'BUY' | 'SELL'>('SELL')
  const [error, setError] = useState('')
  const load = () => Promise.all([api<{ trades: Trade[] }>('/trades'), api<{ customers: Customer[] }>('/customers'), api<{ items: InventoryItem[] }>('/inventory?status=IN_STOCK')])
    .then(([a, b, c]) => { setTrades(a.trades); setCustomers(b.customers); setInventory(c.items) }).catch((reason: Error) => setError(reason.message))
  useEffect(load, [])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const selected = inventory.find((item) => item._id === form.get('inventoryItem'))
    const line = tradeType === 'SELL'
      ? { inventoryItem: form.get('inventoryItem'), name: selected?.name, quantity: Number(form.get('quantity') || 1), unitPrice: Number(form.get('unitPrice') || selected?.sellPrice || 0) }
      : { name: form.get('itemName'), category: form.get('category'), brand: form.get('brand'), model: form.get('model'), imei1: form.get('imei1'), condition: form.get('condition'), quantity: Number(form.get('quantity') || 1), unitPrice: Number(form.get('unitPrice') || 0), sellPrice: Number(form.get('sellPrice') || 0) }
    try {
      await api('/trades', { method: 'POST', body: JSON.stringify({ type: tradeType, customer: form.get('customer') || undefined, items: [line], discount: Number(form.get('discount') || 0), amountPaid: Number(form.get('amountPaid') || 0), paymentMethod: form.get('paymentMethod') }) })
      event.currentTarget.reset(); setShowForm(false); load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save transaction') }
  }

  return (
    <>
      <SectionHeader title="Buy & Sell" description="Purchases add stock automatically; sales deduct stock and prevent duplicate phone sales." action={<button className="primary-button" onClick={() => setShowForm(!showForm)}><Plus size={17} /> New transaction</button>} />
      {error && <ErrorNotice message={error} />}
      {showForm && <article className="surface-card form-card">
        <div className="segmented"><button className={tradeType === 'SELL' ? 'active' : ''} onClick={() => setTradeType('SELL')}>Sell to customer</button><button className={tradeType === 'BUY' ? 'active' : ''} onClick={() => setTradeType('BUY')}>Buy from customer</button></div>
        <form className="form-grid" onSubmit={create}>
          <label>Customer<select name="customer" defaultValue=""><option value="">Walk-in / not selected</option>{customers.map((customer) => <option value={customer._id} key={customer._id}>{customer.name}</option>)}</select></label>
          {tradeType === 'SELL' ? <label className="wide-field">Inventory item<select name="inventoryItem" required defaultValue=""><option value="" disabled>Select available stock</option>{inventory.map((item) => <option key={item._id} value={item._id}>{item.name} — Qty {item.quantity} — {money.format(item.sellPrice)}</option>)}</select></label> : <>
            <label>Item name<input name="itemName" required /></label><label>Category<select name="category"><option value="PHONE">Phone</option><option value="ACCESSORY">Accessory</option><option value="SPARE_PART">Spare part</option></select></label>
            <label>Brand<input name="brand" /></label><label>Model<input name="model" /></label><label>IMEI<input name="imei1" /></label><label>Condition<select name="condition"><option value="NEW">New</option><option value="LIKE_NEW">Like new</option><option value="GOOD">Good</option><option value="FAIR">Fair</option><option value="DAMAGED">Damaged</option></select></label><label>Future sell price<input name="sellPrice" type="number" min="0" step="0.01" /></label>
          </>}
          <label>Quantity<input name="quantity" type="number" min="1" defaultValue="1" /></label><label>{tradeType === 'SELL' ? 'Selling price' : 'Buying price'}<input name="unitPrice" type="number" min="0" step="0.01" required /></label>
          <label>Discount<input name="discount" type="number" min="0" step="0.01" defaultValue="0" /></label><label>Amount paid<input name="amountPaid" type="number" min="0" step="0.01" required /></label>
          <label>Payment method<select name="paymentMethod"><option value="CASH">Cash</option><option value="BANK">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label>
          <div className="form-actions wide-field"><button type="button" className="ghost-button" onClick={() => setShowForm(false)}>Cancel</button><button className="primary-button">Complete transaction</button></div>
        </form>
      </article>}
      <article className="surface-card data-card">{trades.length === 0 ? <EmptyState title="No transactions" text="Create a purchase or sale to begin." /> : <div className="table-wrap"><table><thead><tr><th>Reference</th><th>Type</th><th>Customer</th><th>Items</th><th>Total</th><th>Paid</th><th>Payment</th><th>Date</th></tr></thead><tbody>
        {trades.map((trade) => <tr key={trade._id}><td><strong>{trade.tradeNo}</strong></td><td><StatusBadge status={trade.type} /></td><td>{trade.customer?.name || 'Walk-in'}</td><td>{trade.items.map((line) => `${line.name} ×${line.quantity}`).join(', ')}</td><td>{money.format(trade.total)}</td><td>{money.format(trade.amountPaid)}</td><td>{trade.paymentMethod}</td><td>{dateText(trade.createdAt)}</td></tr>)}
      </tbody></table></div>}</article>
    </>
  )
}

function DepreciationView() {
  const [result, setResult] = useState<{ estimatedValue: number; maximumPawn: number; ageDeduction: number; conditionDeduction: number; accessoryDeduction: number } | null>(null)
  const [error, setError] = useState('')
  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    const form = new FormData(event.currentTarget)
    const payload = Object.fromEntries(form)
    try { setResult(await api('/valuation/calculate', { method: 'POST', body: JSON.stringify(payload) })) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Calculation failed') }
  }
  return <><SectionHeader title="Depreciation calculator" description="Calculate estimated resale value and a controlled 40–50% maximum pawn amount." />{error && <ErrorNotice message={error} />}<section className="calculator-layout"><article className="surface-card form-card"><form className="form-stack" onSubmit={calculate}>
    <label>Current market price<input name="marketPrice" type="number" min="0" step="0.01" required /></label><label>Phone age in months<input name="ageMonths" type="number" min="0" defaultValue="0" /></label>
    <label>Condition<select name="condition"><option value="NEW">New</option><option value="LIKE_NEW">Like new</option><option value="GOOD">Good</option><option value="FAIR">Fair</option><option value="DAMAGED">Damaged</option></select></label>
    <label>Estimated repair cost<input name="repairCost" type="number" min="0" step="0.01" defaultValue="0" /></label><label>Missing accessories deduction %<input name="missingAccessoriesPercent" type="number" min="0" max="20" defaultValue="0" /></label>
    <label>Pawn percentage<input name="pawnPercentage" type="number" min="40" max="50" defaultValue="45" /></label><button className="primary-button"><Calculator size={17} /> Calculate value</button>
  </form></article><article className="surface-card valuation-result-card">{!result ? <EmptyState title="Ready to calculate" text="Enter the phone details to see its safe pawn limit." /> : <><span className="eyebrow">Valuation result</span><h3>{money.format(result.estimatedValue)}</h3><p>Estimated resale value after deductions</p><div className="result-lines"><span>Age deduction <strong>{money.format(result.ageDeduction)}</strong></span><span>Condition deduction <strong>{money.format(result.conditionDeduction)}</strong></span><span>Accessories deduction <strong>{money.format(result.accessoryDeduction)}</strong></span></div><div className="max-pawn"><span>Maximum pawn amount</span><strong>{money.format(result.maximumPawn)}</strong></div></>}</article></section></>
}

function ReportsView() {
  return <><SectionHeader title="Reports" description="The API already stores the required source data for sales, pawn and stock reporting." /><section className="placeholder-grid"><article className="surface-card module-card"><BarChart3 /><h3>Sales report</h3><p>Daily and monthly sales, buying cost, gross margin and payment method.</p></article><article className="surface-card module-card"><HandCoins /><h3>Pawn report</h3><p>Active value, interest collected, due contracts, overdue and forfeited items.</p></article><article className="surface-card module-card"><Boxes /><h3>Stock report</h3><p>Stock valuation, low stock, IMEI history, accessories and spare parts.</p></article></section></>
}

function SettingsView({ user }: { user: SessionUser }) {
  return <><SectionHeader title="Settings" description="Shop configuration and user access." /><section className="placeholder-grid"><article className="surface-card module-card"><UserRound /><h3>{user.name}</h3><p>{user.email}<br />Role: {user.role}</p></article><article className="surface-card module-card"><BadgeCheck /><h3>Permissions enabled</h3><p>Owner, manager, cashier and stock roles are enforced by the API.</p></article><article className="surface-card module-card"><Settings /><h3>Next settings</h3><p>Shop name, receipt header, interest rules, currency and document storage.</p></article></section></>
}

function Workspace({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const [view, setView] = useState<ViewKey>('dashboard')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [mobileOpen, setMobileOpen] = useState(false)
  const currentTitle = useMemo(() => navGroups.flatMap((group) => group.items).find((item) => item.key === view)?.label || 'Dashboard', [view])
  const navigate = (next: ViewKey) => { setView(next); setMobileOpen(false) }

  return <div className="app" data-theme={theme}><div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Smartphone size={22} /></div><div><strong>PhoneFlow</strong><small>Pawn & stock system</small></div><button className="mobile-close" onClick={() => setMobileOpen(false)}><X /></button></div>
      <nav className="sidebar-nav">{navGroups.map((group) => <div className="nav-group" key={group.label}><span className="nav-group-label">{group.label}</span>{group.items.map(({ key, label, icon: Icon }) => <button key={key} className={view === key ? 'active' : ''} onClick={() => navigate(key)}><Icon size={18} /><span>{label}</span></button>)}</div>)}</nav>
      <div className="sidebar-footer"><div className="user-card"><div className="avatar large">{user.name.slice(0, 2).toUpperCase()}</div><p><strong>{user.name}</strong><small>{user.role}</small></p><button className="icon-button" onClick={onLogout} title="Log out"><LogOut size={16} /></button></div></div>
    </aside>
    {mobileOpen && <button className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close menu" />}
    <div className="workspace"><header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={19} /></button><div className="global-search"><Search size={17} /><input placeholder={`Search in ${currentTitle}...`} /><kbd>⌘ K</kbd></div></div><div className="topbar-actions"><button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button><div className="topbar-user"><div className="avatar">{user.name.slice(0, 2).toUpperCase()}</div><p><strong>{user.name}</strong><small>{user.role}</small></p></div></div></header>
      <main className="main-content">{view === 'dashboard' && <DashboardView goTo={navigate} />}{view === 'pawn' && <PawnView user={user} />}{view === 'trade' && <TradeView />}{view === 'inventory' && <InventoryView />}{view === 'customers' && <CustomersView />}{view === 'depreciation' && <DepreciationView />}{view === 'reports' && <ReportsView />}{view === 'settings' && <SettingsView user={user} />}</main>
    </div>
  </div></div>
}

export default function AppWithBackend() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!getToken()) { setChecking(false); return }
    api<{ user: SessionUser }>('/auth/me')
      .then((result) => setUser(result.user))
      .catch(() => setToken(null))
      .finally(() => setChecking(false))
  }, [])

  if (checking) return <div className="startup-screen"><Smartphone size={35} /><strong>PhoneFlow</strong><span>Connecting to the shop...</span></div>
  if (!user) return <AuthScreen onAuthenticated={setUser} />
  return <Workspace user={user} onLogout={() => { setToken(null); setUser(null) }} />
}
