import { useEffect, useState } from 'react'
import { Barcode, Grid2X2, List, MoreHorizontal, Package, Plus, ScanLine, Search, Smartphone, Wrench, X, type LucideIcon } from 'lucide-react'
import { api } from '../../lib/api'
import type { InventoryItem, Pawn } from '../../types/domain'
import { currency, money, riel, inventoryPriceCurrency, inventoryPriceText, inventoryDualPriceText, useExchangeRate, dateText, titleStatus, comingNext } from '../../lib/presentation'
import LoadingState from '../../components/LoadingState'
import MoneyInput from '../../components/MoneyInput'
import SectionHeader from '../../components/SectionHeader'
import StatusBadge from '../../components/StatusBadge'
import SummaryStats from '../../components/SummaryStats'
import { getStoredInventoryView, setStoredInventoryView } from '../../lib/storage'
import { printInventoryLabel } from './barcode'
import './inventory-page.css'

const categoryMeta: Record<InventoryItem['category'], { label: string; tone: 'violet' | 'blue' | 'orange'; Icon: LucideIcon; fallback: string }> = {
  PHONE: { label: 'Phones', tone: 'violet', Icon: Smartphone, fallback: 'Phone' },
  TABLET: { label: 'Tablets', tone: 'violet', Icon: Smartphone, fallback: 'Tab' },
  ACCESSORY: { label: 'Accessories', tone: 'blue', Icon: Package, fallback: 'Acc' },
  SPARE_PART: { label: 'Spare parts', tone: 'orange', Icon: Wrench, fallback: 'Part' },
  OTHER: { label: 'Other', tone: 'blue', Icon: Package, fallback: 'Item' },
}

function inventorySubtitle(item: InventoryItem) {
  return [item.brand, item.model, item.storage, item.ram && `${item.ram} RAM`, item.color].filter(Boolean).join(' · ') || item.sku
}

function inventoryDetails(item: InventoryItem) {
  const accessoryDetails = item.category === 'ACCESSORY' || item.category === 'SPARE_PART'
    ? [item.compatibleModels?.join(', '), item.oemQuality].filter(Boolean).join(' · ')
    : ''
  return accessoryDetails || [item.condition && titleStatus(item.condition), item.batteryHealth !== undefined && `Battery ${item.batteryHealth}%`, item.imei1 || item.serialNumber].filter(Boolean).join(' · ')
}

function InventoryPhoto({ item, size = 'normal' }: { item: InventoryItem; size?: 'small' | 'normal' | 'large' }) {
  const meta = categoryMeta[item.category] || categoryMeta.OTHER
  const Icon = meta.Icon
  return (
    <span className={`inventory-photo inventory-photo-${size} ${item.imageUrl ? 'has-image' : `fallback-${meta.tone}`}`}>
      {item.imageUrl
        ? <img src={item.imageUrl} alt={item.name} loading="lazy" />
        : <><Icon size={size === 'small' ? 16 : size === 'large' ? 28 : 20} /><small>{meta.fallback}</small></>}
    </span>
  )
}

export default function InventoryView() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [editingPrice, setEditingPrice] = useState(false)
  const [usdSellingPriceDraft, setUsdSellingPriceDraft] = useState('')
  const [usdMinimumPriceDraft, setUsdMinimumPriceDraft] = useState('')
  const [khrSellingPriceDraft, setKhrSellingPriceDraft] = useState('')
  const [khrMinimumPriceDraft, setKhrMinimumPriceDraft] = useState('')
  const [priceCurrency, setPriceCurrency] = useState<'USD' | 'KHR'>('USD')
  const [savingPrice, setSavingPrice] = useState(false)
  const [savingPhoto, setSavingPhoto] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [inventoryView, setInventoryView] = useState<'large' | 'details'>(getStoredInventoryView)
  const [error, setError] = useState('')
  const exchangeRate = useExchangeRate()
  const usdKhrRate = Number(exchangeRate?.usdKhr) > 0 ? Number(exchangeRate?.usdKhr) : 4100

  useEffect(() => {
    api<{ items: InventoryItem[] }>('/inventory')
      .then((result) => setItems(Array.isArray(result?.items) ? result.items : []))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    function openScannedStock(event: Event) {
      const detail = (event as CustomEvent<{ item?: InventoryItem }>).detail
      const item = detail?.item
      if (!item?._id) return
      setItems((current) => current.some((row) => row._id === item._id)
        ? current.map((row) => row._id === item._id ? item : row)
        : [item, ...current])
      setSearch('')
      setCategoryFilter('ALL')
      setStatusFilter('ALL')
      setEditingPrice(false)
      setSelectedItem(item)
    }

    window.addEventListener('phoneflow:open-stock-item', openScannedStock)
    return () => window.removeEventListener('phoneflow:open-stock-item', openScannedStock)
  }, [])

  const phoneCount = items.filter((item) => item.category === 'PHONE').reduce((sum, item) => sum + item.quantity, 0)
  const tabletCount = items.filter((item) => item.category === 'TABLET').reduce((sum, item) => sum + item.quantity, 0)
  const accessoryCount = items.filter((item) => item.category === 'ACCESSORY').reduce((sum, item) => sum + item.quantity, 0)
  const sparePartCount = items.filter((item) => item.category === 'SPARE_PART').reduce((sum, item) => sum + item.quantity, 0)
  const otherCount = items.filter((item) => item.category === 'OTHER').reduce((sum, item) => sum + item.quantity, 0)
  const categoryCounts: Record<InventoryItem['category'], number> = {
    PHONE: phoneCount,
    TABLET: tabletCount,
    ACCESSORY: accessoryCount,
    SPARE_PART: sparePartCount,
    OTHER: otherCount,
  }
  const filteredItems = items.filter((item) => {
    const term = search.trim().toLowerCase()
    const matchesSearch = !term || [item.sku, item.barcode, item.name, item.brand, item.model, item.imei1, item.serialNumber]
      .some((value) => String(value || '').toLowerCase().includes(term))
    return matchesSearch
      && (categoryFilter === 'ALL' || item.category === categoryFilter)
      && (statusFilter === 'ALL' || item.status === statusFilter)
  })

  function changeInventoryView(view: 'large' | 'details') {
    setInventoryView(view)
    setStoredInventoryView(view)
  }

  function openPriceEditor() {
    if (!selectedItem) return
    const currency = inventoryPriceCurrency(selectedItem)
    const usdSellPrice = Number(selectedItem.sellPrice) || 0
    const usdMinimumPrice = Number(selectedItem.minimumSellPrice) || 0
    const savedKhrSellPrice = Number(selectedItem.khrSellPrice)
    const savedKhrMinimumPrice = Number(selectedItem.khrMinimumSellPrice)
    const legacyKhrSellPrice = currency === 'KHR' ? Number(selectedItem.listedSellPrice) : Number.NaN
    const legacyKhrMinimumPrice = currency === 'KHR' ? Number(selectedItem.listedMinimumSellPrice) : Number.NaN
    const khrSellPrice = Number.isFinite(savedKhrSellPrice)
      ? savedKhrSellPrice
      : Number.isFinite(legacyKhrSellPrice)
        ? legacyKhrSellPrice
        : Math.round((usdSellPrice * usdKhrRate) / 100) * 100
    const khrMinimumPrice = Number.isFinite(savedKhrMinimumPrice)
      ? savedKhrMinimumPrice
      : Number.isFinite(legacyKhrMinimumPrice)
        ? legacyKhrMinimumPrice
        : Math.round((usdMinimumPrice * usdKhrRate) / 100) * 100
    const displayedUsdSellPrice = usdSellPrice > 0
      ? usdSellPrice
      : khrSellPrice > 0
        ? Math.round((khrSellPrice / usdKhrRate) * 100) / 100
        : 0
    const displayedUsdMinimumPrice = usdMinimumPrice > 0
      ? usdMinimumPrice
      : khrMinimumPrice > 0
        ? Math.round((khrMinimumPrice / usdKhrRate) * 100) / 100
        : 0
    setPriceCurrency(currency)
    setUsdSellingPriceDraft(displayedUsdSellPrice > 0 ? String(displayedUsdSellPrice) : '')
    setUsdMinimumPriceDraft(displayedUsdMinimumPrice > 0 ? String(displayedUsdMinimumPrice) : '')
    setKhrSellingPriceDraft(khrSellPrice > 0 ? String(khrSellPrice) : '')
    setKhrMinimumPriceDraft(khrMinimumPrice > 0 ? String(khrMinimumPrice) : '')
    setError('')
    setEditingPrice(true)
  }

  function usdPriceToKhr(value: string) {
    if (value === '') return ''
    return String(Math.round((Number(value || 0) * usdKhrRate) / 100) * 100)
  }

  function khrPriceToUsd(value: string) {
    if (value === '') return ''
    return String(Math.round((Number(value || 0) / usdKhrRate) * 100) / 100)
  }

  function changeUsdSellingPrice(value: string) {
    setUsdSellingPriceDraft(value)
    setKhrSellingPriceDraft(usdPriceToKhr(value))
  }

  function changeUsdMinimumPrice(value: string) {
    setUsdMinimumPriceDraft(value)
    setKhrMinimumPriceDraft(usdPriceToKhr(value))
  }

  function changeKhrSellingPrice(value: string) {
    setKhrSellingPriceDraft(value)
    setUsdSellingPriceDraft(khrPriceToUsd(value))
  }

  function changeKhrMinimumPrice(value: string) {
    setKhrMinimumPriceDraft(value)
    setUsdMinimumPriceDraft(khrPriceToUsd(value))
  }

  function changePriceCurrency(currency: 'USD' | 'KHR') {
    setPriceCurrency(currency)
    setError('')
  }

  async function saveSellingPrice() {
    if (!selectedItem) return
    const usdSellingPrice = Number(usdSellingPriceDraft || 0)
    const usdMinimumPrice = Number(usdMinimumPriceDraft || 0)
    const khrSellingPrice = Number(khrSellingPriceDraft || 0)
    const khrMinimumPrice = Number(khrMinimumPriceDraft || 0)
    if ([usdSellingPrice, usdMinimumPrice, khrSellingPrice, khrMinimumPrice].some((price) => !Number.isFinite(price) || price < 0)) {
      setError('Selling prices must be valid positive amounts or zero')
      return
    }
    if (usdMinimumPrice > usdSellingPrice || khrMinimumPrice > khrSellingPrice) {
      setError('The minimum price cannot exceed the regular price in either currency')
      return
    }
    if (!Number.isInteger(khrSellingPrice) || khrSellingPrice % 100 !== 0 || !Number.isInteger(khrMinimumPrice) || khrMinimumPrice % 100 !== 0) {
      setError('KHR prices must use whole 100 KHR increments')
      return
    }
    setSavingPrice(true)
    setError('')
    try {
      const result = await api<{ item: InventoryItem }>(`/inventory/${selectedItem._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          sellPriceUsd: usdSellingPrice,
          minimumSellPriceUsd: usdMinimumPrice,
          sellPriceKhr: khrSellingPrice,
          minimumSellPriceKhr: khrMinimumPrice,
          currency: priceCurrency,
          exchangeRate: usdKhrRate,
        }),
      })
      setSelectedItem(result.item)
      setItems((current) => current.map((item) => item._id === result.item._id ? result.item : item))
      setEditingPrice(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update selling price')
    } finally {
      setSavingPrice(false)
    }
  }

  function updateInventoryItem(item: InventoryItem) {
    setSelectedItem(item)
    setItems((current) => current.map((row) => row._id === item._id ? item : row))
  }

  async function uploadPhoto(file: File | undefined) {
    if (!selectedItem || !file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Upload a JPEG, PNG, or WebP image')
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      setError('Image must be 4MB or smaller')
      return
    }
    setSavingPhoto(true)
    setError('')
    try {
      const imageData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('Unable to read image file'))
        reader.readAsDataURL(file)
      })
      const result = await api<{ item: InventoryItem }>(`/inventory/${selectedItem._id}/photo`, {
        method: 'POST',
        body: JSON.stringify({ imageData }),
      })
      updateInventoryItem(result.item)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to upload product photo')
    } finally {
      setSavingPhoto(false)
    }
  }

  async function removePhoto() {
    if (!selectedItem) return
    setSavingPhoto(true)
    setError('')
    try {
      const result = await api<{ item: InventoryItem }>(`/inventory/${selectedItem._id}/photo`, { method: 'DELETE' })
      updateInventoryItem(result.item)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to remove product photo')
    } finally {
      setSavingPhoto(false)
    }
  }

  return (
    <>
      <div className="stock-page-heading">
        <SectionHeader
          eyebrow="Stock control"
          title="Stock information"
          description={error || 'Manage serialized phones and quantity-based tablets, accessories, spare parts, and other stock.'}
          action={<div className="section-header-actions">
            <button className="secondary-button" onClick={() => window.dispatchEvent(new Event('phoneflow:open-scanner'))}><ScanLine size={17} /> Scan product</button>
            <button className="primary-button" onClick={() => comingNext('Adjust stock')}><Plus size={17} /> Adjust stock</button>
          </div>}
        />
      </div>
      <SummaryStats
        label="Inventory categories"
        variant="compact"
        columns={5}
        items={(Object.keys(categoryMeta) as InventoryItem['category'][]).map((category) => {
          const meta = categoryMeta[category]
          return {
            key: category,
            label: meta.label,
            value: categoryCounts[category] ?? 0,
            detail: 'live stock units',
            icon: meta.Icon,
            tone: meta.tone,
            active: categoryFilter === category,
            onClick: () => setCategoryFilter((current) => current === category ? 'ALL' : category),
            ariaLabel: `Filter by ${meta.label}`,
          }
        })}
      />
      <section className="surface-card inventory-catalog-card stock-workspace-card">
        <div className="card-heading table-heading inventory-catalog-heading">
          <div><span className="eyebrow">Item list</span><h3>{categoryFilter === 'ALL' ? 'All shop products' : categoryMeta[categoryFilter as InventoryItem['category']]?.label}</h3></div>
          <div className="inventory-heading-actions">
            <span className="catalog-count">{filteredItems.length} item{filteredItems.length === 1 ? '' : 's'}</span>
            <div className="inventory-view-switcher" role="group" aria-label="Inventory view">
              <button type="button" className={inventoryView === 'large' ? 'active' : ''} onClick={() => changeInventoryView('large')} aria-pressed={inventoryView === 'large'} title="Large icons view"><Grid2X2 size={15} /><span>Large</span></button>
              <button type="button" className={inventoryView === 'details' ? 'active' : ''} onClick={() => changeInventoryView('details')} aria-pressed={inventoryView === 'details'} title="Details view"><List size={16} /><span>Details</span></button>
            </div>
          </div>
        </div>

        <div className="filter-row inventory-filter-row">
          <div className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search SKU, product, IMEI or serial number" /></div>
          <select className="ghost-button filter-select" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filter inventory category">
            <option value="ALL">All categories</option><option value="PHONE">Phones</option><option value="TABLET">Tablets</option><option value="ACCESSORY">Accessories</option><option value="SPARE_PART">Spare parts</option><option value="OTHER">Other</option>
          </select>
          <select className="ghost-button filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter stock status">
            <option value="ALL">All stock statuses</option><option value="IN_STOCK">In stock</option><option value="RESERVED">Reserved</option><option value="SOLD">Sold</option><option value="PAWNED">Pawned</option><option value="REPAIR">Repair</option><option value="ARCHIVED">Archived</option>
          </select>
        </div>

        {inventoryView === 'large' ? (
          <div className="inventory-card-grid">
            {filteredItems.map((item) => (
              <button className="inventory-product-card" key={item._id} onClick={() => setSelectedItem(item)}>
                <InventoryPhoto item={item} size="large" />
                <div>
                  <strong>{item.name}</strong>
                  <small>{inventorySubtitle(item)}</small>
                </div>
                <footer><strong>{item.sellPrice > 0 ? inventoryPriceText(item) : money.format(item.buyPrice)}</strong><small>{item.quantity} in stock</small></footer>
              </button>
            ))}
            {loading && <LoadingState label="Loading inventory" detail="Reading stock counts and product records…" />}
            {!loading && filteredItems.length === 0 && <p className="mobile-record-empty">{items.length === 0 ? 'No inventory in the database yet.' : 'No matching inventory.'}</p>}
          </div>
        ) : (
          <>
            <div className="table-scroll stock-desktop-table">
              <table>
                <thead><tr><th>SKU</th><th>Item</th><th>Category</th><th>Stock</th><th>Buy price</th><th>Sell price</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {filteredItems.map((row) => (
                    <tr key={row._id}>
                      <td><strong className="mono">{row.sku}</strong></td>
                      <td><div className="inventory-table-item"><InventoryPhoto item={row} size="small" /><p><strong>{row.name}</strong><small>{inventorySubtitle(row)}</small></p></div></td>
                      <td>{titleStatus(row.category)}</td>
                      <td><strong>{row.quantity}</strong></td>
                      <td>{money.format(row.buyPrice)}</td>
                      <td>{inventoryPriceText(row)}</td>
                      <td><StatusBadge status={row.status} /></td>
                      <td><button className="icon-button" onClick={() => setSelectedItem(row)} aria-label={`View ${row.sku}`}><MoreHorizontal size={18} /></button></td>
                    </tr>
                  ))}
                  {loading && <tr><td colSpan={8}><LoadingState compact label="Loading inventory" detail="Reading stock counts and product records…" /></td></tr>}
                  {!loading && filteredItems.length === 0 && <tr><td colSpan={8}>{items.length === 0 ? 'No inventory in the database yet.' : 'No matching inventory.'}</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mobile-record-list stock-mobile-list">
              {filteredItems.map((row) => (
                <article className="mobile-record-card" key={row._id}>
                  <div className="mobile-record-heading"><InventoryPhoto item={row} size="small" /><p><strong>{row.name}</strong><small>{row.sku} · {inventorySubtitle(row)}</small></p><StatusBadge status={row.status} /></div>
                  <div className="mobile-record-details">
                    <div><span>Category</span><strong>{titleStatus(row.category)}</strong></div><div><span>In stock</span><strong>{row.quantity}</strong></div><div><span>Sell price</span><strong>{inventoryPriceText(row)}</strong></div>
                    <button className="icon-button" onClick={() => setSelectedItem(row)} aria-label={`View ${row.sku}`}><MoreHorizontal size={18} /></button>
                  </div>
                </article>
              ))}
              {loading && <LoadingState compact label="Loading inventory" />}
              {!loading && filteredItems.length === 0 && <p className="mobile-record-empty">{items.length === 0 ? 'No inventory in the database yet.' : 'No matching inventory.'}</p>}
            </div>
          </>
        )}
      </section>
      {selectedItem && (
        <div className="modal-backdrop inventory-detail-backdrop" role="presentation">
          <section className="detail-modal inventory-detail-modal surface-card" role="dialog" aria-modal="true" aria-labelledby="stock-detail-title" aria-describedby="stock-detail-description">
            <header className="detail-modal-header">
              <InventoryPhoto item={selectedItem} size="large" />
              <div>
                <span className="eyebrow">Stock record</span>
                <h3 id="stock-detail-title">{selectedItem.name}</h3>
                <p id="stock-detail-description">{selectedItem.sku} · {titleStatus(selectedItem.category)}</p>
              </div>
              <button className="icon-button" onClick={() => { setSelectedItem(null); setEditingPrice(false) }} aria-label="Close details"><X size={18} /></button>
            </header>

            <div className="inventory-detail-body">
              <section className="inventory-detail-group inventory-summary-group" aria-labelledby="inventory-summary-title">
                <div className="inventory-detail-section-heading">
                  <div><span className="eyebrow">Overview</span><h4 id="inventory-summary-title">Stock and pricing</h4></div>
                </div>
                <div className="detail-grid">
                  <div className="inventory-status-summary"><span>Status</span><strong><StatusBadge status={selectedItem.status} /></strong>{selectedItem.relatedPawn && <small className="inventory-linked-pawn"><span>Pawn ID</span><b className="mono">{selectedItem.relatedPawn.pawnNo}</b></small>}</div>
                  <div><span>Quantity</span><strong>{selectedItem.quantity}</strong></div>
                  <div><span>Low stock level</span><strong>{selectedItem.reorderLevel}</strong></div>
                  <div><span>Buy price</span><strong>{money.format(selectedItem.buyPrice)}</strong></div>
                  <div><span>Sell price</span><strong>{inventoryDualPriceText(selectedItem)}</strong></div>
                  <div><span>Minimum sell</span><strong>{inventoryDualPriceText(selectedItem, true)}</strong></div>
                  <div><span>Barcode</span><strong className="mono">{selectedItem.barcode || selectedItem.sku}</strong></div>
                  <div><span>Source</span><strong>{selectedItem.source ? titleStatus(selectedItem.source) : 'Not recorded'}</strong></div>
                  <div><span>Created</span><strong>{selectedItem.createdAt ? dateText(selectedItem.createdAt) : 'Not recorded'}</strong></div>
                </div>
              </section>

              <section className="inventory-detail-group inventory-information-group" aria-labelledby="inventory-information-title">
                <div className="inventory-detail-section-heading">
                  <div><span className="eyebrow">Information</span><h4 id="inventory-information-title">Product details</h4></div>
                </div>
                <div className="detail-sections">
                <article>
                  <span className="eyebrow">Product</span>
                  <p><strong>{[selectedItem.brand, selectedItem.model].filter(Boolean).join(' ') || selectedItem.name}</strong></p>
                  <p>{[selectedItem.storage, selectedItem.ram && `${selectedItem.ram} RAM`, selectedItem.color, selectedItem.condition && titleStatus(selectedItem.condition)].filter(Boolean).join(' ') || 'No extra product details'}</p>
                  <p>{selectedItem.batteryHealth !== undefined ? `Battery ${selectedItem.batteryHealth}%` : 'Battery not recorded'}</p>
                </article>
                <article>
                  <span className="eyebrow">Identifiers</span>
                  <p><strong>{selectedItem.imei1 || 'No IMEI 1'}</strong></p>
                  <p>{selectedItem.imei2 || 'No IMEI 2'}</p>
                  <p>{selectedItem.serialNumber || 'No serial number'}</p>
                </article>
                <article>
                  <span className="eyebrow">Accessory info</span>
                  <p><strong>{selectedItem.compatibleModels?.length ? selectedItem.compatibleModels.join(', ') : 'No compatible models recorded'}</strong></p>
                  <p>{selectedItem.oemQuality || 'Quality not recorded'}</p>
                  <p>{selectedItem.accessoriesIncluded?.length ? selectedItem.accessoriesIncluded.map(titleStatus).join(', ') : 'Included accessories not recorded'}</p>
                </article>
                <article>
                  <span className="eyebrow">Photo</span>
                  <p><strong>{selectedItem.imageUrl ? 'Product photo added' : 'No product photo'}</strong></p>
                  <p>{selectedItem.imageUrl ? 'Use Change photo below to replace it.' : 'Use Add photo below to upload one.'}</p>
                </article>
                </div>
              </section>

              {editingPrice && <div className="inventory-price-editor">
                <div className="inventory-price-heading"><span className="eyebrow">Inventory pricing</span><h4>Set selling prices</h4><p>Enter either currency and the other price updates automatically. Choose which currency opens first in New Sale.</p><small>Reference rate: 1 USD = {riel.format(usdKhrRate)} KHR</small></div>
                <div className="inventory-price-columns">
                  <section className={`inventory-currency-column ${priceCurrency === 'USD' ? 'is-default' : ''}`} aria-labelledby="inventory-usd-price-title">
                    <header><span className="inventory-currency-mark">$</span><div><strong id="inventory-usd-price-title">US Dollar</strong><small>USD</small></div><label className="inventory-default-currency"><input type="radio" name="default-price-currency" checked={priceCurrency === 'USD'} onChange={() => changePriceCurrency('USD')} /><span>Open first</span></label></header>
                    <label>Regular selling price<div className="input-prefix"><span>$</span><MoneyInput autoFocus currency="USD" minimum={0} value={usdSellingPriceDraft} onValueChange={changeUsdSellingPrice} placeholder="0.00" aria-label="Regular selling price in US dollars" /></div></label>
                    <label>Minimum selling price<div className="input-prefix"><span>$</span><MoneyInput currency="USD" minimum={0} maximum={Number(usdSellingPriceDraft || 0)} value={usdMinimumPriceDraft} onValueChange={changeUsdMinimumPrice} placeholder="0.00" aria-label="Minimum selling price in US dollars" /></div></label>
                  </section>
                  <section className={`inventory-currency-column ${priceCurrency === 'KHR' ? 'is-default' : ''}`} aria-labelledby="inventory-khr-price-title">
                    <header><span className="inventory-currency-mark">៛</span><div><strong id="inventory-khr-price-title">Cambodian Riel</strong><small>KHR</small></div><label className="inventory-default-currency"><input type="radio" name="default-price-currency" checked={priceCurrency === 'KHR'} onChange={() => changePriceCurrency('KHR')} /><span>Open first</span></label></header>
                    <label>Regular selling price<div className="input-prefix"><span>៛</span><MoneyInput currency="KHR" minimum={0} value={khrSellingPriceDraft} onValueChange={changeKhrSellingPrice} placeholder="0" aria-label="Regular selling price in Cambodian riel" /></div></label>
                    <label>Minimum selling price<div className="input-prefix"><span>៛</span><MoneyInput currency="KHR" minimum={0} maximum={Number(khrSellingPriceDraft || 0)} value={khrMinimumPriceDraft} onValueChange={changeKhrMinimumPrice} placeholder="0" aria-label="Minimum selling price in Cambodian riel" /></div></label>
                  </section>
                </div>
                <p className="inventory-price-help">Minimum prices control the largest discount allowed in each currency.</p>
                <div className="inventory-price-actions"><button className="ghost-button" onClick={() => { setEditingPrice(false); setError('') }}>Cancel</button><button className="primary-button" onClick={() => void saveSellingPrice()} disabled={savingPrice || Number(usdMinimumPriceDraft || 0) > Number(usdSellingPriceDraft || 0) || Number(khrMinimumPriceDraft || 0) > Number(khrSellingPriceDraft || 0)}>{savingPrice ? 'Saving…' : 'Save prices'}</button></div>
              </div>}

              {selectedItem.notes && (
                <div className="detail-note">
                  <span className="eyebrow">Notes</span>
                  <p>{selectedItem.notes}</p>
                </div>
              )}
            </div>

            <footer className="detail-modal-footer">
              <label className={`secondary-button upload-photo-button ${savingPhoto ? 'disabled' : ''}`}>
                <Package size={16} /> {savingPhoto ? 'Saving photo...' : selectedItem.imageUrl ? 'Change photo' : 'Add photo'}
                <input type="file" accept="image/png,image/jpeg,image/webp" disabled={savingPhoto} onChange={(event) => void uploadPhoto(event.target.files?.[0])} />
              </label>
              {selectedItem.imageUrl && <button className="ghost-button" onClick={() => void removePhoto()} disabled={savingPhoto}>Remove photo</button>}
              {!editingPrice && <button className="primary-button" onClick={openPriceEditor}>{selectedItem.sellPrice > 0 ? 'Change price' : 'Set selling price'}</button>}
              <button className="secondary-button" onClick={() => printInventoryLabel(selectedItem)}><ScanLine size={16} /> Print label</button>
              <button className="ghost-button" onClick={() => { setSelectedItem(null); setEditingPrice(false) }}>Close</button>
            </footer>
          </section>
        </div>
      )}
    </>
  )
}

