import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import DetailModalHeader from '../../components/DetailModalHeader'
import DetailModalBody from '../../components/DetailModalBody'
import DetailModalFooter from '../../components/DetailModalFooter'
import MoneyInput from '../../components/MoneyInput'
import { riel } from '../../lib/presentation'
import './inventory-page.css'

export type InventoryPricingPanelProps = {
  itemName: string
  itemCode: string
  stockOnHand: number
  buyCostText: string
  currentSellText: string
  hasSavedPrice: boolean
  leadingMedia?: ReactNode
  usdKhrRate: number
  currency: 'USD' | 'KHR'
  usdSellingPrice: string
  usdMinimumPrice: string
  khrSellingPrice: string
  khrMinimumPrice: string
  error?: string
  saving?: boolean
  onCurrencyChange: (currency: 'USD' | 'KHR') => void
  onUsdSellingPriceChange: (value: string) => void
  onUsdMinimumPriceChange: (value: string) => void
  onKhrSellingPriceChange: (value: string) => void
  onKhrMinimumPriceChange: (value: string) => void
  onDismissError?: () => void
  onClose: () => void
  onSave: () => void
}

export default function InventoryPricingPanel({
  itemName,
  itemCode,
  stockOnHand,
  buyCostText,
  currentSellText,
  hasSavedPrice,
  leadingMedia,
  usdKhrRate,
  currency,
  usdSellingPrice,
  usdMinimumPrice,
  khrSellingPrice,
  khrMinimumPrice,
  error = '',
  saving = false,
  onCurrencyChange,
  onUsdSellingPriceChange,
  onUsdMinimumPriceChange,
  onKhrSellingPriceChange,
  onKhrMinimumPriceChange,
  onDismissError,
  onClose,
  onSave,
}: InventoryPricingPanelProps) {
  const minimumExceedsRegular = Number(usdMinimumPrice || 0) > Number(usdSellingPrice || 0)
    || Number(khrMinimumPrice || 0) > Number(khrSellingPrice || 0)

  return <>
    <DetailModalHeader
      leadingMedia={leadingMedia}
      eyebrow="Inventory pricing"
      title={hasSavedPrice ? 'Change selling price' : 'Set selling price'}
      titleId="stock-price-title"
      description={`${itemName} · ${itemCode}`}
      descriptionId="stock-price-description"
      onClose={onClose}
      closeLabel="Cancel price editing"
    />

    <DetailModalBody className="inventory-detail-body inventory-price-focused-body">
      {error && (
        <div className="operation-modal-error inventory-dialog-error" role="alert">
          <AlertTriangle size={16} />
          <span>{error}</span>
          {onDismissError && <button type="button" className="icon-button" aria-label="Dismiss pricing error" onClick={onDismissError}>×</button>}
        </div>
      )}

      <div className="inventory-price-item-context" aria-label="Stock overview summary">
        <div className="inventory-price-context-pill">
          <span>Stock on hand</span>
          <strong>{stockOnHand}</strong>
        </div>
        <div className="inventory-price-context-pill">
          <span>Buy cost</span>
          <strong>{buyCostText}</strong>
        </div>
        <div className="inventory-price-context-pill">
          <span>Current sell</span>
          <strong>{currentSellText}</strong>
        </div>
      </div>

      <div className="inventory-price-editor inventory-price-focused-view">
        <div className="inventory-price-heading">
          <span className="eyebrow">Inventory pricing</span>
          <h4>Set selling prices</h4>
          <p>Enter either currency and the other price updates automatically. Choose which currency opens first in New Sale.</p>
          <small>Reference rate: 1 USD = {riel.format(usdKhrRate)} KHR</small>
        </div>
        <div className="inventory-price-columns">
          <section className={`inventory-currency-column ${currency === 'USD' ? 'is-default' : ''}`} aria-labelledby="inventory-usd-price-title">
            <header>
              <div className="inventory-currency-brand">
                <span className="inventory-currency-mark">$</span>
                <div><strong id="inventory-usd-price-title">US Dollar</strong><small>USD</small></div>
              </div>
              <label className="inventory-default-currency" htmlFor="default-currency-usd">
                <input id="default-currency-usd" type="radio" name="default-price-currency" checked={currency === 'USD'} onChange={() => onCurrencyChange('USD')} />
                <span>Open first</span>
              </label>
            </header>
            <label>
              Regular selling price
              <div className="input-prefix"><span>$</span><MoneyInput autoFocus currency="USD" minimum={0} value={usdSellingPrice} onValueChange={onUsdSellingPriceChange} placeholder="0.00" aria-label="Regular selling price in US dollars" /></div>
            </label>
            <label>
              Minimum selling price
              <div className="input-prefix"><span>$</span><MoneyInput currency="USD" minimum={0} maximum={Number(usdSellingPrice || 0)} value={usdMinimumPrice} onValueChange={onUsdMinimumPriceChange} placeholder="0.00" aria-label="Minimum selling price in US dollars" /></div>
            </label>
          </section>
          <section className={`inventory-currency-column ${currency === 'KHR' ? 'is-default' : ''}`} aria-labelledby="inventory-khr-price-title">
            <header>
              <div className="inventory-currency-brand">
                <span className="inventory-currency-mark">៛</span>
                <div><strong id="inventory-khr-price-title">Cambodian Riel</strong><small>KHR</small></div>
              </div>
              <label className="inventory-default-currency" htmlFor="default-currency-khr">
                <input id="default-currency-khr" type="radio" name="default-price-currency" checked={currency === 'KHR'} onChange={() => onCurrencyChange('KHR')} />
                <span>Open first</span>
              </label>
            </header>
            <label>
              Regular selling price
              <div className="input-prefix"><span>៛</span><MoneyInput currency="KHR" minimum={0} value={khrSellingPrice} onValueChange={onKhrSellingPriceChange} placeholder="0" aria-label="Regular selling price in Cambodian riel" /></div>
            </label>
            <label>
              Minimum selling price
              <div className="input-prefix"><span>៛</span><MoneyInput currency="KHR" minimum={0} maximum={Number(khrSellingPrice || 0)} value={khrMinimumPrice} onValueChange={onKhrMinimumPriceChange} placeholder="0" aria-label="Minimum selling price in Cambodian riel" /></div>
            </label>
          </section>
        </div>
        <p className="inventory-price-help">Minimum prices control the largest discount allowed in each currency.</p>
      </div>
    </DetailModalBody>

    <DetailModalFooter
      className="inventory-price-footer"
      secondaryActions={<button type="button" className="ghost-button inventory-price-cancel-btn" onClick={onClose} disabled={saving}>Cancel</button>}
      transactionActions={<button type="button" className="primary-button" onClick={onSave} disabled={saving || minimumExceedsRegular}>{saving ? 'Saving…' : 'Save prices'}</button>}
    />
  </>
}
