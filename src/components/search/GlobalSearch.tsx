import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  Boxes,
  Building2,
  CornerDownLeft,
  HandCoins,
  Search,
  Users,
  Wrench,
  X,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useRouter } from '../../app/routing'
import './global-search.css'

export type SearchInventoryItem = {
  _id: string
  productName?: string
  brand?: string
  model?: string
  sku?: string
  barcode?: string
  imei?: string
  serialNumber?: string
  category?: string
  salePrice?: number
  currency?: 'USD' | 'KHR'
  quantity?: number
  status?: string
}

export type SearchPawn = {
  _id: string
  pawnNo: string
  customerName?: string
  customerPhone?: string
  collateral?: string
  loanAmount?: number
  currency?: 'USD' | 'KHR'
  status: string
  dueDate?: string
}

export type SearchLoan = {
  _id: string
  loanNo: string
  customerName?: string
  customerPhone?: string
  borrowerMode?: string
  principal?: number
  currency?: 'USD' | 'KHR'
  status: string
  dueDate?: string
  totalDue?: number
  remainingBalance?: number
}

export type SearchCustomer = {
  _id: string
  name: string
  phone?: string
  nationalIdNumber?: string
  active: boolean
}

export type SearchService = {
  _id: string
  code: string
  name: string
  category?: string
  price?: number
  currency?: 'USD' | 'KHR'
  active: boolean
}

export type SearchSupplier = {
  _id: string
  name: string
  phone?: string
  active: boolean
}

export type SearchResults = {
  inventory?: SearchInventoryItem[]
  pawns?: SearchPawn[]
  loans?: SearchLoan[]
  customers?: SearchCustomer[]
  services?: SearchService[]
  suppliers?: SearchSupplier[]
}

export type SearchResponse = {
  query: string
  results: SearchResults
  total: number
}

export type FlatSearchResult = {
  id: string
  type: 'inventory' | 'pawns' | 'loans' | 'customers' | 'services' | 'suppliers'
  title: string
  subItems: Array<{ label?: string; value: string; isTag?: boolean }>
  badge?: { text: string; className: string }
  meta?: { primary: string; secondary?: string }
  onSelect: () => void
}

function getStatusClass(status?: string): string {
  if (!status) return 'status-default'
  const normalized = status.toUpperCase()
  if (['IN_STOCK', 'ACTIVE', 'PAID', 'REDEEMED'].includes(normalized)) return 'status-active'
  if (['LOW_STOCK', 'DUE_SOON', 'PARTIALLY_PAID', 'RENEWED'].includes(normalized)) return 'status-due-soon'
  if (['OUT_OF_STOCK', 'OVERDUE', 'FORFEITED', 'CANCELLED'].includes(normalized)) return 'status-overdue'
  return 'status-default'
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return ''
  try {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

function formatAmount(value: number, currency: 'USD' | 'KHR' = 'USD'): string {
  const amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: currency === 'KHR' ? 0 : 2 }).format(value)
  return currency === 'KHR' ? `${amount} KHR` : `$${amount}`
}

interface GlobalSearchProps {
  onNavigate?: (path: string) => void
}

export default function GlobalSearch({ onNavigate }: GlobalSearchProps) {
  const router = useRouter()
  const navigate = onNavigate || router.navigate

  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResults>({})
  const [totalCount, setTotalCount] = useState(0)
  const [hasSearched, setHasSearched] = useState(false)

  const [desktopOpen, setDesktopOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const desktopInputRef = useRef<HTMLInputElement>(null)
  const mobileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const debounceTimerRef = useRef<number | null>(null)

  const handleSelectRecord = useCallback((url: string, dispatch: () => void) => {
    setDesktopOpen(false)
    setMobileOpen(false)
    navigate(url)
    dispatch()
  }, [navigate])

  // Build flattened results for keyboard navigation and grouping
  const flattenedResults: FlatSearchResult[] = useMemo(() => {
    const list: FlatSearchResult[] = []

    // 1. Inventory
    if (results.inventory?.length) {
      results.inventory.forEach((item) => {
        const title = item.productName || [item.brand, item.model].filter(Boolean).join(' ') || item.sku || 'Item'
        const subItems: Array<{ label?: string; value: string; isTag?: boolean }> = []
        if (item.sku) subItems.push({ label: 'SKU', value: item.sku, isTag: true })
        if (item.barcode) subItems.push({ label: 'BAR', value: item.barcode, isTag: true })
        if (item.imei) subItems.push({ label: 'IMEI', value: item.imei, isTag: true })
        if (item.serialNumber) subItems.push({ label: 'SN', value: item.serialNumber, isTag: true })
        if (item.category && item.category !== 'OTHER') subItems.push({ value: item.category })

        list.push({
          id: `inventory-${item._id}`,
          type: 'inventory',
          title,
          subItems,
          badge: item.status ? { text: item.status.replace(/_/g, ' '), className: getStatusClass(item.status) } : undefined,
          meta: {
            primary: item.salePrice != null ? formatAmount(item.salePrice, item.currency) : '',
            secondary: item.quantity != null ? `Qty: ${item.quantity}` : undefined,
          },
          onSelect: () => {
            handleSelectRecord(`/stock?openItem=${encodeURIComponent(item._id)}`, () => {
              window.dispatchEvent(new CustomEvent('phoneflow:open-stock-item', { detail: { id: item._id } }))
            })
          },
        })
      })
    }

    // 2. Pawns
    if (results.pawns?.length) {
      results.pawns.forEach((pawn) => {
        const subItems: Array<{ label?: string; value: string; isTag?: boolean }> = []
        if (pawn.customerName) subItems.push({ label: 'Customer', value: pawn.customerName })
        if (pawn.customerPhone) subItems.push({ value: pawn.customerPhone })
        if (pawn.collateral) subItems.push({ label: 'Collateral', value: pawn.collateral })

        const dueFormatted = formatDate(pawn.dueDate)

        list.push({
          id: `pawns-${pawn._id}`,
          type: 'pawns',
          title: `Pawn #${pawn.pawnNo}`,
          subItems,
          badge: pawn.status ? { text: pawn.status.replace(/_/g, ' '), className: getStatusClass(pawn.status) } : undefined,
          meta: {
            primary: pawn.loanAmount != null ? formatAmount(pawn.loanAmount, pawn.currency) : '',
            secondary: dueFormatted ? `Due ${dueFormatted}` : undefined,
          },
          onSelect: () => {
            handleSelectRecord(`/pawn-management?openPawn=${encodeURIComponent(pawn._id)}`, () => {
              window.dispatchEvent(new CustomEvent('phoneflow:open-pawn-detail', { detail: { id: pawn._id, pawnNo: pawn.pawnNo } }))
            })
          },
        })
      })
    }

    // 3. Loans
    if (results.loans?.length) {
      results.loans.forEach((loan) => {
        const subItems: Array<{ label?: string; value: string; isTag?: boolean }> = []
        if (loan.customerName) subItems.push({ label: 'Borrower', value: loan.customerName })
        if (loan.customerPhone) subItems.push({ value: loan.customerPhone })

        const dueFormatted = formatDate(loan.dueDate)
        const balance = loan.remainingBalance ?? loan.principal

        list.push({
          id: `loans-${loan._id}`,
          type: 'loans',
          title: `Loan #${loan.loanNo}`,
          subItems,
          badge: loan.status ? { text: loan.status.replace(/_/g, ' '), className: getStatusClass(loan.status) } : undefined,
          meta: {
            primary: balance != null ? formatAmount(balance, loan.currency) : '',
            secondary: dueFormatted ? `Due ${dueFormatted}` : undefined,
          },
          onSelect: () => {
            handleSelectRecord(`/loans?openLoan=${encodeURIComponent(loan._id)}`, () => {
              window.dispatchEvent(new CustomEvent('phoneflow:open-loan-detail', { detail: { id: loan._id, loanNo: loan.loanNo } }))
            })
          },
        })
      })
    }

    // 4. Customers
    if (results.customers?.length) {
      results.customers.forEach((customer) => {
        const subItems: Array<{ label?: string; value: string; isTag?: boolean }> = []
        if (customer.phone) subItems.push({ label: 'Phone', value: customer.phone })
        if (customer.nationalIdNumber) subItems.push({ label: 'ID', value: customer.nationalIdNumber, isTag: true })

        list.push({
          id: `customers-${customer._id}`,
          type: 'customers',
          title: customer.name,
          subItems,
          badge: {
            text: customer.active ? 'Active' : 'Inactive',
            className: customer.active ? 'status-active' : 'status-default',
          },
          onSelect: () => {
            handleSelectRecord(`/customers?openCustomer=${encodeURIComponent(customer._id)}`, () => {
              window.dispatchEvent(new CustomEvent('phoneflow:open-customer-detail', { detail: { id: customer._id } }))
            })
          },
        })
      })
    }

    // 5. Services
    if (results.services?.length) {
      results.services.forEach((service) => {
        const subItems: Array<{ label?: string; value: string; isTag?: boolean }> = []
        if (service.code) subItems.push({ label: 'Code', value: service.code, isTag: true })
        if (service.category) subItems.push({ value: service.category.replace(/_/g, ' ') })

        list.push({
          id: `services-${service._id}`,
          type: 'services',
          title: service.name,
          subItems,
          badge: {
            text: service.active ? 'Active' : 'Inactive',
            className: service.active ? 'status-active' : 'status-default',
          },
          meta: service.price != null ? { primary: formatAmount(service.price, service.currency) } : undefined,
          onSelect: () => {
            handleSelectRecord(`/services?openService=${encodeURIComponent(service._id)}`, () => {
              window.dispatchEvent(new CustomEvent('phoneflow:open-service-detail', { detail: { id: service._id, code: service.code } }))
            })
          },
        })
      })
    }

    // 6. Suppliers
    if (results.suppliers?.length) {
      results.suppliers.forEach((supplier) => {
        const subItems: Array<{ label?: string; value: string; isTag?: boolean }> = []
        if (supplier.phone) subItems.push({ label: 'Phone', value: supplier.phone })

        list.push({
          id: `suppliers-${supplier._id}`,
          type: 'suppliers',
          title: supplier.name,
          subItems,
          badge: {
            text: supplier.active ? 'Active' : 'Inactive',
            className: supplier.active ? 'status-active' : 'status-default',
          },
          onSelect: () => {
            handleSelectRecord(`/suppliers?openSupplier=${encodeURIComponent(supplier._id)}`, () => {
              window.dispatchEvent(new CustomEvent('phoneflow:open-supplier-detail', { detail: { id: supplier._id } }))
            })
          },
        })
      })
    }

    return list
  }, [results, handleSelectRecord])

  // Reset highlight index when results change
  useEffect(() => {
    setHighlightedIndex(0)
  }, [flattenedResults.length])

  // Execute search with debouncing and stale cancellation
  useEffect(() => {
    const trimmed = query.trim()

    abortControllerRef.current?.abort()

    if (!trimmed) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      setLoading(false)
      setError(null)
      setResults({})
      setTotalCount(0)
      setHasSearched(false)
      return
    }

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current)
    }

    setLoading(true)
    setError(null)
    setResults({})
    setTotalCount(0)
    setHasSearched(false)

    debounceTimerRef.current = window.setTimeout(async () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      const controller = new AbortController()
      abortControllerRef.current = controller

      setLoading(true)
      setError(null)

      try {
        const response = await api<SearchResponse>(`/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        })

        if (!controller.signal.aborted) {
          setResults(response.results || {})
          setTotalCount(response.total ?? Object.values(response.results || {}).reduce((sum, group) => sum + (group?.length || 0), 0))
          setHasSearched(true)
          setLoading(false)
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return // stale request cancelled
        }
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Unable to perform search')
          setLoading(false)
          setHasSearched(true)
        }
      }
    }, 250)

    return () => {
      abortControllerRef.current?.abort()
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current)
      }
    }
  }, [query])

  // Global keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        const isMobile = window.innerWidth <= 768
        if (isMobile) {
          setMobileOpen(true)
          window.setTimeout(() => {
            mobileInputRef.current?.focus()
            mobileInputRef.current?.select()
          }, 0)
        } else {
          setDesktopOpen(true)
          desktopInputRef.current?.focus()
          desktopInputRef.current?.select()
        }
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  // Outside click to close desktop dropdown
  useEffect(() => {
    if (!desktopOpen) return

    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setDesktopOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [desktopOpen])

  // Prevent background scroll when mobile panel is open
  useEffect(() => {
    if (mobileOpen) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      window.requestAnimationFrame(() => {
        mobileInputRef.current?.focus()
      })
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [mobileOpen])

  // Keyboard navigation handler
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setDesktopOpen(false)
      setMobileOpen(false)
      event.currentTarget.blur()
      return
    }

    if (flattenedResults.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex((prev) => (prev + 1) % flattenedResults.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((prev) => (prev <= 0 ? flattenedResults.length - 1 : prev - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const selectedItem = flattenedResults[highlightedIndex]
      if (selectedItem) {
        selectedItem.onSelect()
      }
    }
  }

  // Clear query helper
  const handleClear = () => {
    setQuery('')
    setResults({})
    setTotalCount(0)
    setHasSearched(false)
    if (desktopOpen) desktopInputRef.current?.focus()
    if (mobileOpen) mobileInputRef.current?.focus()
  }

  // Render the result groups
  const renderResultsList = (isMobile: boolean = false) => {
    if (loading && !hasSearched) {
      return (
        <div className="global-search-status-box" role="status">
          <div className="global-search-spinner" />
          <p>Searching records...</p>
        </div>
      )
    }

    if (error) {
      return (
        <div className="global-search-status-box" role="alert">
          <AlertCircle size={24} className="global-search-error-icon" />
          <h4>Search error</h4>
          <p>{error}</p>
        </div>
      )
    }

    if (hasSearched && totalCount === 0) {
      return (
        <div className="global-search-status-box" role="status">
          <h4>No records found</h4>
          <p>No results found for &ldquo;{query}&rdquo;. Try searching by product, SKU, barcode, IMEI, serial, contract number, or phone.</p>
        </div>
      )
    }

    if (!hasSearched && !query.trim()) {
      return (
        <div className="global-search-status-box">
          <p>Type to search inventory, pawns, loans, and customers...</p>
        </div>
      )
    }

    const groupDefs: Array<{
      type: FlatSearchResult['type']
      label: string
      icon: React.ComponentType<{ size?: number }>
    }> = [
      { type: 'inventory', label: 'Inventory / Stock', icon: Boxes },
      { type: 'pawns', label: 'Pawn Contracts', icon: HandCoins },
      { type: 'loans', label: 'Loans', icon: Banknote },
      { type: 'customers', label: 'Customers', icon: Users },
      { type: 'services', label: 'Services', icon: Wrench },
      { type: 'suppliers', label: 'Suppliers', icon: Building2 },
    ]

    const groups = groupDefs
      .map((def) => ({
        ...def,
        items: flattenedResults.filter((r) => r.type === def.type),
      }))
      .filter((group) => group.items.length > 0)

    let runningIndex = 0

    return (
      <div className="global-search-results-list" role="listbox" id={isMobile ? 'global-search-mobile-results' : 'global-search-desktop-results'}>
        {groups.map((group) => {
          const GroupIcon = group.icon
          return (
            <div className="global-search-group" key={group.type}>
              <div className="global-search-group-header">
                <div className="global-search-group-title">
                  <GroupIcon size={14} />
                  <span>{group.label}</span>
                </div>
                <span className="global-search-group-count">{group.items.length}</span>
              </div>
              {group.items.map((item) => {
                const itemIndex = runningIndex++
                const isHighlighted = itemIndex === highlightedIndex

                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={isHighlighted}
                    className={`global-search-item ${isHighlighted ? 'is-highlighted' : ''}`}
                    onClick={item.onSelect}
                    onMouseEnter={() => setHighlightedIndex(itemIndex)}
                  >
                    <div className="global-search-item-main">
                      <div className="global-search-item-title-row">
                        <span className="global-search-item-title">{item.title}</span>
                        {item.badge && (
                          <span className={`global-search-badge ${item.badge.className}`}>
                            {item.badge.text}
                          </span>
                        )}
                      </div>
                      <div className="global-search-item-sub">
                        {item.subItems.map((sub, sIdx) => (
                          <span key={sIdx}>
                            {sub.label && `${sub.label}: `}
                            {sub.isTag ? <span className="global-search-tag">{sub.value}</span> : sub.value}
                            {sIdx < item.subItems.length - 1 && ' · '}
                          </span>
                        ))}
                      </div>
                    </div>
                    {item.meta && (
                      <div className="global-search-item-meta">
                        <span>{item.meta.primary}</span>
                        {item.meta.secondary && <small>{item.meta.secondary}</small>}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    )
  }

  const isDropdownVisible = desktopOpen && (Boolean(query.trim()) || hasSearched || loading)

  return (
    <div className="global-search-container" ref={containerRef}>
      {/* --- Desktop Search Bar --- */}
      <div className="global-search-desktop">
        <div className="global-search-input-wrap">
          <Search size={16} className="global-search-icon" aria-hidden="true" />
          <input
            ref={desktopInputRef}
            type="search"
            role="combobox"
            aria-expanded={isDropdownVisible}
            aria-controls="global-search-desktop-results"
            aria-autocomplete="list"
            aria-label="Global record search"
            className="global-search-input"
            placeholder="Search inventory, pawns, loans, customers..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              if (!desktopOpen) setDesktopOpen(true)
            }}
            onFocus={() => setDesktopOpen(true)}
            onKeyDown={handleKeyDown}
          />
          <div className="global-search-actions-desktop">
            {loading && <div className="global-search-spinner" aria-label="Searching" />}
            {query && (
              <button
                type="button"
                className="global-search-clear-btn"
                onClick={handleClear}
                aria-label="Clear search query"
              >
                <X size={12} />
              </button>
            )}
            <kbd className="global-search-shortcut" title="Press Ctrl+K or Cmd+K to search">Ctrl K</kbd>
          </div>
        </div>

        {/* --- Desktop Dropdown --- */}
        {isDropdownVisible && (
          <div className="global-search-dropdown" role="region" aria-label="Search results">
            {renderResultsList(false)}
            {flattenedResults.length > 0 && (
              <div className="global-search-footer">
                <div className="global-search-footer-hints">
                  <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
                  <span><kbd><CornerDownLeft size={10} /></kbd> select</span>
                  <span><kbd>esc</kbd> close</span>
                </div>
                <span>{totalCount} total record{totalCount === 1 ? '' : 's'}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* --- Mobile Trigger Icon Button --- */}
      <button
        type="button"
        className="global-search-mobile-trigger"
        aria-label="Open search panel"
        aria-haspopup="dialog"
        onClick={() => {
          setMobileOpen(true)
        }}
      >
        <Search size={18} />
      </button>

      {/* --- Mobile Full-Width Search Panel --- */}
      {mobileOpen && createPortal((
        <div
          className="global-search-mobile-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Global record search"
        >
          <div className="global-search-mobile-header">
            <button
              type="button"
              className="global-search-mobile-back-btn"
              onClick={() => setMobileOpen(false)}
              aria-label="Close search panel"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="global-search-mobile-input-wrap">
              <input
                ref={mobileInputRef}
                type="search"
                role="combobox"
                aria-expanded="true"
                aria-controls="global-search-mobile-results"
                aria-autocomplete="list"
                aria-label="Search records"
                className="global-search-mobile-input"
                placeholder="Search records by SKU, IMEI, name..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
              />
              {loading && <div className="global-search-spinner" aria-label="Searching" />}
              {query && (
                <button
                  type="button"
                  className="global-search-clear-btn"
                  onClick={handleClear}
                  aria-label="Clear query"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
          <div className="global-search-mobile-body">
            {renderResultsList(true)}
          </div>
        </div>
      ), document.body)}
    </div>
  )
}
