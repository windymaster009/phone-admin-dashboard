import { useMemo, useState, type ReactNode } from 'react'
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

const metrics = [
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

function StatusBadge({ status }: { status: string }) {
  const slug = status.toLowerCase().replaceAll(' ', '-')
  return <span className={`status-badge status-${slug}`}>{status}</span>
}

function MetricCard({
  label,
  value,
  change,
  trend,
  icon: Icon,
  tone,
}: (typeof metrics)[number]) {
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

function DashboardView() {
  return (
    <>
      <SectionHeader
        eyebrow="Wednesday, 15 July"
        title="Good afternoon, Windy"
        description="Here is what is happening in the shop today."
        action={
          <button className="primary-button">
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
            <strong>$38,940</strong>
            <span><ArrowUpRight size={15} /> 9.2% vs last month</span>
          </div>

          <div className="chart-shell" aria-label="Monthly revenue bar chart">
            {[42, 55, 48, 72, 66, 83, 75, 91, 70, 86, 78, 96].map((height, index) => (
              <div className="chart-column" key={index}>
                <span style={{ height: `${height}%` }} />
                <small>{['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][index]}</small>
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
            <div className="donut-chart"><span>$61.4K<small>Total value</small></span></div>
          </div>
          <div className="legend-list">
            <div><span className="legend-dot dot-violet" /><p>Phones<small>184 units</small></p><strong>62%</strong></div>
            <div><span className="legend-dot dot-blue" /><p>Accessories<small>642 units</small></p><strong>24%</strong></div>
            <div><span className="legend-dot dot-orange" /><p>Spare parts<small>301 units</small></p><strong>14%</strong></div>
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
            <button className="text-button">View all <ArrowUpRight size={15} /></button>
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
                {pawnRows.map((row) => (
                  <tr key={row.id}>
                    <td><strong className="mono">{row.id}</strong></td>
                    <td>
                      <div className="customer-cell">
                        <span className="avatar">{row.customer.slice(0, 2).toUpperCase()}</span>
                        <p>{row.customer}<small>{row.phone}</small></p>
                      </div>
                    </td>
                    <td><strong>{row.loan}</strong><small className="table-subtext">of {row.value}</small></td>
                    <td>{row.due}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td><button className="icon-button"><MoreHorizontal size={18} /></button></td>
                  </tr>
                ))}
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
            <button><span className="quick-icon violet"><HandCoins size={19} /></span><p>New pawn contract<small>Register ID and collateral</small></p><ArrowUpRight size={17} /></button>
            <button><span className="quick-icon blue"><ShoppingCart size={19} /></span><p>New sale<small>Phone or accessories</small></p><ArrowUpRight size={17} /></button>
            <button><span className="quick-icon orange"><Package size={19} /></span><p>Add stock<small>Phone, part or accessory</small></p><ArrowUpRight size={17} /></button>
            <button><span className="quick-icon rose"><Calculator size={19} /></span><p>Value a phone<small>Calculate depreciation</small></p><ArrowUpRight size={17} /></button>
          </div>
        </article>
      </section>
    </>
  )
}

function PawnView() {
  return (
    <>
      <SectionHeader
        eyebrow="Operations"
        title="Pawn management"
        description="Track collateral, National ID verification, repayments, renewals, and overdue contracts."
        action={<button className="primary-button"><Plus size={17} /> New pawn</button>}
      />
      <section className="mini-stats-grid">
        <div className="surface-card mini-stat"><HandCoins /><p>Active contracts<strong>96</strong><small>$32,680 principal</small></p></div>
        <div className="surface-card mini-stat"><Clock3 /><p>Due this week<strong>18</strong><small>6 need follow-up</small></p></div>
        <div className="surface-card mini-stat"><AlertTriangle /><p>Overdue<strong>12</strong><small>$3,840 outstanding</small></p></div>
        <div className="surface-card mini-stat"><RefreshCcw /><p>Renewed this month<strong>27</strong><small>$1,620 interest</small></p></div>
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
              {pawnRows.map((row) => (
                <tr key={row.id}>
                  <td><strong className="mono">{row.id}</strong></td>
                  <td>{row.customer}</td>
                  <td>{row.phone}<small className="table-subtext">IMEI ending 8421</small></td>
                  <td>{row.value}</td>
                  <td><strong>{row.loan}</strong></td>
                  <td>{row.idVerified ? <span className="verified"><BadgeCheck size={15} /> Verified</span> : <span className="unverified"><AlertTriangle size={15} /> Missing</span>}</td>
                  <td>{row.due}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td><button className="icon-button"><MoreHorizontal size={18} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </>
  )
}

function TradeView() {
  return (
    <>
      <SectionHeader
        eyebrow="Operations"
        title="Buy & sell"
        description="Purchase phones from customers and process shop sales with complete transaction history."
      />
      <section className="trade-action-grid">
        <article className="surface-card trade-action buy-action">
          <span className="trade-icon"><Banknote size={28} /></span>
          <div><span className="eyebrow">Purchase from customer</span><h3>Buy a phone</h3><p>Capture seller ID, IMEI, condition, purchase cost, and expected selling price.</p></div>
          <button className="primary-button"><Plus size={17} /> New purchase</button>
        </article>
        <article className="surface-card trade-action sell-action">
          <span className="trade-icon"><WalletCards size={28} /></span>
          <div><span className="eyebrow">Point of sale</span><h3>Sell an item</h3><p>Select available stock, customer, discount, payment method, warranty, and print a receipt.</p></div>
          <button className="secondary-button"><ShoppingCart size={17} /> New sale</button>
        </article>
      </section>
      <article className="surface-card table-card page-table">
        <div className="card-heading table-heading">
          <div><span className="eyebrow">Activity</span><h3>Recent transactions</h3></div>
          <button className="ghost-button">Export <FileText size={16} /></button>
        </div>
        <div className="transaction-list">
          {transactions.map((transaction) => (
            <div className="transaction-row" key={transaction.id}>
              <span className={`transaction-icon ${transaction.type === 'Sale' ? 'sale' : 'purchase'}`}>{transaction.type === 'Sale' ? <ArrowUpRight /> : <ArrowDownRight />}</span>
              <p><strong>{transaction.title}</strong><small>{transaction.id} · {transaction.person}</small></p>
              <StatusBadge status={transaction.type} />
              <strong className={transaction.type === 'Sale' ? 'money-in' : 'money-out'}>{transaction.amount}</strong>
              <button className="icon-button"><MoreHorizontal size={18} /></button>
            </div>
          ))}
        </div>
      </article>
    </>
  )
}

function InventoryView() {
  return (
    <>
      <SectionHeader
        eyebrow="Stock control"
        title="Stock information"
        description="Manage individually tracked phones, quantity-based accessories, and compatible spare parts."
        action={<button className="primary-button"><Plus size={17} /> Add stock</button>}
      />
      <section className="stock-category-grid">
        <article className="surface-card stock-category"><span className="stock-icon violet"><Smartphone /></span><p>Phones<strong>184</strong><small>112 new · 72 second-hand</small></p><ArrowUpRight /></article>
        <article className="surface-card stock-category"><span className="stock-icon blue"><Package /></span><p>Accessories<strong>642</strong><small>4 categories low</small></p><ArrowUpRight /></article>
        <article className="surface-card stock-category"><span className="stock-icon orange"><Wrench /></span><p>Spare parts<strong>301</strong><small>3 parts low</small></p><ArrowUpRight /></article>
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
              {inventoryRows.map((row) => (
                <tr key={row.sku}>
                  <td><strong className="mono">{row.sku}</strong></td>
                  <td><strong>{row.item}</strong></td>
                  <td>{row.type}</td>
                  <td><strong>{row.stock}</strong></td>
                  <td>{row.buy}</td>
                  <td>{row.sell}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td><button className="icon-button"><MoreHorizontal size={18} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </>
  )
}

function DepreciationView() {
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
          <button className="primary-button full-width"><HandCoins size={17} /> Use for new pawn</button>
          <button className="ghost-button full-width"><FileText size={16} /> Save valuation record</button>
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

function PlaceholderView({ active }: { active: NavKey }) {
  const content: Partial<Record<NavKey, { icon: LucideIcon; title: string; text: string }>> = {
    customers: { icon: UserRound, title: 'Customer management', text: 'Customer profiles, National ID documents, purchase history, pawn history, balances, and notes will live here.' },
    reports: { icon: BarChart3, title: 'Reports and analytics', text: 'Daily sales, pawn principal, interest income, stock value, gross profit, expenses, and staff performance reports will live here.' },
    settings: { icon: Settings, title: 'System settings', text: 'Shop profile, depreciation rules, pawn percentages, receipt settings, user roles, permissions, and audit controls will live here.' },
  }
  const current = content[active] ?? content.customers!
  const Icon = current.icon
  return (
    <>
      <SectionHeader eyebrow="Coming next" title={current.title} description={current.text} />
      <article className="surface-card empty-state"><span><Icon size={34} /></span><h3>Module scaffolded</h3><p>The navigation and page space are ready. This module will be connected after the core pawn, stock, and transaction data model is approved.</p><button className="primary-button">Review module plan</button></article>
    </>
  )
}

function App() {
  const [active, setActive] = useState<NavKey>('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(true)

  const changePage = (key: NavKey) => {
    setActive(key)
    setMobileOpen(false)
  }

  const renderView = () => {
    switch (active) {
      case 'dashboard': return <DashboardView />
      case 'pawn': return <PawnView />
      case 'trade': return <TradeView />
      case 'inventory': return <InventoryView />
      case 'depreciation': return <DepreciationView />
      default: return <PlaceholderView active={active} />
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
            <p><strong>Windy Nhim</strong><small>Owner</small></p>
            <MoreHorizontal size={18} />
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
            <div className="topbar-user"><span className="avatar">WN</span><p><strong>Windy</strong><small>Owner</small></p><ChevronDown size={15} /></div>
          </div>
        </header>
        <main className="main-content">{renderView()}</main>
      </div>
    </div>
  )
}

export default App
