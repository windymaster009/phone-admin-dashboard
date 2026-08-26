import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileText,
  Mail,
  MessageCircle,
  MonitorSmartphone,
  PackageCheck,
  ReceiptText,
  RefreshCcw,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { api, getSessionUser } from '../../lib/api'
import LoadingState from '../../components/LoadingState'
import './service-workspace.css'

type Currency = 'USD' | 'KHR'
type ServiceCategory = 'ACCOUNT_SETUP' | 'DEVICE_SETUP' | 'DATA_TRANSFER' | 'SOFTWARE' | 'OTHER'

type ServiceOffering = {
  _id: string
  code: string
  name: string
  category: ServiceCategory
  description?: string
  currency: Currency
  price: number
  active: boolean
}

type Customer = { _id: string; name: string; phone?: string }

type ServiceCharge = {
  _id: string
  serviceNo: string
  serviceSnapshot: { name: string; category: ServiceCategory }
  customerSnapshot: { name: string; phone?: string }
  currency: Currency
  total: number
  paymentMethod: string
  status: string
  completedAt: string
  createdBy?: { name: string }
}

const categoryDetails: Record<ServiceCategory, { label: string; icon: LucideIcon }> = {
  ACCOUNT_SETUP: { label: 'Account setup', icon: Mail },
  DEVICE_SETUP: { label: 'Device setup', icon: Smartphone },
  DATA_TRANSFER: { label: 'Data transfer', icon: MonitorSmartphone },
  SOFTWARE: { label: 'Apps & software', icon: PackageCheck },
  OTHER: { label: 'Other services', icon: Settings2 },
}

function money(value: number, currency: Currency) {
  return currency === 'KHR'
    ? `${Math.round(Number(value || 0) / 100) * 100}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' KHR'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value || 0))
}

function dateText(value?: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function titleCase(value: string) {
  return value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function go(path: string) {
  if (window.location.pathname !== path) window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export default function ServiceWorkspace() {
  const session = getSessionUser()
  const canPrice = session?.role === 'OWNER' || session?.role === 'MANAGER'
  const [services, setServices] = useState<ServiceOffering[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [charges, setCharges] = useState<ServiceCharge[]>([])
  const [selected, setSelected] = useState<ServiceOffering | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<'ALL' | ServiceCategory>('ALL')
  const [customerId, setCustomerId] = useState('')
  const [walkInName, setWalkInName] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [discount, setDiscount] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [notes, setNotes] = useState('')
  const [pricing, setPricing] = useState<ServiceOffering | null>(null)
  const [price, setPrice] = useState('')
  const [priceCurrency, setPriceCurrency] = useState<Currency>('USD')
  const [success, setSuccess] = useState<ServiceCharge | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [catalog, customerResult, chargeResult] = await Promise.all([
        api<{ services: ServiceOffering[] }>('/services/catalog'),
        api<{ customers: Customer[] }>('/customers'),
        api<{ charges: ServiceCharge[] }>('/services/charges'),
      ])
      setServices(catalog.services)
      setCustomers(customerResult.customers)
      setCharges(chargeResult.charges)
      setSelected((current) => current ? catalog.services.find((item) => item._id === current._id) || null : null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load services')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => services.filter((service) => {
    const matchesCategory = category === 'ALL' || service.category === category
    const terms = `${service.name} ${service.description || ''} ${service.code}`.toLowerCase()
    return matchesCategory && terms.includes(search.trim().toLowerCase())
  }), [services, search, category])

  const subtotal = Number(selected?.price || 0) * quantity
  const normalizedDiscount = Math.min(subtotal, Math.max(0, Number(discount.replaceAll(',', '')) || 0))
  const total = Math.max(0, subtotal - normalizedDiscount)

  function choose(service: ServiceOffering) {
    if (!(service.price > 0)) {
      if (canPrice) {
        setPricing(service)
        setPrice('')
        setPriceCurrency(service.currency)
      } else setError('A manager needs to set this service price before it can be charged.')
      return
    }
    setSelected(service)
    setError('')
  }

  async function savePrice(event: FormEvent) {
    event.preventDefault()
    if (!pricing) return
    setBusy(true)
    setError('')
    try {
      const result = await api<{ service: ServiceOffering }>(`/services/catalog/${pricing._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ price: Number(price.replaceAll(',', '')), currency: priceCurrency }),
      })
      setServices((items) => items.map((item) => item._id === result.service._id ? result.service : item))
      setPricing(null)
      setSelected(result.service.price > 0 ? result.service : null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save the service price')
    } finally {
      setBusy(false)
    }
  }

  async function recordCharge(event: FormEvent) {
    event.preventDefault()
    if (!selected || !(selected.price > 0)) return
    setBusy(true)
    setError('')
    try {
      const result = await api<{ charge: ServiceCharge }>('/services/charges', {
        method: 'POST',
        body: JSON.stringify({
          offeringId: selected._id,
          customerId: customerId || undefined,
          customerName: customerId ? undefined : walkInName,
          quantity,
          discount: normalizedDiscount,
          paymentMethod,
          notes,
        }),
      })
      setCharges((items) => [result.charge, ...items])
      setSuccess(result.charge)
      setSelected(null)
      setCustomerId('')
      setWalkInName('')
      setQuantity(1)
      setDiscount('0')
      setPaymentMethod('CASH')
      setNotes('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to record this service')
    } finally {
      setBusy(false)
    }
  }

  async function createReceipt() {
    if (!success) return
    setBusy(true)
    try {
      await api('/receipts/generate', {
        method: 'POST',
        body: JSON.stringify({ sourceType: 'SERVICE', reference: success.serviceNo, documentType: 'SERVICE_RECEIPT', sourceSubId: 'service' }),
      })
      setSuccess(null)
      go('/receipts')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create the service receipt')
    } finally {
      setBusy(false)
    }
  }

  return <div className="service-page">
    <header className="section-header service-page-header">
      <div><span className="eyebrow">Customer services</span><h2>Service charges</h2><p>Charge for account setup, phone assistance, data transfer, and other work without changing stock.</p></div>
      <button className="ghost-button" type="button" onClick={() => go('/reports/services')}><FileText size={16} /> Service report</button>
    </header>

    {error && <div className="service-alert" role="alert"><AlertTriangle size={17} /><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss message"><X size={15} /></button></div>}

    <div className="service-layout">
      <main className="service-catalogue">
        <section className="surface-card service-catalogue-tools" aria-label="Service catalogue filters">
          <div className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search services" /></div>
          <select value={category} onChange={(event) => setCategory(event.target.value as 'ALL' | ServiceCategory)} aria-label="Service category">
            <option value="ALL">All categories</option>
            {Object.entries(categoryDetails).map(([value, detail]) => <option value={value} key={value}>{detail.label}</option>)}
          </select>
          <button className="icon-button" type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh services"><RefreshCcw size={16} /></button>
        </section>

        {loading && services.length === 0 ? <section className="surface-card"><LoadingState label="Loading services" detail="Preparing the service catalogue…" /></section> : <section className="service-catalogue-grid" aria-label="Available services">
          {filtered.map((service) => {
            const detail = categoryDetails[service.category]
            const Icon = detail.icon
            const unpriced = !(service.price > 0)
            return <article className={`surface-card service-card ${selected?._id === service._id ? 'selected' : ''}`} key={service._id}>
              <button className="service-card-main" type="button" onClick={() => choose(service)} aria-pressed={selected?._id === service._id}>
                <span className={`service-card-icon service-tone-${service.category.toLowerCase()}`}><Icon size={21} /></span>
                <span><small>{detail.label}</small><strong>{service.name}</strong><p>{service.description}</p></span>
              </button>
              <footer>
                {unpriced ? <><span className="service-price-missing"><AlertTriangle size={13} /> No price</span><button type="button" className="service-set-price" onClick={() => choose(service)}>{canPrice ? 'Set price' : 'Needs price'} <ArrowRight size={13} /></button></> : <><span>Standard price</span><strong>{money(service.price, service.currency)}</strong></>}
              </footer>
            </article>
          })}
          {!filtered.length && <div className="surface-card service-empty"><Search size={24} /><strong>No services found</strong><p>Try another search or category.</p></div>}
        </section>}

        <section className="surface-card service-recent">
          <header><div><span className="eyebrow">Latest work</span><h3>Recent service charges</h3></div><button className="text-button" type="button" onClick={() => go('/reports/services')}>View report <ArrowRight size={14} /></button></header>
          <div className="service-recent-list">
            {charges.slice(0, 6).map((charge) => <article key={charge._id}>
              <span className="service-recent-icon"><ReceiptText size={17} /></span>
              <p><strong>{charge.serviceSnapshot.name}</strong><small>{charge.customerSnapshot.name} · {charge.serviceNo}</small></p>
              <span><strong>{money(charge.total, charge.currency)}</strong><small>{dateText(charge.completedAt)}</small></span>
            </article>)}
            {!charges.length && !loading && <div className="service-empty compact"><Clock3 size={22} /><strong>No service charges yet</strong><p>Your completed service work will appear here.</p></div>}
          </div>
        </section>
      </main>

      <aside className="surface-card service-charge-panel" aria-label="Charge customer">
        <header><span className="service-panel-icon"><CircleDollarSign size={21} /></span><div><span className="eyebrow">Checkout</span><h3>{selected ? selected.name : 'Choose a service'}</h3><p>{selected ? 'Confirm the customer and payment.' : 'Select a priced service from the catalogue.'}</p></div></header>
        {selected ? <form onSubmit={recordCharge}>
          <label><span>Customer</span><select value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Walk-in customer</option>{customers.map((customer) => <option value={customer._id} key={customer._id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}</select></label>
          {!customerId && <label><span>Customer name <small>Optional</small></span><input value={walkInName} onChange={(event) => setWalkInName(event.target.value)} placeholder="Walk-in customer" /></label>}
          <div className="service-form-pair"><label><span>Quantity</span><input type="number" min="1" max="1000" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} /></label><label><span>Discount ({selected.currency})</span><input inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value.replace(/[^\d.,]/g, ''))} /></label></div>
          <label><span>Payment method</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="CASH">Cash</option><option value="KHQR">KHQR</option><option value="BANK">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label>
          <label><span>Work note <small>Optional</small></span><textarea maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What was completed for the customer?" /></label>
          <div className="service-security-note"><ShieldCheck size={16} /><span><strong>Protect customer access</strong>Never save passwords, one-time codes, or recovery codes.</span></div>
          <dl className="service-total"><div><dt>Subtotal</dt><dd>{money(subtotal, selected.currency)}</dd></div>{normalizedDiscount > 0 && <div><dt>Discount</dt><dd>− {money(normalizedDiscount, selected.currency)}</dd></div>}<div><dt>Total</dt><dd>{money(total, selected.currency)}</dd></div></dl>
          <button className="primary-button service-complete" disabled={busy} type="submit"><CreditCard size={16} />{busy ? 'Saving…' : 'Complete service'}</button>
        </form> : <div className="service-panel-empty"><MessageCircle size={28} /><strong>Ready for the next customer</strong><p>Choose a service to see its price and record payment.</p></div>}
      </aside>
    </div>

    {pricing && <div className="service-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPricing(null) }}>
      <section className="surface-card service-price-modal" role="dialog" aria-modal="true" aria-labelledby="service-price-title">
        <header><span className="service-panel-icon"><Banknote size={20} /></span><div><span className="eyebrow">Catalogue pricing</span><h3 id="service-price-title">Set service price</h3><p>{pricing.name}</p></div><button className="icon-button" type="button" onClick={() => setPricing(null)} aria-label="Close pricing"><X size={18} /></button></header>
        <form onSubmit={savePrice}><div className="service-form-pair"><label><span>Currency</span><select value={priceCurrency} onChange={(event) => setPriceCurrency(event.target.value as Currency)}><option value="USD">USD — US Dollar</option><option value="KHR">KHR — Cambodian Riel</option></select></label><label><span>Standard price</span><input autoFocus required inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value.replace(/[^\d.,]/g, ''))} placeholder={priceCurrency === 'KHR' ? '10,000' : '2.50'} /></label></div><p className="service-price-help">This becomes the default checkout price. A manager can change it later.</p><footer><button className="ghost-button" type="button" onClick={() => setPricing(null)}>Cancel</button><button className="primary-button" disabled={busy || !(Number(price.replaceAll(',', '')) > 0)} type="submit">Save price</button></footer></form>
      </section>
    </div>}

    {success && <div className="service-modal-backdrop">
      <section className="surface-card service-success-modal" role="dialog" aria-modal="true" aria-labelledby="service-success-title">
        <span className="service-success-icon"><CheckCircle2 size={28} /></span><span className="eyebrow">Service charge saved</span><h3 id="service-success-title">{success.serviceSnapshot.name} completed</h3><p>{success.customerSnapshot.name} · {money(success.total, success.currency)}</p><div><button className="ghost-button" type="button" onClick={() => setSuccess(null)}>Done</button><button className="primary-button" type="button" disabled={busy} onClick={() => void createReceipt()}><ReceiptText size={16} /> Create receipt</button></div>
      </section>
    </div>}
  </div>
}
