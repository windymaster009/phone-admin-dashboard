import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { CheckCircle2, LoaderCircle, Package, Search, X } from 'lucide-react'

export type InventorySearchItem = {
  _id: string
  name: string
  sku: string
  category: string
  quantity: number
  barcode?: string
  serialNumber?: string
  brand?: string
  model?: string
}

type InventoryProductComboboxProps<T extends InventorySearchItem> = {
  id: string
  items: T[]
  value: string
  loading?: boolean
  label?: string
  listLabel?: string
  placeholder?: string
  emptyMessage: string
  errorMessage?: string
  onChange: (itemId: string) => void
}

export default function InventoryProductCombobox<T extends InventorySearchItem>({
  id,
  items,
  value,
  loading = false,
  label = 'Product',
  listLabel = 'Existing inventory products',
  placeholder = 'Search name, SKU, barcode, or serial…',
  emptyMessage,
  errorMessage,
  onChange,
}: InventoryProductComboboxProps<T>) {
  const selectedItem = items.find((item) => item._id === value)
  const [query, setQuery] = useState(() => selectedItem?.name || '')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const safeId = useMemo(() => id.replace(/[^a-zA-Z0-9_-]/g, '-'), [id])
  const inputId = `purchase-existing-product-${safeId}`
  const listboxId = `${inputId}-results`
  const errorId = `${inputId}-error`

  const filteredItems = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return items.slice(0, 50)

    return items.filter((item) => {
      const searchableText = [item._id, item.name, item.sku, item.barcode, item.serialNumber, item.brand, item.model, item.category]
        .filter(Boolean).join(' ').toLowerCase()
      return tokens.every((token) => searchableText.includes(token))
    }).slice(0, 50)
  }, [items, query])

  useEffect(() => {
    if (selectedItem) setQuery(selectedItem.name)
    else if (value) setQuery('')
  }, [selectedItem?._id, selectedItem?.name, value])

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [])

  useEffect(() => {
    if (!open || activeIndex < 0) return
    rootRef.current
      ?.querySelector<HTMLElement>(`#${listboxId} [data-option-index="${activeIndex}"]`)
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, listboxId, open])

  const selectItem = (item: T) => {
    onChange(item._id)
    setQuery(item.name)
    setOpen(false)
    setActiveIndex(-1)
  }

  const clearSelection = () => {
    onChange('')
    setQuery('')
    setOpen(items.length > 0)
    setActiveIndex(items.length > 0 ? 0 : -1)
    inputRef.current?.focus({ preventScroll: true })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((current) => filteredItems.length === 0 ? -1 : current < 0 ? 0 : (current + 1) % filteredItems.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((current) => filteredItems.length === 0 ? -1 : current <= 0 ? filteredItems.length - 1 : current - 1)
      return
    }
    if (event.key === 'Home' && open && filteredItems.length > 0) {
      event.preventDefault()
      setActiveIndex(0)
      return
    }
    if (event.key === 'End' && open && filteredItems.length > 0) {
      event.preventDefault()
      setActiveIndex(filteredItems.length - 1)
      return
    }
    if (event.key === 'Enter' && open) {
      const item = activeIndex >= 0 ? filteredItems[activeIndex] : filteredItems.length === 1 ? filteredItems[0] : undefined
      if (item) {
        event.preventDefault()
        selectItem(item)
      }
      return
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  return <div className={`device-existing-product${errorMessage ? ' field-invalid' : ''}`}>
    <label id={`${inputId}-label`} htmlFor={inputId}>{label}</label>
    <div className={`sale-product-search-combobox purchase-inventory-search${selectedItem ? ' has-value' : ''}${loading ? ' is-loading' : ''}`} ref={rootRef}>
      <div className="sale-product-search-input-wrapper">
        {loading
          ? <LoaderCircle size={16} className="sale-search-icon purchase-search-loading spinning" aria-hidden="true" />
          : selectedItem
            ? <CheckCircle2 size={16} className="sale-search-icon purchase-search-selected" aria-hidden="true" />
            : <Search size={16} className="sale-search-icon" aria-hidden="true" />}
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          role="combobox"
          autoComplete="off"
          required
          disabled={loading || items.length === 0}
          value={query}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-labelledby={`${inputId}-label`}
          aria-activedescendant={activeIndex >= 0 && filteredItems[activeIndex] ? `${inputId}-option-${activeIndex}` : undefined}
          aria-invalid={Boolean(errorMessage)}
          aria-describedby={errorMessage ? errorId : undefined}
          placeholder={loading ? 'Loading inventory…' : items.length === 0 ? emptyMessage : placeholder}
          onFocus={() => { if (items.length > 0) setOpen(true) }}
          onChange={(event) => {
            const nextQuery = event.target.value
            setQuery(nextQuery)
            setOpen(true)
            setActiveIndex(0)
            if (value) onChange('')

            // Barcode scanners and existing automated flows may enter an exact record id.
            const exactIdMatch = items.find((item) => item._id === nextQuery)
            if (exactIdMatch) selectItem(exactIdMatch)
          }}
          onKeyDown={handleKeyDown}
        />
        {query && !loading && <button type="button" className="sale-search-clear-btn" aria-label="Clear product search" onClick={clearSelection}><X size={14} /></button>}
      </div>

      {open && !loading && items.length > 0 && <div id={listboxId} role="listbox" aria-label={listLabel} className="sale-product-results-dropdown purchase-product-results-dropdown">
        {filteredItems.length === 0 ? <div className="sale-search-empty"><Package size={20} aria-hidden="true" /><span>No products match “{query.trim()}”</span></div>
          : filteredItems.map((item, index) => {
            const isActive = index === activeIndex
            const isSelected = item._id === value
            return <button
              key={item._id}
              id={`${inputId}-option-${index}`}
              data-option-index={index}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={isSelected}
              className={`sale-product-option purchase-product-option${isActive ? ' is-active' : ''}${isSelected ? ' is-selected' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectItem(item)}
            >
              <span className="sale-option-icon"><Package size={16} aria-hidden="true" /></span>
              <span className="sale-option-info"><strong>{item.name}</strong><small>{[item.sku ? `SKU: ${item.sku}` : '', item.barcode ? `Barcode: ${item.barcode}` : '', item.serialNumber ? `SN: ${item.serialNumber}` : ''].filter(Boolean).join(' · ')}</small></span>
              <span className="sale-option-meta"><span className="sale-option-stock">Qty {item.quantity}</span>{isSelected && <span className="purchase-option-selected"><CheckCircle2 size={13} /> Selected</span>}</span>
            </button>
          })}
      </div>}
      <span className="sr-only" aria-live="polite">{open ? `${filteredItems.length} product${filteredItems.length === 1 ? '' : 's'} found` : ''}</span>
    </div>
    {errorMessage && <small id={errorId}>{errorMessage}</small>}
    {!errorMessage && !loading && items.length === 0 && <small className="purchase-search-helper">{emptyMessage}</small>}
  </div>
}

export function InventorySelectionSummary({ item, afterLabel, afterQuantity }: { item: InventorySearchItem; afterLabel: string; afterQuantity: number }) {
  return <div className="purchase-existing-summary">
    <span className="stock-adjustment-result-icon"><Package size={19} /></span>
    <p><strong>{item.name}</strong><small>{item.sku} · {item.category.replace('_', ' ')}</small></p>
    <div><span>Current stock</span><strong>{item.quantity}</strong></div>
    <div><span>{afterLabel}</span><strong>{afterQuantity}</strong></div>
  </div>
}
