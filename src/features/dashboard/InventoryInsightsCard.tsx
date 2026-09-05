import { useCallback, useEffect, useMemo, useState } from 'react'
import './inventory-insights.css'
import { useRouter } from '../../app/routing'
import { AlertTriangle, Boxes, DollarSign, PackageOpen, RefreshCcw, TrendingUp } from 'lucide-react'
import { api } from '../../lib/api'

type InventoryItem = {
  _id: string
  sku: string
  category: 'PHONE' | 'TABLET' | 'ACCESSORY' | 'SPARE_PART' | 'OTHER'
  quantity: number
  reorderLevel: number
  buyPrice: number
  sellPrice: number
  status: string
}

type InventoryResponse = { items: InventoryItem[] }

type CategorySummary = {
  category: InventoryItem['category']
  units: number
  skus: number
  cost: number
  retail: number
  share: number
}

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const categoryLabels: Record<InventoryItem['category'], string> = {
  PHONE: 'Phones',
  TABLET: 'Tablets',
  ACCESSORY: 'Accessories',
  SPARE_PART: 'Spare parts',
  OTHER: 'Other',
}

const categoryClass: Record<InventoryItem['category'], string> = {
  PHONE: 'phone',
  TABLET: 'tablet',
  ACCESSORY: 'accessory',
  SPARE_PART: 'spare',
  OTHER: 'other',
}

export default function InventoryInsightsCard() {
  const { navigate } = useRouter()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api<InventoryResponse>('/inventory', {}, { deduplicate: true })
      setItems(Array.isArray(result?.items) ? result.items : [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load inventory values')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const metrics = useMemo(() => {
    const available = items.filter((item) => item.status === 'IN_STOCK' && Number(item.quantity) > 0)
    const units = available.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    const costValue = available.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.buyPrice || 0), 0)
    const retailValue = available.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.sellPrice || 0), 0)
    const potentialMargin = Math.max(0, retailValue - costValue)
    const marginPercent = retailValue > 0 ? (potentialMargin / retailValue) * 100 : 0
    const lowStock = available.filter((item) => Number(item.quantity) <= Number(item.reorderLevel || 0)).length

    const grouped = new Map<InventoryItem['category'], Omit<CategorySummary, 'share'>>()
    for (const item of available) {
      const category = item.category || 'OTHER'
      const current = grouped.get(category) || { category, units: 0, skus: 0, cost: 0, retail: 0 }
      current.units += Number(item.quantity || 0)
      current.skus += 1
      current.cost += Number(item.quantity || 0) * Number(item.buyPrice || 0)
      current.retail += Number(item.quantity || 0) * Number(item.sellPrice || 0)
      grouped.set(category, current)
    }

    const categories = Array.from(grouped.values())
      .map((entry): CategorySummary => ({ ...entry, share: costValue > 0 ? (entry.cost / costValue) * 100 : 0 }))
      .sort((left, right) => right.cost - left.cost)

    return {
      units,
      skus: available.length,
      costValue,
      retailValue,
      potentialMargin,
      marginPercent,
      lowStock,
      categories,
    }
  }, [items])

  const openInventory = () => {
    navigate('/stock')
  }

  return (
    <section className="inventory-insights" aria-label="Inventory value insights">
      <header className="inventory-insights-heading">
        <div>
          <span className="eyebrow">Stock value</span>
          <h3>Inventory mix</h3>
          <p>Available stock at cost, retail value, and category concentration.</p>
        </div>
        <div className="inventory-insights-actions">
          <button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh inventory values"><RefreshCcw size={15} /></button>
          <button type="button" onClick={openInventory}>View stock</button>
        </div>
      </header>

      {error ? (
        <div className="inventory-insights-state error"><AlertTriangle size={18} /><span>{error}</span><button type="button" onClick={() => void load()}>Try again</button></div>
      ) : loading && items.length === 0 ? (
        <div className="inventory-insights-state">Loading stock values…</div>
      ) : (
        <>
          <div className="inventory-value-primary">
            <div>
              <span>Cost value</span>
              <strong>{money.format(metrics.costValue)}</strong>
              <small>{metrics.units} units across {metrics.skus} stock records</small>
            </div>
            <span className="inventory-value-icon"><DollarSign size={20} /></span>
          </div>

          <div className="inventory-value-grid">
            <article>
              <span><TrendingUp size={14} />Retail value</span>
              <strong>{money.format(metrics.retailValue)}</strong>
              <small>Current listed prices</small>
            </article>
            <article>
              <span><PackageOpen size={14} />Potential margin</span>
              <strong>{money.format(metrics.potentialMargin)}</strong>
              <small>{metrics.marginPercent.toFixed(1)}% of retail value</small>
            </article>
            <article className={metrics.lowStock > 0 ? 'warning' : ''}>
              <span><AlertTriangle size={14} />Low stock</span>
              <strong>{metrics.lowStock}</strong>
              <small>SKUs at reorder level</small>
            </article>
          </div>

          <div className="inventory-mix-strip" aria-label="Inventory cost value by category">
            {metrics.categories.map((category) => (
              <i
                key={category.category}
                className={categoryClass[category.category]}
                style={{ width: `${Math.max(0, category.share)}%` }}
                title={`${categoryLabels[category.category]} ${category.share.toFixed(1)}%`}
              />
            ))}
          </div>

          <div className="inventory-category-list">
            {metrics.categories.map((category) => (
              <article key={category.category}>
                <span className={`inventory-category-dot ${categoryClass[category.category]}`} />
                <div>
                  <strong>{categoryLabels[category.category]}</strong>
                  <small>{category.units} units · {category.skus} SKU{category.skus === 1 ? '' : 's'}</small>
                </div>
                <div className="inventory-category-value">
                  <strong>{money.format(category.cost)}</strong>
                  <small>{category.share.toFixed(1)}%</small>
                </div>
              </article>
            ))}
            {metrics.categories.length === 0 && <div className="inventory-insights-empty"><Boxes size={20} />No available inventory yet.</div>}
          </div>
        </>
      )}
    </section>
  )
}

