import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  BarChart3,
  Bell,
  Boxes,
  Calculator,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  FileText,
  HandCoins,
  LayoutDashboard,
  Menu,
  Moon,
  MoreHorizontal,
  Package,
  Plus,
  RefreshCcw,
  ScanLine,
  Search,
  Settings,
  ShoppingCart,
  Smartphone,
  Sun,
  TrendingDown,
  UserRound,
  Users,
  WalletCards,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { api, type SessionUser } from './api'

type NavKey =
  | 'dashboard'
  | 'pawn'
  | 'trade'
  | 'inventory'
  | 'customers'
  | 'depreciation'
  | 'reports'
  | 'settings'

type NavItem = {
  key: NavKey
  label: string
  icon: LucideIcon
  badge?: string
}

type Customer = {
  _id: string
  name: string
  phone: string
  nationalIdNumber?: string
  address?: string
  notes?: string
  createdAt?: string
}

type InventoryItem = {
  _id: string
  sku: string
  category: 'PHONE' | 'ACCESSORY' | 'SPARE_PART'
  name: string
  brand?: string
  model?: string
  imei1?: string
  imei2?: string
  serialNumber?: string
  condition?: string
  storage?: string
  color?: string
  batteryHealth?: number
  source?: string
  notes?: string
  createdAt?: string
  quantity: number
  reorderLevel: number
  buyPrice: number
  sellPrice: number
  minimumSellPrice?: number
  status: string
}

type Pawn = {
  _id: string
  pawnNo: string
  customer?: Customer
  itemSnapshot: { name: string; brand?: string; model?: string; imei?: string; condition?: string; color?: string; storage?: string }
  estimatedValue: number
  pawnPercentage: number
  principal: number
  interestRate: number
  dueDate: string
  status: string
  identificationVerified: boolean
  notes?: string
  createdAt: string
}

type Trade = {
  _id: string
  tradeNo: string
  type: 'BUY' | 'SELL'
  customer?: Customer
  items: { name: string; quantity: number; unitPrice: number; costPrice?: number }[]
  subtotal: number
  discount: number
  total: number
  amountPaid: number
  balance: number
  paymentMethod: string
  status: string
  notes?: string
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
  monthlyPerformance: { _id: { month: number; type: 'BUY' | 'SELL' }; total: number }[]
}

type ActivityLog = {
  _id: string
  action: string
  entity: string
  entityId?: string
  createdAt: string
  user?: { name: string; email: string; role: string }
}

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [{ key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Operations',
    items: [
      { key: 'pawn', label: 'Pawn Management', icon: HandCoins, badge: '12' },
      { key: 'trade', label: 'Buy & Sell', icon: ShoppingCart },
      { key: 'inventory', label: 'Stock Information', icon: Boxes, badge: 'Low 7' },
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

const demoMetrics = [
  {
    label: "Today's sales",
    value: '$8,420',
    change: '+12.5%',
    trend: 'up' as const,
    icon: CircleDollarSign,
    tone: 'violet',
  },
  {
    label: 'Active pawn value',
    value: '$32,680',
    change: '+4.8%',
    trend: 'up' as const,
    icon: HandCoins,
    tone: 'blue',
  },
  {
    label: 'Phones in stock',
    value: '184',
    change: '7 low stock',
    trend: 'down' as const,
    icon: Smartphone,
    tone: 'orange',
  },
  {
    label: 'Overdue contracts',
    value: '12',
    change: '3 due today',
    trend: 'down' as const,
    icon: AlertTriangle,
    tone: 'rose',
  },
]

const pawnRows = [
  {
    id: 'PW-2026-0188',
    customer: 'Sokha Chan',
    phone: 'iPhone 15 Pro Max',
    value: '$720',
    loan: '$350',
    due: '18 Jul 2026',
    status: 'Due soon',
    idVerified: true,
  },
  {
    id: 'PW-2026-0187',
    customer: 'Dara Vann',
    phone: 'Samsung S24 Ultra',
    value: '$640',
    loan: '$300',
    due: '21 Jul 2026',
    status: 'Active',
    idVerified: true,
  },
  {
    id: 'PW-2026-0185',
    customer: 'Maly Touch',
    phone: 'iPhone 13',
    value: '$320',
    loan: '$145',
    due: '12 Jul 2026',
    status: 'Overdue',
    idVerified: true,
  },
  {
    id: 'PW-2026-0182',
    customer: 'Vicheka Lim',
    phone: 'Google Pixel 8 Pro',
    value: '$410',
    loan: '$190',
    due: '28 Jul 2026',
    status: 'Active',
    idVerified: false,
  },
]

const inventoryRows = [
  {
    sku: 'PH-APL-15PM-256-BLK',
    item: 'iPhone 15 Pro Max 256GB',
    type: 'Second-hand phone',
    stock: 4,
    buy: '$650',
    sell: '$789',
    status: 'In stock',
  },
  {
    sku: 'PH-SAM-S24U-512-GRY',
    item: 'Samsung S24 Ultra 512GB',
    type: 'New phone',
    stock: 7,
    buy: '$820',
    sell: '$949',
    status: 'In stock',
  },
  {
    sku: 'AC-ANK-ADP-20W',
    item: 'Anker 20W USB-C Adapter',
    type: 'Accessory',
    stock: 3,
    buy: '$9',
    sell: '$16',
    status: 'Low stock',
  },
  {
    sku: 'SP-APL-IP13-OLED',
    item: 'iPhone 13 OLED LCD',
    type: 'Spare part',
    stock: 2,
    buy: '$78',
    sell: '$110',
    status: 'Low stock',
  },
]

const transactions = [
  { id: 'SL-00982', title: 'Sold iPhone 14 Pro', person: 'Nita Heng', amount: '+$620', type: 'Sale' },
  { id: 'BY-00514', title: 'Bought Samsung Z Flip 5', person: 'Sothea Keo', amount: '-$330', type: 'Purchase' },
  { id: 'SL-00981', title: 'Sold 2 accessories', person: 'Walk-in customer', amount: '+$41', type: 'Sale' },
  { id: 'BY-00513', title: 'Bought iPhone 12', person: 'Rithy Meas', amount: '-$185', type: 'Purchase' },
]

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const dateText = (value: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(value))
const titleStatus = (status: string) => status.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
const comingNext = (label: string) => window.alert(`${label} form is next. The tables and dashboard are connected to MongoDB now.`)

function StatusBadge({ status }: { status: string }) {
  const label = titleStatus(status)
  const slug = label.toLowerCase().replaceAll(' ', '-')
  return <span className={`status-badge status-${slug}`}>{label}</span>
}

function MetricCard({
  label,
  value,
  change,
  trend,
  icon: Icon,
  tone,
}: (typeof demoMetrics)[number]) {
  return (
    <article className="metric-card surface-card">
      <div className={`metric-icon tone-${tone}`}>
        <Icon size={21} />
      </div>
      <div className="metric-copy">
        <p>{label}</p>
        <h3>{value}</h3>
      </div>
      <span className={`metric-change ${trend}`}>
        {trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
        {change}
      </span>
    </article>
  )
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="section-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}

function DashboardView({ goTo, user }: { goTo: (key: NavKey) => void; user: SessionUser }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<DashboardData>('/dashboard').then(setData).catch((reason: Error) => setError(reason.message))
  }, [])

  const metrics = data ? [
    { label: "Today's sales", value: money.format(data.metrics.salesToday), change: `${money.format(data.metrics.purchasesToday)} purchases`, trend: 'up' as const, icon: CircleDollarSign, tone: 'violet' },
    { label: 'Active pawn value', value: money.format(data.metrics.activePawnValue), change: `${data.metrics.overdueContracts} overdue`, trend: data.metrics.overdueContracts > 0 ? 'down' as const : 'up' as const, icon: HandCoins, tone: 'blue' },
    { label: 'Phones in stock', value: String(data.metrics.phonesInStock), change: `${data.metrics.lowStock} low stock`, trend: data.metrics.lowStock > 0 ? 'down' as const : 'up' as const, icon: Smartphone, tone: 'orange' },
    { label: 'Customers', value: String(data.metrics.customerCount), change: 'live database', trend: 'up' as const, icon: Users, tone: 'rose' },
  ] : demoMetrics
  const monthLabels = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
  const monthlyNet = monthLabels.map((_, index) => {
    const month = index + 1
    const sales = data?.monthlyPerformance.find((item) => item._id.month === month && item._id.type === 'SELL')?.total || 0
    const purchases = data?.monthlyPerformance.find((item) => item._id.month === month && item._id.type === 'BUY')?.total || 0
    return Math.max(0, sales - purchases)
  })
  const maxMonthlyNet = Math.max(...monthlyNet, 1)
  const inventoryMix = data?.inventoryMix.length ? data.inventoryMix : [{ _id: 'PHONE', count: 0, value: 0 }, { _id: 'ACCESSORY', count: 0, value: 0 }, { _id: 'SPARE_PART', count: 0, value: 0 }]
  const totalInventoryValue = inventoryMix.reduce((sum, item) => sum + item.value, 0)
  const phoneValue = inventoryMix.find((item) => item._id === 'PHONE')?.value || 0
  const accessoryValue = inventoryMix.find((item) => item._id === 'ACCESSORY')?.value || 0
  const phoneStop = totalInventoryValue ? (phoneValue / totalInventoryValue) * 100 : 0
  const accessoryStop = totalInventoryValue ? phoneStop + (accessoryValue / totalInventoryValue) * 100 : 0
  const donutStyle = {
    background: totalInventoryValue
      ? `conic-gradient(#8b5cf6 0 ${phoneStop}%, #38bdf8 ${phoneStop}% ${accessoryStop}%, #fb923c ${accessoryStop}% 100%)`
      : 'conic-gradient(rgba(139, 92, 246, 0.18) 0 100%)',
  }

  return (
    <>
      <SectionHeader
        eyebrow="Live MongoDB dashboard"
        title={`Good afternoon, ${user.name.split(' ')[0]}`}
        description={error || 'Here is what is happening in the shop today.'}
        action={
          <button className="primary-button" onClick={() => goTo('trade')}>
            <Plus size={17} /> New transaction
          </button>
        }
      />

      <section className="metrics-grid">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="surface-card performance-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Revenue overview</span>
              <h3>Shop performance</h3>
            </div>
            <button className="ghost-button">
              This month <ChevronDown size={15} />
            </button>
          </div>

          <div className="revenue-total">
            <strong>{money.format((data?.metrics.salesToday || 0) - (data?.metrics.purchasesToday || 0))}</strong>
            <span><ArrowUpRight size={15} /> net cash movement today</span>
          </div>

          <div className="chart-shell" aria-label="Monthly revenue bar chart">
            {monthlyNet.map((total, index) => (
              <div className="chart-column" key={index}>
                <span style={{ height: `${Math.max(total > 0 ? (total / maxMonthlyNet) * 100 : 0, total > 0 ? 12 : 3)}%` }} title={money.format(total)} />
                <small>{monthLabels[index]}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="surface-card inventory-mix-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Stock value</span>
              <h3>Inventory mix</h3>
            </div>
            <button className="icon-button" aria-label="More options"><MoreHorizontal size={19} /></button>
          </div>
          <div className="donut-wrap">
            <div className="donut-chart" style={donutStyle}><span>{money.format(totalInventoryValue)}<small>Total value</small></span></div>
          </div>
          <div className="legend-list">
            {inventoryMix.map((item, index) => (
              <div key={item._id}><span className={`legend-dot ${['dot-violet', 'dot-blue', 'dot-orange'][index] || 'dot-violet'}`} /><p>{titleStatus(item._id)}<small>{item.count} units</small></p><strong>{money.format(item.value)}</strong></div>
            ))}
          </div>
        </article>
      </section>

      <section className="dashboard-lower-grid">
        <article className="surface-card table-card">
          <div className="card-heading table-heading">
            <div>
              <span className="eyebrow">Pawn desk</span>
              <h3>Recent contracts</h3>
            </div>
            <button className="text-button" onClick={() => goTo('pawn')}>View all <ArrowUpRight size={15} /></button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Customer & item</th>
                  <th>Loan</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(data?.recentPawns || []).map((row) => (
                  <tr key={row._id}>
                    <td><strong className="mono">{row.pawnNo}</strong></td>
                    <td>
                      <div className="customer-cell">
                        <span className="avatar">{(row.customer?.name || 'NA').slice(0, 2).toUpperCase()}</span>
                        <p>{row.customer?.name || 'Unknown'}<small>{row.itemSnapshot.name}</small></p>
                      </div>
                    </td>
                    <td><strong>{money.format(row.principal)}</strong><small className="table-subtext">of {money.format(row.estimatedValue)}</small></td>
                    <td>{dateText(row.dueDate)}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td><button className="icon-button"><MoreHorizontal size={18} /></button></td>
                  </tr>
                ))}
                {data?.recentPawns.length === 0 && <tr><td colSpan={6}>No pawn contracts in the database yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>

        <article className="surface-card quick-actions-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Shortcuts</span>
              <h3>Quick actions</h3>
            </div>
          </div>
          <div className="quick-actions-list">
            <button onClick={() => goTo('pawn')}><span className="quick-icon violet"><HandCoins size={19} /></span><p>New pawn contract<small>Register ID and collateral</small></p><ArrowUpRight size={17} /></button>
            <button onClick={() => goTo('trade')}><span className="quick-icon blue"><ShoppingCart size={19} /></span><p>New sale<small>Phone or accessories</small></p><ArrowUpRight size={17} /></button>
            <button onClick={() => goTo('inventory')}><span className="quick-icon orange"><Package size={19} /></span><p>Add stock<small>Phone, part or accessory</small></p><ArrowUpRight size={17} /></button>
            <button onClick={() => goTo('depreciation')}><span className="quick-icon rose"><Calculator size={19} /></span><p>Value a phone<small>Calculate depreciation</small></p><ArrowUpRight size={17} /></button>
          </div>
        </article>
      </section>
    </>
  )
}

function PawnView() {
  const [pawns, setPawns] = useState<Pawn[]>([])
  const [selectedPawn, setSelectedPawn] = useState<Pawn | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ pawns: Pawn[] }>('/pawns')
      .then((result) => setPawns(result.pawns))
      .catch((reason: Error) => setError(reason.message))
  }, [])

  return (
    <>
      <SectionHeader
        eyebrow="Operations"
        title="Pawn management"
        description={error || 'Track collateral, National ID verification, repayments, renewals, and overdue contracts.'}
        action={<button className="primary-button" onClick={() => comingNext('New pawn')}><Plus size={17} /> New pawn</button>}
      />
      <section className="mini-stats-grid">
        <div className="surface-card mini-stat"><HandCoins /><p>Active contracts<strong>{pawns.filter((pawn) => ['ACTIVE', 'DUE_SOON', 'RENEWED'].includes(pawn.status)).length}</strong><small>{money.format(pawns.reduce((sum, pawn) => sum + pawn.principal, 0))} principal</small></p></div>
        <div className="surface-card mini-stat"><Clock3 /><p>Due soon<strong>{pawns.filter((pawn) => pawn.status === 'DUE_SOON').length}</strong><small>needs follow-up</small></p></div>
        <div className="surface-card mini-stat"><AlertTriangle /><p>Overdue<strong>{pawns.filter((pawn) => pawn.status === 'OVERDUE').length}</strong><small>past due contracts</small></p></div>
        <div className="surface-card mini-stat"><RefreshCcw /><p>Renewed<strong>{pawns.filter((pawn) => pawn.status === 'RENEWED').length}</strong><small>active renewals</small></p></div>
      </section>
      <article className="surface-card table-card page-table">
        <div className="filter-row">
          <div className="search-field"><Search size={17} /><input placeholder="Search contract, customer, phone or IMEI" /></div>
          <button className="ghost-button">All statuses <ChevronDown size={15} /></button>
          <button className="ghost-button">Due date <ChevronDown size={15} /></button>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Contract</th><th>Customer</th><th>Collateral</th><th>Estimated value</th><th>Loan</th><th>ID card</th><th>Due date</th><th>Status</th><th /></tr></thead>
            <tbody>
              {pawns.map((row) => (
                <tr key={row._id}>
                  <td><strong className="mono">{row.pawnNo}</strong></td>
                  <td>{row.customer?.name || 'Unknown'}</td>
                  <td>{row.itemSnapshot.name}<small className="table-subtext">{row.itemSnapshot.imei || 'No IMEI'}</small></td>
                  <td>{money.format(row.estimatedValue)}</td>
                  <td><strong>{money.format(row.principal)}</strong></td>
                  <td>{row.identificationVerified ? <span className="verified"><BadgeCheck size={15} /> Verified</span> : <span className="unverified"><AlertTriangle size={15} /> Missing</span>}</td>
                  <td>{dateText(row.dueDate)}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td><button className="icon-button" onClick={() => setSelectedPawn(row)} aria-label={`View ${row.pawnNo}`}><MoreHorizontal size={18} /></button></td>
                </tr>
              ))}
              {pawns.length === 0 && <tr><td colSpan={9}>No pawn contracts in the database yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
      {selectedPawn && (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedPawn(null)}>
          <section className="detail-modal surface-card" role="dialog" aria-modal="true" aria-labelledby="pawn-detail-title" onClick={(event) => event.stopPropagation()}>
            <header className="detail-modal-header">
              <div>
                <span className="eyebrow">Pawn contract</span>
                <h3 id="pawn-detail-title">{selectedPawn.pawnNo}</h3>
                <p>{selectedPawn.customer?.name || 'Unknown customer'} - {selectedPawn.itemSnapshot.name}</p>
              </div>
              <button className="icon-button" onClick={() => setSelectedPawn(null)} aria-label="Close details"><X size={18} /></button>
            </header>

            <div className="detail-grid">
              <div><span>Status</span><strong><StatusBadge status={selectedPawn.status} /></strong></div>
              <div><span>ID card</span><strong>{selectedPawn.identificationVerified ? 'Verified' : 'Missing'}</strong></div>
              <div><span>Estimated value</span><strong>{money.format(selectedPawn.estimatedValue)}</strong></div>
              <div><span>Loan principal</span><strong>{money.format(selectedPawn.principal)}</strong></div>
              <div><span>Pawn percent</span><strong>{selectedPawn.pawnPercentage}%</strong></div>
              <div><span>Interest rate</span><strong>{selectedPawn.interestRate}%</strong></div>
              <div><span>Due date</span><strong>{dateText(selectedPawn.dueDate)}</strong></div>
              <div><span>Created</span><strong>{dateText(selectedPawn.createdAt)}</strong></div>
            </div>

            <div className="detail-sections">
              <article>
                <span className="eyebrow">Customer</span>
                <p><strong>{selectedPawn.customer?.name || 'Unknown'}</strong></p>
                <p>{selectedPawn.customer?.phone || 'No phone recorded'}</p>
                <p>{selectedPawn.customer?.nationalIdNumber || 'No National ID recorded'}</p>
              </article>
              <article>
                <span className="eyebrow">Collateral</span>
                <p><strong>{selectedPawn.itemSnapshot.name}</strong></p>
                <p>{[selectedPawn.itemSnapshot.brand, selectedPawn.itemSnapshot.model, selectedPawn.itemSnapshot.storage, selectedPawn.itemSnapshot.color].filter(Boolean).join(' ') || 'No extra device details'}</p>
                <p>{selectedPawn.itemSnapshot.imei || 'No IMEI recorded'}</p>
              </article>
            </div>

            {selectedPawn.notes && (
              <div className="detail-note">
                <span className="eyebrow">Notes</span>
                <p>{selectedPawn.notes}</p>
              </div>
            )}

            <footer className="detail-modal-footer">
              <button className="ghost-button" onClick={() => setSelectedPawn(null)}>Close</button>
            </footer>
          </section>
        </div>
      )}
    </>
  )
}

function TradeView() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ trades: Trade[] }>('/trades')
      .then((result) => setTrades(result.trades))
      .catch((reason: Error) => setError(reason.message))
  }, [])

  function exportTrades() {
    const headers = ['Reference', 'Type', 'Customer', 'Items', 'Subtotal', 'Discount', 'Total', 'Paid', 'Balance', 'Payment', 'Status', 'Date']
    const rows = trades.map((trade) => [
      trade.tradeNo,
      trade.type,
      trade.customer?.name || 'Walk-in',
      trade.items.map((item) => `${item.name} x${item.quantity}`).join('; '),
      trade.subtotal,
      trade.discount,
      trade.total,
      trade.amountPaid,
      trade.balance,
      trade.paymentMethod,
      trade.status,
      new Date(trade.createdAt).toISOString(),
    ])
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `phoneflow-transactions-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <SectionHeader
        eyebrow="Operations"
        title="Buy & sell"
        description={error || 'Purchase phones from customers and process shop sales with complete transaction history.'}
      />
      <section className="trade-action-grid">
        <article className="surface-card trade-action buy-action">
          <span className="trade-icon"><Banknote size={28} /></span>
          <div><span className="eyebrow">Purchase from customer</span><h3>Buy a phone</h3><p>Capture seller ID, IMEI, condition, purchase cost, and expected selling price.</p></div>
          <button className="primary-button" onClick={() => comingNext('New purchase')}><Plus size={17} /> New purchase</button>
        </article>
        <article className="surface-card trade-action sell-action">
          <span className="trade-icon"><WalletCards size={28} /></span>
          <div><span className="eyebrow">Point of sale</span><h3>Sell an item</h3><p>Select available stock, customer, discount, payment method, warranty, and print a receipt.</p></div>
          <button className="secondary-button" onClick={() => comingNext('New sale')}><ShoppingCart size={17} /> New sale</button>
        </article>
      </section>
      <article className="surface-card table-card page-table">
        <div className="card-heading table-heading">
          <div><span className="eyebrow">Activity</span><h3>Recent transactions</h3></div>
          <button className="ghost-button" onClick={exportTrades} disabled={trades.length === 0}>Export <FileText size={16} /></button>
        </div>
        <div className="transaction-list">
          {trades.map((transaction) => (
            <div className="transaction-row" key={transaction._id}>
              <span className={`transaction-icon ${transaction.type === 'SELL' ? 'sale' : 'purchase'}`}>{transaction.type === 'SELL' ? <ArrowUpRight /> : <ArrowDownRight />}</span>
              <p><strong>{transaction.items.map((item) => `${item.name} x${item.quantity}`).join(', ')}</strong><small>{transaction.tradeNo} - {transaction.customer?.name || 'Walk-in'} - {dateText(transaction.createdAt)}</small></p>
              <StatusBadge status={transaction.type === 'SELL' ? 'Sale' : 'Purchase'} />
              <strong className={transaction.type === 'SELL' ? 'money-in' : 'money-out'}>{transaction.type === 'SELL' ? '+' : '-'}{money.format(transaction.total)}</strong>
              <button className="icon-button" onClick={() => setSelectedTrade(transaction)} aria-label={`View ${transaction.tradeNo}`}><MoreHorizontal size={18} /></button>
            </div>
          ))}
          {trades.length === 0 && <div className="transaction-row"><p><strong>No transactions yet</strong><small>Create a buy or sell transaction to see it here.</small></p></div>}
        </div>
      </article>
      {selectedTrade && (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedTrade(null)}>
          <section className="detail-modal surface-card" role="dialog" aria-modal="true" aria-labelledby="trade-detail-title" onClick={(event) => event.stopPropagation()}>
            <header className="detail-modal-header">
              <div>
                <span className="eyebrow">{selectedTrade.type === 'SELL' ? 'Sale transaction' : 'Purchase transaction'}</span>
                <h3 id="trade-detail-title">{selectedTrade.tradeNo}</h3>
                <p>{selectedTrade.customer?.name || 'Walk-in'} - {dateText(selectedTrade.createdAt)}</p>
              </div>
              <button className="icon-button" onClick={() => setSelectedTrade(null)} aria-label="Close details"><X size={18} /></button>
            </header>

            <div className="detail-grid">
              <div><span>Type</span><strong>{selectedTrade.type === 'SELL' ? 'Sale' : 'Purchase'}</strong></div>
              <div><span>Status</span><strong><StatusBadge status={selectedTrade.status} /></strong></div>
              <div><span>Payment</span><strong>{titleStatus(selectedTrade.paymentMethod)}</strong></div>
              <div><span>Date</span><strong>{dateText(selectedTrade.createdAt)}</strong></div>
              <div><span>Subtotal</span><strong>{money.format(selectedTrade.subtotal)}</strong></div>
              <div><span>Discount</span><strong>{money.format(selectedTrade.discount)}</strong></div>
              <div><span>Amount paid</span><strong>{money.format(selectedTrade.amountPaid)}</strong></div>
              <div><span>Balance</span><strong>{money.format(selectedTrade.balance)}</strong></div>
            </div>

            <div className="detail-sections">
              <article>
                <span className="eyebrow">Customer</span>
                <p><strong>{selectedTrade.customer?.name || 'Walk-in customer'}</strong></p>
                <p>{selectedTrade.customer?.phone || 'No phone recorded'}</p>
              </article>
              <article>
                <span className="eyebrow">Total</span>
                <p><strong>{selectedTrade.type === 'SELL' ? '+' : '-'}{money.format(selectedTrade.total)}</strong></p>
                <p>{selectedTrade.items.length} line item{selectedTrade.items.length === 1 ? '' : 's'}</p>
              </article>
            </div>

            <div className="detail-lines">
              <span className="eyebrow">Items</span>
              {selectedTrade.items.map((item, index) => (
                <div className="detail-line" key={`${item.name}-${index}`}>
                  <p><strong>{item.name}</strong><small>Quantity {item.quantity}</small></p>
                  <strong>{money.format(item.unitPrice * item.quantity)}</strong>
                </div>
              ))}
            </div>

            {selectedTrade.notes && (
              <div className="detail-note">
                <span className="eyebrow">Notes</span>
                <p>{selectedTrade.notes}</p>
              </div>
            )}

            <footer className="detail-modal-footer">
              <button className="ghost-button" onClick={() => setSelectedTrade(null)}>Close</button>
            </footer>
          </section>
        </div>
      )}
    </>
  )
}

function InventoryView() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ items: InventoryItem[] }>('/inventory')
      .then((result) => setItems(result.items))
      .catch((reason: Error) => setError(reason.message))
  }, [])

  const phoneCount = items.filter((item) => item.category === 'PHONE').reduce((sum, item) => sum + item.quantity, 0)
  const accessoryCount = items.filter((item) => item.category === 'ACCESSORY').reduce((sum, item) => sum + item.quantity, 0)
  const sparePartCount = items.filter((item) => item.category === 'SPARE_PART').reduce((sum, item) => sum + item.quantity, 0)

  return (
    <>
      <SectionHeader
        eyebrow="Stock control"
        title="Stock information"
        description={error || 'Manage individually tracked phones, quantity-based accessories, and compatible spare parts.'}
        action={<button className="primary-button" onClick={() => comingNext('Add stock')}><Plus size={17} /> Add stock</button>}
      />
      <section className="stock-category-grid">
        <article className="surface-card stock-category"><span className="stock-icon violet"><Smartphone /></span><p>Phones<strong>184</strong><small>112 new · 72 second-hand</small></p><ArrowUpRight /></article>
        <article className="surface-card stock-category"><span className="stock-icon violet"><Smartphone /></span><p>Phones<strong>{phoneCount}</strong><small>live stock units</small></p><ArrowUpRight /></article>
        <article className="surface-card stock-category"><span className="stock-icon blue"><Package /></span><p>Accessories<strong>{accessoryCount}</strong><small>live stock units</small></p><ArrowUpRight /></article>
        <article className="surface-card stock-category"><span className="stock-icon orange"><Wrench /></span><p>Spare parts<strong>{sparePartCount}</strong><small>live stock units</small></p><ArrowUpRight /></article>
      </section>
      <article className="surface-card table-card page-table">
        <div className="filter-row">
          <div className="search-field"><Search size={17} /><input placeholder="Search SKU, product, IMEI or serial number" /></div>
          <button className="ghost-button">All categories <ChevronDown size={15} /></button>
          <button className="ghost-button">Stock status <ChevronDown size={15} /></button>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>SKU</th><th>Item</th><th>Category</th><th>Stock</th><th>Buy price</th><th>Sell price</th><th>Status</th><th /></tr></thead>
            <tbody>
              {items.map((row) => (
                <tr key={row._id}>
                  <td><strong className="mono">{row.sku}</strong></td>
                  <td><strong>{row.name}</strong></td>
                  <td>{titleStatus(row.category)}</td>
                  <td><strong>{row.quantity}</strong></td>
                  <td>{money.format(row.buyPrice)}</td>
                  <td>{money.format(row.sellPrice)}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td><button className="icon-button" onClick={() => setSelectedItem(row)} aria-label={`View ${row.sku}`}><MoreHorizontal size={18} /></button></td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={8}>No inventory in the database yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
      {selectedItem && (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedItem(null)}>
          <section className="detail-modal surface-card" role="dialog" aria-modal="true" aria-labelledby="stock-detail-title" onClick={(event) => event.stopPropagation()}>
            <header className="detail-modal-header">
              <div>
                <span className="eyebrow">Stock record</span>
                <h3 id="stock-detail-title">{selectedItem.name}</h3>
                <p>{selectedItem.sku} - {titleStatus(selectedItem.category)}</p>
              </div>
              <button className="icon-button" onClick={() => setSelectedItem(null)} aria-label="Close details"><X size={18} /></button>
            </header>

            <div className="detail-grid">
              <div><span>Status</span><strong><StatusBadge status={selectedItem.status} /></strong></div>
              <div><span>Quantity</span><strong>{selectedItem.quantity}</strong></div>
              <div><span>Buy price</span><strong>{money.format(selectedItem.buyPrice)}</strong></div>
              <div><span>Sell price</span><strong>{money.format(selectedItem.sellPrice)}</strong></div>
              <div><span>Low stock level</span><strong>{selectedItem.reorderLevel}</strong></div>
              <div><span>Minimum sell</span><strong>{money.format(selectedItem.minimumSellPrice || 0)}</strong></div>
              <div><span>Source</span><strong>{selectedItem.source ? titleStatus(selectedItem.source) : 'Not recorded'}</strong></div>
              <div><span>Created</span><strong>{selectedItem.createdAt ? dateText(selectedItem.createdAt) : 'Not recorded'}</strong></div>
            </div>

            <div className="detail-sections">
              <article>
                <span className="eyebrow">Device</span>
                <p><strong>{[selectedItem.brand, selectedItem.model].filter(Boolean).join(' ') || selectedItem.name}</strong></p>
                <p>{[selectedItem.storage, selectedItem.color, selectedItem.condition && titleStatus(selectedItem.condition)].filter(Boolean).join(' ') || 'No extra device details'}</p>
                <p>{selectedItem.batteryHealth !== undefined ? `Battery ${selectedItem.batteryHealth}%` : 'Battery not recorded'}</p>
              </article>
              <article>
                <span className="eyebrow">Identifiers</span>
                <p><strong>{selectedItem.imei1 || 'No IMEI 1'}</strong></p>
                <p>{selectedItem.imei2 || 'No IMEI 2'}</p>
                <p>{selectedItem.serialNumber || 'No serial number'}</p>
              </article>
            </div>

            {selectedItem.notes && (
              <div className="detail-note">
                <span className="eyebrow">Notes</span>
                <p>{selectedItem.notes}</p>
              </div>
            )}

            <footer className="detail-modal-footer">
              <button className="ghost-button" onClick={() => setSelectedItem(null)}>Close</button>
            </footer>
          </section>
        </div>
      )}
    </>
  )
}

function DepreciationView({ goTo }: { goTo: (key: NavKey) => void }) {
  const [marketPrice, setMarketPrice] = useState(500)
  const [ageMonths, setAgeMonths] = useState(12)
  const [condition, setCondition] = useState('good')
  const [pawnRate, setPawnRate] = useState(45)

  const result = useMemo(() => {
    const conditionRates: Record<string, number> = {
      excellent: 0.05,
      good: 0.12,
      fair: 0.22,
      damaged: 0.38,
    }
    const ageDepreciation = Math.min(ageMonths * 0.0125, 0.45)
    const conditionDepreciation = conditionRates[condition] ?? 0.12
    const estimatedValue = Math.max(marketPrice * (1 - ageDepreciation) * (1 - conditionDepreciation), 0)
    const maximumPawn = estimatedValue * (pawnRate / 100)
    return { ageDepreciation, conditionDepreciation, estimatedValue, maximumPawn }
  }, [ageMonths, condition, marketPrice, pawnRate])

  function saveValuation() {
    const record = {
      id: `VAL-${Date.now()}`,
      createdAt: new Date().toISOString(),
      marketPrice,
      ageMonths,
      condition,
      pawnRate,
      estimatedValue: result.estimatedValue,
      maximumPawn: result.maximumPawn,
    }
    const previous = JSON.parse(localStorage.getItem('phoneflow_valuations') || '[]') as unknown[]
    localStorage.setItem('phoneflow_valuations', JSON.stringify([record, ...previous].slice(0, 50)))
    window.alert('Valuation saved on this device.')
  }

  function useForPawn() {
    sessionStorage.setItem('phoneflow_last_valuation', JSON.stringify({
      marketPrice,
      ageMonths,
      condition,
      pawnRate,
      estimatedValue: result.estimatedValue,
      maximumPawn: result.maximumPawn,
    }))
    window.alert(`Valuation ready: estimated value ${currency.format(result.estimatedValue)}, max pawn ${currency.format(result.maximumPawn)}. Use these numbers in the new pawn form.`)
    goTo('pawn')
  }

  return (
    <>
      <SectionHeader
        eyebrow="Valuation"
        title="Depreciation calculator"
        description="Estimate second-hand value and calculate a safe 40–50% pawn amount. Managers can override the final offer with a reason."
      />
      <section className="calculator-layout">
        <article className="surface-card calculator-card">
          <div className="card-heading"><div><span className="eyebrow">Phone details</span><h3>Calculate value</h3></div><span className="calculator-mark"><Calculator size={20} /></span></div>
          <div className="form-grid">
            <label><span>Current market price</span><div className="input-prefix"><span>$</span><input type="number" min="0" value={marketPrice} onChange={(event) => setMarketPrice(Number(event.target.value))} /></div></label>
            <label><span>Phone age</span><div className="input-suffix"><input type="number" min="0" value={ageMonths} onChange={(event) => setAgeMonths(Number(event.target.value))} /><span>months</span></div></label>
            <label><span>Condition</span><select value={condition} onChange={(event) => setCondition(event.target.value)}><option value="excellent">Excellent / Like new</option><option value="good">Good / Minor wear</option><option value="fair">Fair / Visible wear</option><option value="damaged">Damaged / Repair needed</option></select></label>
            <label><span>Pawn percentage</span><div className="range-label"><strong>{pawnRate}%</strong><small>Recommended range: 40–50%</small></div><input className="range-input" type="range" min="40" max="50" value={pawnRate} onChange={(event) => setPawnRate(Number(event.target.value))} /></label>
          </div>
          <div className="notice-box"><AlertTriangle size={18} /><p><strong>Before approving</strong><span>Confirm IMEI, National ID, ownership, lock status, battery health, display, cameras, speakers, and repair cost.</span></p></div>
        </article>

        <article className="surface-card valuation-result-card">
          <span className="eyebrow">Calculated offer</span>
          <div className="valuation-hero"><small>Maximum pawn amount</small><strong>{currency.format(result.maximumPawn)}</strong><span>{pawnRate}% of estimated resale value</span></div>
          <div className="calculation-breakdown">
            <div><span>Market price</span><strong>{currency.format(marketPrice)}</strong></div>
            <div><span>Age deduction</span><strong>-{Math.round(result.ageDepreciation * 100)}%</strong></div>
            <div><span>Condition deduction</span><strong>-{Math.round(result.conditionDepreciation * 100)}%</strong></div>
            <div className="estimated-row"><span>Estimated resale value</span><strong>{currency.format(result.estimatedValue)}</strong></div>
          </div>
          <button className="primary-button full-width" onClick={useForPawn}><HandCoins size={17} /> Use for new pawn</button>
          <button className="ghost-button full-width" onClick={saveValuation}><FileText size={16} /> Save valuation record</button>
        </article>
      </section>
      <section className="surface-card workflow-note">
        <span className="workflow-note-icon"><ScanLine /></span>
        <div><span className="eyebrow">Required document</span><h3>National ID verification</h3><p>The pawn and phone-purchase workflows should require front/back ID images, ID number, expiry date, customer photo, and staff verification before money is released.</p></div>
        <button className="secondary-button">Configure fields</button>
      </section>
    </>
  )
}

function CustomersView() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ customers: Customer[] }>('/customers')
      .then((result) => setCustomers(result.customers))
      .catch((reason: Error) => setError(reason.message))
  }, [])

  return (
    <>
      <SectionHeader
        eyebrow="Customer records"
        title="Customer management"
        description={error || 'Customer profiles, National ID records, addresses, notes, and contact details from MongoDB.'}
        action={<button className="primary-button" onClick={() => comingNext('Add customer')}><Plus size={17} /> Add customer</button>}
      />
      <article className="surface-card table-card page-table">
        <div className="filter-row">
          <div className="search-field"><Search size={17} /><input placeholder="Search customer, phone or National ID" /></div>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Customer</th><th>Phone</th><th>National ID</th><th>Address</th><th>Created</th><th /></tr></thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer._id}>
                  <td><strong>{customer.name}</strong></td>
                  <td>{customer.phone}</td>
                  <td>{customer.nationalIdNumber || 'Not recorded'}</td>
                  <td>{customer.address || 'Not recorded'}</td>
                  <td>{customer.createdAt ? dateText(customer.createdAt) : 'Not recorded'}</td>
                  <td><button className="icon-button" onClick={() => setSelectedCustomer(customer)} aria-label={`View ${customer.name}`}><MoreHorizontal size={18} /></button></td>
                </tr>
              ))}
              {customers.length === 0 && <tr><td colSpan={6}>No customers in the database yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      {selectedCustomer && (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedCustomer(null)}>
          <section className="detail-modal surface-card" role="dialog" aria-modal="true" aria-labelledby="customer-detail-title" onClick={(event) => event.stopPropagation()}>
            <header className="detail-modal-header">
              <div>
                <span className="eyebrow">Customer record</span>
                <h3 id="customer-detail-title">{selectedCustomer.name}</h3>
                <p>{selectedCustomer.phone}</p>
              </div>
              <button className="icon-button" onClick={() => setSelectedCustomer(null)} aria-label="Close details"><X size={18} /></button>
            </header>
            <div className="detail-grid">
              <div><span>Phone</span><strong>{selectedCustomer.phone}</strong></div>
              <div><span>National ID</span><strong>{selectedCustomer.nationalIdNumber || 'Not recorded'}</strong></div>
              <div><span>Created</span><strong>{selectedCustomer.createdAt ? dateText(selectedCustomer.createdAt) : 'Not recorded'}</strong></div>
              <div><span>Customer ID</span><strong className="mono">{selectedCustomer._id.slice(-8)}</strong></div>
            </div>
            <div className="detail-sections">
              <article>
                <span className="eyebrow">Address</span>
                <p>{selectedCustomer.address || 'No address recorded'}</p>
              </article>
              <article>
                <span className="eyebrow">Notes</span>
                <p>{selectedCustomer.notes || 'No notes recorded'}</p>
              </article>
            </div>
            <footer className="detail-modal-footer">
              <button className="ghost-button" onClick={() => setSelectedCustomer(null)}>Close</button>
            </footer>
          </section>
        </div>
      )}
    </>
  )
}

function ReportsView() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    api<DashboardData>('/dashboard').then(setData).catch((reason: Error) => setError(reason.message))
    api<{ logs: ActivityLog[] }>('/activity-logs').then((result) => setLogs(result.logs)).catch(() => setLogs([]))
  }, [])

  const inventoryValue = data?.inventoryMix.reduce((sum, item) => sum + item.value, 0) || 0

  return (
    <>
      <SectionHeader eyebrow="Analytics" title="Reports and analytics" description={error || 'Live sales, pawn, customer, stock, and audit snapshots.'} />
      <section className="metrics-grid">
        <MetricCard label="Sales today" value={money.format(data?.metrics.salesToday || 0)} change="completed sales" trend="up" icon={CircleDollarSign} tone="violet" />
        <MetricCard label="Purchases today" value={money.format(data?.metrics.purchasesToday || 0)} change="cash out" trend="down" icon={Banknote} tone="orange" />
        <MetricCard label="Pawn principal" value={money.format(data?.metrics.activePawnValue || 0)} change={`${data?.metrics.overdueContracts || 0} overdue`} trend={(data?.metrics.overdueContracts || 0) > 0 ? 'down' : 'up'} icon={HandCoins} tone="blue" />
        <MetricCard label="Stock value" value={money.format(inventoryValue)} change={`${data?.metrics.lowStock || 0} low stock`} trend={(data?.metrics.lowStock || 0) > 0 ? 'down' : 'up'} icon={Boxes} tone="rose" />
      </section>
      <section className="dashboard-lower-grid">
        <article className="surface-card table-card">
          <div className="card-heading table-heading"><div><span className="eyebrow">Recent trades</span><h3>Transaction report</h3></div></div>
          <div className="table-scroll"><table><thead><tr><th>Reference</th><th>Type</th><th>Customer</th><th>Total</th><th>Date</th></tr></thead><tbody>
            {(data?.recentTrades || []).map((trade) => <tr key={trade._id}><td><strong className="mono">{trade.tradeNo}</strong></td><td><StatusBadge status={trade.type === 'SELL' ? 'Sale' : 'Purchase'} /></td><td>{trade.customer?.name || 'Walk-in'}</td><td>{money.format(trade.total)}</td><td>{dateText(trade.createdAt)}</td></tr>)}
            {data?.recentTrades.length === 0 && <tr><td colSpan={5}>No transactions yet.</td></tr>}
          </tbody></table></div>
        </article>
        <article className="surface-card table-card">
          <div className="card-heading table-heading"><div><span className="eyebrow">Audit</span><h3>Recent activity</h3></div></div>
          <div className="transaction-list">
            {logs.slice(0, 8).map((log) => <div className="transaction-row" key={log._id}><span className="transaction-icon sale"><FileText /></span><p><strong>{titleStatus(log.action)} {titleStatus(log.entity)}</strong><small>{log.user?.name || 'System'} - {dateText(log.createdAt)}</small></p></div>)}
            {logs.length === 0 && <div className="transaction-row"><p><strong>No audit logs available</strong><small>Owner or manager access may be required.</small></p></div>}
          </div>
        </article>
      </section>
    </>
  )
}

function SettingsView({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const savedValuations = JSON.parse(localStorage.getItem('phoneflow_valuations') || '[]') as unknown[]

  return (
    <>
      <SectionHeader eyebrow="System" title="System settings" description="Current account, environment, security, and local app preferences." />
      <section className="placeholder-grid">
        <article className="surface-card module-card"><UserRound /><h3>{user.name}</h3><p>{user.email}<br />Role: {titleStatus(user.role)}<br />Status: {user.active ? 'Active' : 'Disabled'}</p><button className="ghost-button" onClick={onLogout}>Log out</button></article>
        <article className="surface-card module-card"><Settings /><h3>App environment</h3><p>Frontend: Vite local app<br />API: proxied through /api<br />Database: MongoDB Atlas from backend .env</p></article>
        <article className="surface-card module-card"><Calculator /><h3>Saved valuations</h3><p>{savedValuations.length} valuation record{savedValuations.length === 1 ? '' : 's'} saved on this device.</p><button className="ghost-button" onClick={() => { localStorage.removeItem('phoneflow_valuations'); window.location.reload() }}>Clear saved valuations</button></article>
      </section>
    </>
  )
}

function App({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const [active, setActive] = useState<NavKey>('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(true)

  const changePage = (key: NavKey) => {
    setActive(key)
    setMobileOpen(false)
  }

  const renderView = () => {
    switch (active) {
      case 'dashboard': return <DashboardView goTo={changePage} user={user} />
      case 'pawn': return <PawnView />
      case 'trade': return <TradeView />
      case 'inventory': return <InventoryView />
      case 'customers': return <CustomersView />
      case 'depreciation': return <DepreciationView goTo={changePage} />
      case 'reports': return <ReportsView />
      case 'settings': return <SettingsView user={user} onLogout={onLogout} />
      default: return <DashboardView goTo={changePage} user={user} />
    }
  }

  return (
    <div className="app" data-theme={darkMode ? 'dark' : 'light'}>
      <div className={`mobile-overlay ${mobileOpen ? 'show' : ''}`} onClick={() => setMobileOpen(false)} />
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="brand">
          <span className="brand-mark"><Smartphone size={22} /></span>
          <div><strong>PhoneFlow</strong><small>Shop Management</small></div>
          <button className="mobile-close" onClick={() => setMobileOpen(false)}><X size={20} /></button>
        </div>

        <nav className="sidebar-nav">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-group-label">{group.label}</span>
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <button className={active === item.key ? 'active' : ''} key={item.key} onClick={() => changePage(item.key)}>
                    <Icon size={19} />
                    <span>{item.label}</span>
                    {item.badge && <small>{item.badge}</small>}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="support-card">
            <span><BadgeCheck size={19} /></span>
            <p><strong>Daily backup</strong><small>Last backup: 14:05</small></p>
          </div>
          <div className="user-card">
            <span className="avatar large">WN</span>
            <p><strong>{user.name}</strong><small>{titleStatus(user.role)}</small></p>
            <button className="icon-button" onClick={onLogout} aria-label="Log out"><X size={16} /></button>
          </div>
        </div>
      </aside>

      <div className="app-shell">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={21} /></button>
          <div className="global-search"><Search size={18} /><input placeholder="Search pawn, customer, IMEI, product..." /><kbd>⌘ K</kbd></div>
          <div className="topbar-actions">
            <button className="icon-button theme-toggle" onClick={() => setDarkMode((current) => !current)} aria-label="Toggle theme">{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /><span /></button>
            <div className="topbar-user"><span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span><p><strong>{user.name.split(' ')[0]}</strong><small>{titleStatus(user.role)}</small></p><ChevronDown size={15} /></div>
          </div>
        </header>
        <main className="main-content">{renderView()}</main>
      </div>
    </div>
  )
}

export default App
