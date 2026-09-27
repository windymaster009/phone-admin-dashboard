import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useRouter } from '../../app/routing'
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
  MoreHorizontal,
  PackageCheck,
  Pencil,
  Printer,
  ReceiptText,
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
import MoneyInput from '../../components/MoneyInput'
import WarrantyPeriodField from '../../components/WarrantyPeriodField'
import OperationModalShell from '../../components/OperationModalShell'
import DetailModalShell from '../../components/DetailModalShell'
import DetailModalHeader from '../../components/DetailModalHeader'
import DetailModalBody from '../../components/DetailModalBody'
import DetailModalFooter from '../../components/DetailModalFooter'
import FilterToolbar from '../../components/FilterToolbar'
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
  priceUsd?: number
  priceKhr?: number
  pricingExchangeRate?: number
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
  unitPrice?: number
  quantity?: number
  subtotal?: number
  discount?: number
  discountType?: 'AMOUNT' | 'PERCENT'
  discountPercent?: number
  paymentMethod: string
  warrantyDays?: number
  warrantyExpiresAt?: string
  status: string
  completedAt: string
  notes?: string
  createdBy?: { name: string }
  correctionVersion?: number
  lastCorrectedAt?: string
  lastCorrectedBy?: { name: string }
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

export default function ServiceWorkspace() {
  const { navigate } = useRouter()
  const go = (path: string) => navigate(path)
  const session = getSessionUser()
  const canPrice = session?.role === 'OWNER' || session?.role === 'MANAGER'
  const [services, setServices] = useState<ServiceOffering[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [charges, setCharges] = useState<ServiceCharge[]>([])
  const [chargeSearch, setChargeSearch] = useState('')
  const [searchedCharges, setSearchedCharges] = useState<ServiceCharge[] | null>(null)
  const [chargeSearchBusy, setChargeSearchBusy] = useState(false)
  const [chargeSearchError, setChargeSearchError] = useState('')
  const [selectedCharge, setSelectedCharge] = useState<ServiceCharge | null>(null)
  const [editingChargeCorrection, setEditingChargeCorrection] = useState(false)
  const [correctionWarrantyDays, setCorrectionWarrantyDays] = useState('0')
  const [correctionNotes, setCorrectionNotes] = useState('')
  const [correctionReason, setCorrectionReason] = useState('')
  const [correctionError, setCorrectionError] = useState('')
  const [correctionBusy, setCorrectionBusy] = useState(false)
  const [selected, setSelected] = useState<ServiceOffering | null>(null)
  const [chargeOpen, setChargeOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<'ALL' | ServiceCategory>('ALL')
  const [customerId, setCustomerId] = useState('')
  const [walkInName, setWalkInName] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [discount, setDiscount] = useState('0')
  const [discountType, setDiscountType] = useState<'AMOUNT' | 'PERCENT'>('AMOUNT')
  const [chargeCurrency, setChargeCurrency] = useState<Currency>('USD')
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [warrantyDays, setWarrantyDays] = useState('0')
  const [notes, setNotes] = useState('')
  const [pricing, setPricing] = useState<ServiceOffering | null>(null)
  const [priceUsd, setPriceUsd] = useState('')
  const [priceKhr, setPriceKhr] = useState('')
  const [priceCurrency, setPriceCurrency] = useState<Currency>('USD')
  const [serviceExchangeRate, setServiceExchangeRate] = useState(4100)
  const [success, setSuccess] = useState<ServiceCharge | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submittingRef = useRef(false)
  const receiptSubmittingRef = useRef(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [catalog, customerResult, chargeResult] = await Promise.all([
        api<{ services: ServiceOffering[]; exchangeRate?: number }>('/services/catalog'),
        api<{ customers: Customer[] }>('/customers'),
        api<{ charges: ServiceCharge[] }>('/services/charges'),
      ])
      setServices(catalog.services)
      if (Number(catalog.exchangeRate) > 0) setServiceExchangeRate(Number(catalog.exchangeRate))
      setCustomers(customerResult.customers)
      setCharges(chargeResult.charges)
      setSelected((current) => current ? catalog.services.find((item) => item._id === current._id) || null : null)
      const openParam = new URLSearchParams(window.location.search).get('openService')
      if (openParam) {
        const matched = catalog.services.find((s) => s._id === openParam || s.code === openParam || s.name.toLowerCase() === openParam.toLowerCase())
        if (matched) {
          setSelected(matched)
          window.history.replaceState(window.history.state, '', window.location.pathname)
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load services')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  useEffect(() => {
    const term = chargeSearch.trim()
    if (!term) {
      setSearchedCharges(null)
      setChargeSearchBusy(false)
      setChargeSearchError('')
      return
    }
    let cancelled = false
    setChargeSearchBusy(true)
    setChargeSearchError('')
    setSearchedCharges(null)
    const timer = window.setTimeout(() => {
      void api<{ charges: ServiceCharge[] }>(`/services/charges?search=${encodeURIComponent(term)}`)
        .then((result) => { if (!cancelled) setSearchedCharges(result.charges) })
        .catch((reason) => { if (!cancelled) setChargeSearchError(reason instanceof Error ? reason.message : 'Unable to search service charges') })
        .finally(() => { if (!cancelled) setChargeSearchBusy(false) })
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [chargeSearch])

  useEffect(() => {
    function handleOpenServiceDetail(event: Event) {
      const detail = (event as CustomEvent<{ service?: ServiceOffering; id?: string; code?: string }>).detail
      let service = detail?.service
      if (!service && (detail?.id || detail?.code)) {
        service = services.find((s) => s._id === detail.id || s.code === detail.code)
      }
      if (service) {
        setSelected(service)
        if (new URLSearchParams(window.location.search).has('openService')) {
          window.history.replaceState(window.history.state, '', window.location.pathname)
        }
      }
    }

    window.addEventListener('phoneflow:open-service-detail', handleOpenServiceDetail)
    return () => window.removeEventListener('phoneflow:open-service-detail', handleOpenServiceDetail)
  }, [services])

  const filtered = useMemo(() => services.filter((service) => {
    const matchesCategory = category === 'ALL' || service.category === category
    const terms = `${service.name} ${service.description || ''} ${service.code}`.toLowerCase()
    return matchesCategory && terms.includes(search.trim().toLowerCase())
  }), [services, search, category])
  const pricedServices = useMemo(() => services.filter((service) => service.price > 0), [services])
  const visibleCharges = chargeSearch.trim() ? (searchedCharges || []) : charges.slice(0, 6)

  function printChargeReceipt(charge: ServiceCharge) {
    window.dispatchEvent(new CustomEvent('phoneflow:open-service-receipt', {
      detail: { reference: charge.serviceNo, currency: charge.currency, autoPrint: true },
    }))
  }

  function selectedPrice(currency: Currency) {
    if (!selected) return 0
    const exchangeRate = Number(selected.pricingExchangeRate) > 0 ? Number(selected.pricingExchangeRate) : serviceExchangeRate
    const savedPrice = currency === 'USD' ? Number(selected.priceUsd) : Number(selected.priceKhr)
    if (Number.isFinite(savedPrice) && savedPrice > 0) return savedPrice
    if (selected.currency === currency) return Number(selected.price) || 0
    return currency === 'KHR'
      ? Math.round((Number(selected.price || 0) * exchangeRate) / 100) * 100
      : Math.round((Number(selected.price || 0) / exchangeRate) * 100) / 100
  }

  const unitPrice = selectedPrice(chargeCurrency)
  const subtotal = chargeCurrency === 'KHR'
    ? Math.round((unitPrice * quantity) / 100) * 100
    : Math.round((unitPrice * quantity + Number.EPSILON) * 100) / 100
  const rawDiscount = Math.max(0, Number(discount.replaceAll(',', '')) || 0)
  const discountPercent = Math.min(100, rawDiscount)
  const normalizedDiscount = discountType === 'PERCENT'
    ? chargeCurrency === 'KHR'
      ? Math.min(subtotal, Math.round((subtotal * discountPercent / 100) / 100) * 100)
      : Math.min(subtotal, Math.round((subtotal * discountPercent / 100 + Number.EPSILON) * 100) / 100)
    : Math.min(subtotal, rawDiscount)
  const total = Math.max(0, subtotal - normalizedDiscount)

  function usdToKhr(value: string) {
    if (value === '') return ''
    return String(Math.round((Number(value || 0) * serviceExchangeRate) / 100) * 100)
  }

  function khrToUsd(value: string) {
    if (value === '') return ''
    return String(Math.round((Number(value || 0) / serviceExchangeRate) * 100) / 100)
  }

  function openPricing(service: ServiceOffering) {
    const rate = Number(service.pricingExchangeRate) > 0 ? Number(service.pricingExchangeRate) : serviceExchangeRate
    const savedUsd = Number(service.priceUsd)
    const savedKhr = Number(service.priceKhr)
    const legacyUsd = service.currency === 'USD' ? Number(service.price) : Math.round((Number(service.price || 0) / rate) * 100) / 100
    const legacyKhr = service.currency === 'KHR' ? Number(service.price) : Math.round((Number(service.price || 0) * rate) / 100) * 100
    const usd = Number.isFinite(savedUsd) && savedUsd > 0 ? savedUsd : legacyUsd
    const khr = Number.isFinite(savedKhr) && savedKhr > 0 ? savedKhr : legacyKhr
    setPricing(service)
    setPriceCurrency(service.currency)
    setPriceUsd(usd > 0 ? String(usd) : '')
    setPriceKhr(khr > 0 ? String(khr) : '')
    setError('')
  }

  function choose(service: ServiceOffering) {
    if (!(service.price > 0)) {
      if (canPrice) {
        openPricing(service)
      } else setError('A manager needs to set this service price before it can be charged.')
      return
    }
    setSelected(service)
    setChargeCurrency(service.currency)
    setDiscount('0')
    setDiscountType('AMOUNT')
    setWarrantyDays('0')
    setChargeOpen(true)
    setError('')
  }

  function openCharge() {
    setError('')
    setChargeOpen(true)
  }

  function closeCharge() {
    if (busy) return
    setChargeOpen(false)
    setSelected(null)
    setWarrantyDays('0')
    setError('')
  }

  function closePricing() {
    if (busy) return
    setPricing(null)
    setError('')
  }

  async function savePrice(event: FormEvent) {
    event.preventDefault()
    if (submittingRef.current || busy || !pricing) return
    submittingRef.current = true
    setBusy(true)
    setError('')
    try {
      const result = await api<{ service: ServiceOffering }>(`/services/catalog/${pricing._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          price: Number((priceCurrency === 'USD' ? priceUsd : priceKhr).replaceAll(',', '')),
          currency: priceCurrency,
          priceUsd: Number(priceUsd.replaceAll(',', '')),
          priceKhr: Number(priceKhr.replaceAll(',', '')),
          pricingExchangeRate: serviceExchangeRate,
        }),
      })
      setServices((items) => items.map((item) => item._id === result.service._id ? result.service : item))
      setPricing(null)
      setSelected(result.service.price > 0 ? result.service : null)
      setChargeOpen(result.service.price > 0)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save the service price')
    } finally {
      submittingRef.current = false
      setBusy(false)
    }
  }

  async function recordCharge(event: FormEvent) {
    event.preventDefault()
    if (submittingRef.current || busy || !selected || !(selected.price > 0)) return
    const warrantyDayCount = Number(warrantyDays)
    if (warrantyDays.trim() === '' || !Number.isInteger(warrantyDayCount) || warrantyDayCount < 0 || warrantyDayCount > 3650) {
      setError('Warranty days must be a whole number from 0 to 3650')
      return
    }
    submittingRef.current = true
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
          currency: chargeCurrency,
          discount: discountType === 'PERCENT' ? discountPercent : normalizedDiscount,
          discountType,
          paymentMethod,
          warrantyDays: warrantyDayCount,
          notes,
        }),
      })
      setCharges((items) => [result.charge, ...items])
      setSuccess(result.charge)
      setChargeOpen(false)
      setSelected(null)
      setCustomerId('')
      setWalkInName('')
      setQuantity(1)
      setDiscount('0')
      setDiscountType('AMOUNT')
      setChargeCurrency('USD')
      setPaymentMethod('CASH')
      setWarrantyDays('0')
      setNotes('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to record this service')
    } finally {
      submittingRef.current = false
      setBusy(false)
    }
  }

  async function createReceipt() {
    if (receiptSubmittingRef.current || busy || !success) return
    receiptSubmittingRef.current = true
    setBusy(true)
    setError('')
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
      receiptSubmittingRef.current = false
      setBusy(false)
    }
  }

  function closeChargeDetail() {
    if (correctionBusy) return
    setSelectedCharge(null)
    setEditingChargeCorrection(false)
    setCorrectionError('')
  }

  function openChargeCorrection() {
    if (!selectedCharge || !canPrice || selectedCharge.status !== 'COMPLETED') return
    setCorrectionWarrantyDays(String(Number(selectedCharge.warrantyDays || 0)))
    setCorrectionNotes(selectedCharge.notes || '')
    setCorrectionReason('')
    setCorrectionError('')
    setEditingChargeCorrection(true)
  }

  function cancelChargeCorrection() {
    if (correctionBusy) return
    setEditingChargeCorrection(false)
    setCorrectionError('')
  }

  async function saveChargeCorrection(event: FormEvent) {
    event.preventDefault()
    if (!selectedCharge || correctionBusy) return
    const nextWarrantyDays = Number(correctionWarrantyDays)
    if (!Number.isInteger(nextWarrantyDays) || nextWarrantyDays < 0 || nextWarrantyDays > 3650) {
      setCorrectionError('Warranty days must be a whole number from 0 to 3650')
      return
    }
    if (correctionReason.trim().length < 3) {
      setCorrectionError('Enter a correction reason')
      return
    }

    setCorrectionBusy(true)
    setCorrectionError('')
    try {
      const result = await api<{ charge: ServiceCharge }>(`/services/charges/${selectedCharge._id}/correction`, {
        method: 'PATCH',
        body: JSON.stringify({
          warrantyDays: nextWarrantyDays,
          notes: correctionNotes,
          correctionReason,
        }),
      })
      setCharges((current) => current.map((charge) => charge._id === result.charge._id ? result.charge : charge))
      setSearchedCharges((current) => current?.map((charge) => charge._id === result.charge._id ? result.charge : charge) || current)
      setSelectedCharge(result.charge)
      setEditingChargeCorrection(false)
    } catch (reason) {
      setCorrectionError(reason instanceof Error ? reason.message : 'Unable to correct this service charge')
    } finally {
      setCorrectionBusy(false)
    }
  }

  return <div className="service-page">
    <header className="section-header service-page-header">
      <div><span className="eyebrow">Customer services</span><h2>Service charges</h2><p>Charge for account setup, phone assistance, data transfer, and other work without changing stock.</p></div>
      <div className="service-header-actions">
        <button className="ghost-button" type="button" onClick={() => go('/reports/services')}><FileText size={16} /> Service report</button>
        <button className="primary-button" type="button" onClick={openCharge}><CircleDollarSign size={17} /> Record charge</button>
      </div>
    </header>

    {error && !chargeOpen && !pricing && !success && <div className="service-alert" role="alert"><AlertTriangle size={17} /><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss message"><X size={15} /></button></div>}

    <div className="service-layout">
      <main className="service-catalogue">
        <section className="service-workflow" aria-label="How to record a service charge">
          <div><span>1</span><p><strong>Choose a service</strong><small>Select a priced service below.</small></p></div>
          <div><span>2</span><p><strong>Add customer</strong><small>Use a saved profile or walk-in.</small></p></div>
          <div><span>3</span><p><strong>Record payment</strong><small>Confirm the total and payment method.</small></p></div>
        </section>
        <FilterToolbar
          className="surface-card service-catalogue-tools"
          search={search}
          onSearchChange={setSearch}
          searchLabel="Search services"
          placeholder="Search services"
        >
          <select className="ghost-button filter-select" value={category} onChange={(event) => setCategory(event.target.value as 'ALL' | ServiceCategory)} aria-label="Service category">
            <option value="ALL">All categories</option>
            {Object.entries(categoryDetails).map(([value, detail]) => <option value={value} key={value}>{detail.label}</option>)}
          </select>
        </FilterToolbar>

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
              <footer className={`service-card-footer ${unpriced ? 'is-unpriced' : 'is-priced'}`}>
                {unpriced ? <><span className="service-price-missing"><AlertTriangle size={13} /> Price needed</span><button type="button" className="service-set-price" onClick={() => choose(service)}>{canPrice ? 'Set price' : 'Needs price'} <ArrowRight size={13} /></button></> : <><span><small>Standard price</small><strong>{money(service.price, service.currency)}</strong></span><div className="service-priced-actions">{canPrice && <button type="button" className="service-change-price" onClick={() => openPricing(service)} aria-label={`Change price for ${service.name}`}><Pencil size={13} /><span>Change price</span></button>}<button type="button" className="service-record-button" onClick={() => choose(service)}>Charge <ArrowRight size={13} /></button></div></>}
              </footer>
            </article>
          })}
          {!filtered.length && <div className="surface-card service-empty"><Search size={24} /><strong>No services found</strong><p>Try another search or category.</p></div>}
        </section>}

        <section className="surface-card service-recent">
          <header><div><span className="eyebrow">Latest work</span><h3>Recent service charges</h3></div><button className="text-button" type="button" onClick={() => go('/reports/services')}>View report <ArrowRight size={14} /></button></header>
          <FilterToolbar
            className="service-recent-tools"
            search={chargeSearch}
            onSearchChange={setChargeSearch}
            searchLabel="Search service charges"
            placeholder="Search charge, service, customer, or phone"
          >
            {chargeSearch && <button className="icon-button" type="button" onClick={() => setChargeSearch('')} aria-label="Clear service charge search"><X size={16} /></button>}
          </FilterToolbar>
          {chargeSearchError && <p className="service-recent-error" role="alert">{chargeSearchError}</p>}
          <div className="service-recent-list">
            {visibleCharges.map((charge) => <article key={charge._id}>
              <span className="service-recent-icon"><ReceiptText size={17} /></span>
              <p><strong>{charge.serviceSnapshot.name}</strong><small>{charge.customerSnapshot.name} · {charge.serviceNo}</small></p>
              <span className="service-recent-amount"><strong>{money(charge.total, charge.currency)}</strong><small>{dateText(charge.completedAt)}</small></span>
              <button className="icon-button" type="button" onClick={() => setSelectedCharge(charge)} aria-label={`View ${charge.serviceNo}`}><MoreHorizontal size={18} /></button>
            </article>)}
            {chargeSearchBusy && <LoadingState compact label="Searching service charges" />}
            {!chargeSearchBusy && !visibleCharges.length && !loading && <div className="service-empty compact"><Clock3 size={22} /><strong>{chargeSearch ? 'No matching service charges' : 'No service charges yet'}</strong><p>{chargeSearch ? 'Try a different reference, service, customer, or phone.' : 'Your completed service work will appear here.'}</p></div>}
          </div>
        </section>
      </main>

    </div>

    {selectedCharge && <DetailModalShell onClose={closeChargeDetail} titleId="service-charge-detail-title" className={`service-charge-detail-modal ${editingChargeCorrection ? 'service-charge-correction-mode' : ''}`}>
      <DetailModalHeader
        eyebrow={editingChargeCorrection ? 'Update service charge' : 'Service charge'}
        title={selectedCharge.serviceNo}
        titleId="service-charge-detail-title"
        description={editingChargeCorrection ? 'Change the warranty or work note, then explain why.' : `${selectedCharge.serviceSnapshot.name} · ${dateText(selectedCharge.completedAt)}`}
        onClose={closeChargeDetail}
      />
      {editingChargeCorrection ? <form className="service-charge-correction-form" onSubmit={saveChargeCorrection}>
        <DetailModalBody className="service-charge-correction-body">
          <div className="service-charge-correction-lock-note">
            <strong>You can update the warranty and work note</strong>
            <p>Customer, service, quantity, price, discount, payment, and completion date stay locked.</p>
          </div>
          {correctionError && <div className="service-charge-correction-error" role="alert">{correctionError}</div>}
          <WarrantyPeriodField value={correctionWarrantyDays} onChange={setCorrectionWarrantyDays} kind="service" />
          <label className="service-charge-correction-field">
            <span>Work note <small>Optional</small></span>
            <textarea maxLength={500} value={correctionNotes} onChange={(event) => setCorrectionNotes(event.target.value)} placeholder="What was completed for the customer?" />
          </label>
          <label className="service-charge-correction-field">
            <span>Why are you making this change? <small>Required · staff audit only</small></span>
            <textarea required minLength={3} maxLength={500} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="Example: Warranty was missed when this charge was recorded" />
            <small className="service-charge-correction-help">This reason is saved in the staff audit history and is not printed on the customer receipt.</small>
          </label>
        </DetailModalBody>
        <DetailModalFooter
          transactionActions={<button className="primary-button" type="submit" disabled={correctionBusy}>{correctionBusy ? 'Saving changes...' : 'Save changes'}</button>}
          dismissAction={<button className="ghost-button" type="button" onClick={cancelChargeCorrection} disabled={correctionBusy}>Cancel</button>}
        />
      </form> : <>
        <DetailModalBody>
          <div className="detail-grid">
            <div><span>Customer</span><strong>{selectedCharge.customerSnapshot.name}</strong></div>
            <div><span>Phone</span><strong>{selectedCharge.customerSnapshot.phone || 'Not recorded'}</strong></div>
            <div><span>Service</span><strong>{selectedCharge.serviceSnapshot.name}</strong></div>
            <div><span>Quantity</span><strong>{selectedCharge.quantity ?? 1}</strong></div>
            <div><span>Unit price</span><strong>{selectedCharge.unitPrice === undefined ? 'Not recorded' : money(selectedCharge.unitPrice, selectedCharge.currency)}</strong></div>
            <div><span>Subtotal</span><strong>{selectedCharge.subtotal === undefined ? 'Not recorded' : money(selectedCharge.subtotal, selectedCharge.currency)}</strong></div>
            <div><span>Discount</span><strong>{money(selectedCharge.discount ?? 0, selectedCharge.currency)}{selectedCharge.discountType === 'PERCENT' && selectedCharge.discountPercent !== undefined ? ` (${selectedCharge.discountPercent}%)` : ''}</strong></div>
            <div><span>Total paid</span><strong>{money(selectedCharge.total, selectedCharge.currency)}</strong></div>
            <div><span>Payment method</span><strong>{titleCase(selectedCharge.paymentMethod)}</strong></div>
            <div><span>Warranty</span><strong>{selectedCharge.warrantyDays ? `${selectedCharge.warrantyDays} days` : 'No warranty'}</strong></div>
            {Boolean(selectedCharge.warrantyDays) && <div><span>Warranty expires</span><strong>{dateText(selectedCharge.warrantyExpiresAt)}</strong></div>}
            <div><span>Status</span><strong>{titleCase(selectedCharge.status)}</strong></div>
          </div>
          {Number(selectedCharge.correctionVersion || 0) > 0 && <div className="service-charge-correction-history" role="status"><Pencil size={16} /><div><strong>Service details corrected</strong><small>Revision {selectedCharge.correctionVersion}{selectedCharge.lastCorrectedAt ? ` · ${dateText(selectedCharge.lastCorrectedAt)}` : ''}{selectedCharge.lastCorrectedBy?.name ? ` · ${selectedCharge.lastCorrectedBy.name}` : ''}</small></div></div>}
          {selectedCharge.notes && <div className="detail-note"><span className="eyebrow">Work note</span><p>{selectedCharge.notes}</p></div>}
        </DetailModalBody>
        <DetailModalFooter
          utilityActions={<button className="secondary-button" type="button" onClick={() => printChargeReceipt(selectedCharge)}><Printer size={16} /> Print receipt</button>}
          secondaryActions={canPrice && selectedCharge.status === 'COMPLETED' ? <button className="secondary-button" type="button" onClick={openChargeCorrection}><Pencil size={15} /> Edit warranty &amp; note</button> : undefined}
          dismissAction={<button className="ghost-button" type="button" onClick={closeChargeDetail}>Close</button>}
        />
      </>}
    </DetailModalShell>}

    {chargeOpen && (
      <OperationModalShell
        title="Record service charge"
        eyebrow="Service checkout"
        description={selected ? `${selected.name} · ${money(unitPrice, chargeCurrency)}` : 'Choose a priced service to begin.'}
        icon={<CircleDollarSign size={21} />}
        error={error}
        onDismissError={() => setError('')}
        busy={busy}
        onClose={closeCharge}
        closeAriaLabel="Close service checkout"
        className="operation-modal-service-charge"
      >
        {selected ? (
          <form className="service-charge-form" onSubmit={recordCharge}>
            <div className="service-charge-body">
              <label>
                <span>Customer</span>
                <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                  <option value="">Walk-in customer</option>
                  {customers.map((customer) => (
                    <option value={customer._id} key={customer._id}>
                      {customer.name}{customer.phone ? ` · ${customer.phone}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              {!customerId && (
                <label>
                  <span>Customer name <small>Optional</small></span>
                  <input
                    value={walkInName}
                    onChange={(event) => setWalkInName(event.target.value)}
                    placeholder="Walk-in customer"
                  />
                </label>
              )}
              <div className="service-form-pair">
                <label>
                  <span>Currency</span>
                  <select
                    value={chargeCurrency}
                    onChange={(event) => {
                      setChargeCurrency(event.target.value as Currency)
                      setDiscount('0')
                    }}
                  >
                    <option value="USD">USD — US Dollar</option>
                    <option value="KHR">KHR — Cambodian Riel</option>
                  </select>
                  <small className="service-field-help">1 USD = {serviceExchangeRate.toLocaleString('en-US')} KHR</small>
                </label>
                <label>
                  <span>Quantity</span>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={quantity}
                    onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                  />
                  <small className="service-field-help">{money(unitPrice, chargeCurrency)} each</small>
                </label>
              </div>
              <div className="service-form-pair">
                <div className="service-discount-mode">
                  <span>Discount method</span>
                  <div role="group" aria-label="Discount method">
                    <button
                      type="button"
                      className={discountType === 'AMOUNT' ? 'selected' : ''}
                      onClick={() => {
                        setDiscountType('AMOUNT')
                        setDiscount('0')
                      }}
                    >
                      Money
                    </button>
                    <button
                      type="button"
                      className={discountType === 'PERCENT' ? 'selected' : ''}
                      onClick={() => {
                        setDiscountType('PERCENT')
                        setDiscount('0')
                      }}
                    >
                      Percent
                    </button>
                  </div>
                </div>
                <label>
                  <span>{discountType === 'PERCENT' ? 'Discount (%)' : `Discount (${chargeCurrency})`}</span>
                  {discountType === 'PERCENT' ? (
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      inputMode="decimal"
                      value={discount}
                      onChange={(event) => setDiscount(event.target.value.replace(/[^\d.]/g, ''))}
                      placeholder="0"
                    />
                  ) : (
                    <MoneyInput
                      currency={chargeCurrency}
                      minimum={0}
                      maximum={subtotal}
                      value={discount}
                      onValueChange={setDiscount}
                      placeholder={chargeCurrency === 'KHR' ? '0' : '0.00'}
                    />
                  )}
                  <small className="service-field-help">
                    {discountType === 'PERCENT'
                      ? `${discountPercent}% = ${money(normalizedDiscount, chargeCurrency)}`
                      : `Maximum ${money(subtotal, chargeCurrency)}`}
                  </small>
                </label>
              </div>
              <div className="service-form-pair">
                <label>
                  <span>Payment method</span>
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                    <option value="CASH">Cash</option>
                    <option value="KHQR">KHQR</option>
                    <option value="BANK">Bank transfer</option>
                    <option value="CARD">Card</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <WarrantyPeriodField value={warrantyDays} onChange={setWarrantyDays} kind="service" />
              </div>
              <label>
                <span>Work note <small>Optional</small></span>
                <textarea
                  maxLength={500}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="What was completed for the customer?"
                />
              </label>
              <div className="service-security-note">
                <ShieldCheck size={16} />
                <span>
                  <strong>Protect customer access</strong>
                  <span>Never store passwords or verification codes.</span>
                </span>
              </div>
              <dl className="service-total">
                <div><dt>Subtotal</dt><dd>{money(subtotal, chargeCurrency)}</dd></div>
                {normalizedDiscount > 0 && <div><dt>Discount</dt><dd>− {money(normalizedDiscount, chargeCurrency)}</dd></div>}
                <div><dt>Total</dt><dd>{money(total, chargeCurrency)}</dd></div>
              </dl>
            </div>
            <footer className="operation-modal-actions service-charge-actions">
              <button className="primary-button service-complete" disabled={busy} type="submit">
                <CreditCard size={16} />{busy ? 'Saving…' : 'Record charge'}
              </button>
            </footer>
          </form>
        ) : (
          <div className="service-charge-body service-panel-empty service-service-picker">
            <div className="service-picker-heading">
              <span className="service-picker-icon"><MessageCircle size={19} /></span>
              <div>
                <span className="eyebrow">Start a charge</span>
                <strong>What service did you complete?</strong>
                <p>Choose a priced service to add the customer and payment.</p>
              </div>
            </div>
            {pricedServices.length ? (
              <label className="service-picker-select">
                <span>Choose from {pricedServices.length} priced service{pricedServices.length === 1 ? '' : 's'}</span>
                <select
                  autoFocus
                  value=""
                  onChange={(event) => {
                    const service = pricedServices.find((item) => item._id === event.target.value)
                    if (service) choose(service)
                  }}
                  aria-label="Service to charge"
                >
                  <option value="">Select service</option>
                  {pricedServices.map((service) => (
                    <option value={service._id} key={service._id}>
                      {service.name} · {money(service.price, service.currency)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="service-picker-unpriced">
                <AlertTriangle size={17} />
                <span>
                  <strong>No priced services yet</strong>
                  <small>Set a catalogue price before recording a service charge.</small>
                </span>
              </div>
            )}
          </div>
        )}
      </OperationModalShell>
    )}

    {pricing && (
      <OperationModalShell
        title="Set service price"
        eyebrow="Catalogue pricing"
        description={pricing.name}
        icon={<Banknote size={20} />}
        error={error}
        onDismissError={() => setError('')}
        busy={busy}
        onClose={closePricing}
        closeAriaLabel="Close pricing"
        className="operation-modal-service-price"
      >
        <form className="service-price-form" onSubmit={savePrice}>
          <div className="service-price-body">
            <div className="service-price-heading">
              <div>
                <span className="eyebrow">Two-currency price</span>
                <p>Enter either amount; the matching price updates automatically.</p>
              </div>
              <small>1 USD = {serviceExchangeRate.toLocaleString('en-US')} KHR</small>
            </div>
            <div className="service-price-columns">
              <section className={`service-currency-price ${priceCurrency === 'USD' ? 'is-default' : ''}`}>
                <header>
                  <span className="service-currency-mark">$</span>
                  <div><strong>US Dollar</strong><small>USD</small></div>
                  <label className="service-default-currency">
                    <input
                      type="radio"
                      name="service-price-currency"
                      checked={priceCurrency === 'USD'}
                      onChange={() => setPriceCurrency('USD')}
                    />
                    <span>Checkout default</span>
                  </label>
                </header>
                <label>
                  <span>Standard price</span>
                  <div className="service-price-input">
                    <span>$</span>
                    <MoneyInput
                      autoFocus
                      currency="USD"
                      minimum={0.01}
                      required
                      value={priceUsd}
                      onValueChange={(value) => { setPriceUsd(value); setPriceKhr(usdToKhr(value)) }}
                      placeholder="2.50"
                      aria-label="Service price in US dollars"
                    />
                  </div>
                </label>
              </section>
              <section className={`service-currency-price ${priceCurrency === 'KHR' ? 'is-default' : ''}`}>
                <header>
                  <span className="service-currency-mark">៛</span>
                  <div><strong>Cambodian Riel</strong><small>KHR</small></div>
                  <label className="service-default-currency">
                    <input
                      type="radio"
                      name="service-price-currency"
                      checked={priceCurrency === 'KHR'}
                      onChange={() => setPriceCurrency('KHR')}
                    />
                    <span>Checkout default</span>
                  </label>
                </header>
                <label>
                  <span>Standard price</span>
                  <div className="service-price-input">
                    <span>៛</span>
                    <MoneyInput
                      currency="KHR"
                      minimum={100}
                      required
                      value={priceKhr}
                      onValueChange={(value) => { setPriceKhr(value); setPriceUsd(khrToUsd(value)) }}
                      placeholder="10,000"
                      aria-label="Service price in Cambodian riel"
                    />
                  </div>
                </label>
              </section>
            </div>
            <p className="service-price-help">The selected default currency is used when staff record this service charge.</p>
          </div>
          <footer className="operation-modal-actions service-price-actions">
            <button className="ghost-button" type="button" onClick={closePricing} disabled={busy}>Cancel</button>
            <button
              className="primary-button"
              disabled={busy || !(Number(priceUsd) > 0) || !(Number(priceKhr) > 0)}
              type="submit"
            >
              Save price
            </button>
          </footer>
        </form>
      </OperationModalShell>
    )}

    {success && <div className="service-modal-backdrop">
      <section className="surface-card service-success-modal" role="dialog" aria-modal="true" aria-labelledby="service-success-title">
        <span className="service-success-icon"><CheckCircle2 size={28} /></span><span className="eyebrow">Service charge saved</span><h3 id="service-success-title">{success.serviceSnapshot.name} completed</h3><p>{success.customerSnapshot.name} · {money(success.total, success.currency)}</p>
        {error && <div className="service-alert" role="alert"><AlertTriangle size={17} /><span>{error}</span></div>}
        <div><button className="ghost-button" type="button" disabled={busy} onClick={() => { if (!receiptSubmittingRef.current) { setError(''); setSuccess(null) } }}>Done</button><button className="primary-button" type="button" disabled={busy} onClick={() => void createReceipt()}><ReceiptText size={16} /> Create receipt</button></div>
      </section>
    </div>}
  </div>
}
