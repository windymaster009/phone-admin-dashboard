import React from 'react'
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GlobalSearch from './GlobalSearch'
import { RouterProvider } from '../../app/routing'
import * as apiModule from '../../lib/api'

describe('GlobalSearch Component', () => {
  let mockNavigate: ReturnType<typeof vi.fn<(path: string) => void>>

  beforeEach(() => {
    mockNavigate = vi.fn<(path: string) => void>()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  function renderSearch(customNavigate: (path: string) => void = mockNavigate) {
    return render(
      <RouterProvider>
        <GlobalSearch onNavigate={customNavigate} />
      </RouterProvider>,
    )
  }

  const sampleSearchResponse = {
    query: 'iphone',
    results: {
      inventory: [
        {
          _id: 'inv-1',
          productName: 'iPhone 15 Pro Max',
          brand: 'Apple',
          model: '15 Pro Max',
          sku: 'APL-15PM-256',
          barcode: '880609123456',
          imei: '356987123456789',
          serialNumber: 'F2LXK999',
          category: 'PHONE',
          salePrice: 1199,
          currency: 'USD' as const,
          quantity: 4,
          status: 'IN_STOCK',
        },
      ],
      pawns: [
        {
          _id: 'pawn-1',
          pawnNo: 'P-1002',
          customerName: 'Dara Sok',
          customerPhone: '012345678',
          collateral: 'iPhone 14 Pro 128GB Gold',
          loanAmount: 450,
          currency: 'USD' as const,
          status: 'ACTIVE',
          dueDate: '2026-10-15T00:00:00.000Z',
        },
      ],
      loans: [
        {
          _id: 'loan-1',
          loanNo: 'LN-2026-004',
          customerName: 'Bona Chen',
          customerPhone: '098765432',
          borrowerMode: 'EXISTING',
          principal: 800,
          remainingBalance: 600,
          currency: 'USD' as const,
          status: 'ACTIVE',
          dueDate: '2026-11-20T00:00:00.000Z',
        },
      ],
      customers: [
        {
          _id: 'cust-1',
          name: 'Dara Sok',
          phone: '012345678',
          nationalIdNumber: '010999888',
          active: true,
        },
      ],
      services: [
        {
          _id: 'srv-1',
          code: 'SVC-SCRN',
          name: 'iPhone Screen Replacement',
          category: 'DEVICE_SETUP',
          price: 85,
          currency: 'USD' as const,
          active: true,
        },
      ],
      suppliers: [
        {
          _id: 'sup-1',
          name: 'Apple Authorized Distributor',
          phone: '023888999',
          active: true,
        },
      ],
    },
    total: 6,
  }

  it('renders the compact desktop search input with shortcut hint', () => {
    renderSearch()
    const input = screen.getByRole('combobox', { name: /Global record search/i })
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('placeholder', 'Search inventory, pawns, loans, customers...')
    expect(screen.getByText('Ctrl K')).toBeInTheDocument()
  })

  it('opens and focuses search on Ctrl+K or Cmd+K shortcut', async () => {
    renderSearch()
    const input = screen.getByRole('combobox', { name: /Global record search/i })

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(input).toHaveFocus()

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(input).toHaveFocus()
  })

  it('debounces user input before calling the search API', async () => {
    const apiSpy = vi.spyOn(apiModule, 'api').mockResolvedValue(sampleSearchResponse)
    renderSearch()

    const input = screen.getByRole('combobox', { name: /Global record search/i })
    fireEvent.change(input, { target: { value: 'iphone' } })

    // Before 250ms: no call yet
    expect(apiSpy).not.toHaveBeenCalled()

    // Advance timers by 250ms
    await act(async () => {
      vi.advanceTimersByTime(250)
    })

    expect(apiSpy).toHaveBeenCalledWith('/search?q=iphone', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('aborts stale in-flight requests when a new query is entered', async () => {
    let capturedSignal: AbortSignal | undefined

    vi.spyOn(apiModule, 'api').mockImplementation((_path, opts: any) => {
      capturedSignal = opts?.signal
      return new Promise(() => {}) // never resolves to keep in flight
    })

    renderSearch()
    const input = screen.getByRole('combobox', { name: /Global record search/i })

    // Type first query
    fireEvent.change(input, { target: { value: 'iph' } })
    await act(async () => {
      vi.advanceTimersByTime(250)
    })

    const firstSignal = capturedSignal
    expect(firstSignal?.aborted).toBe(false)

    // Type second query immediately
    fireEvent.change(input, { target: { value: 'iphone' } })
    await act(async () => {
      vi.advanceTimersByTime(250)
    })

    // First request should now be aborted
    expect(firstSignal?.aborted).toBe(true)
  })

  it('displays grouped results with rich contextual information to distinguish records', async () => {
    vi.spyOn(apiModule, 'api').mockResolvedValue(sampleSearchResponse)
    renderSearch()

    const input = screen.getByRole('combobox', { name: /Global record search/i })
    fireEvent.change(input, { target: { value: 'iphone' } })

    await act(async () => {
      vi.advanceTimersByTime(250)
    })

    // Group headers
    expect(screen.getByText('Inventory / Stock')).toBeInTheDocument()
    expect(screen.getByText('Pawn Contracts')).toBeInTheDocument()
    expect(screen.getByText('Loans')).toBeInTheDocument()
    expect(screen.getByText('Customers')).toBeInTheDocument()
    expect(screen.getByText('Services')).toBeInTheDocument()
    expect(screen.getByText('Suppliers')).toBeInTheDocument()

    // Inventory context
    expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
    expect(screen.getByText('APL-15PM-256')).toBeInTheDocument()
    expect(screen.getByText('356987123456789')).toBeInTheDocument()
    expect(screen.getByText('$1,199')).toBeInTheDocument()
    expect(screen.getByText('Qty: 4')).toBeInTheDocument()

    // Pawn context
    expect(screen.getByText('Pawn #P-1002')).toBeInTheDocument()
    expect(screen.getByText(/iPhone 14 Pro 128GB Gold/)).toBeInTheDocument()
    expect(screen.getByText('$450')).toBeInTheDocument()

    // Loan context
    expect(screen.getByText('Loan #LN-2026-004')).toBeInTheDocument()
    expect(screen.getByText(/Bona Chen/)).toBeInTheDocument()
    expect(screen.getByText('$600')).toBeInTheDocument()

    // Customer context
    expect(screen.getByText('010999888')).toBeInTheDocument()
  })

  it('navigates to and dispatches custom events to open exact records on selection', async () => {
    vi.spyOn(apiModule, 'api').mockResolvedValue(sampleSearchResponse)
    const stockEventSpy = vi.fn()
    const pawnEventSpy = vi.fn()
    const loanEventSpy = vi.fn()
    const customerEventSpy = vi.fn()

    window.addEventListener('phoneflow:open-stock-item', stockEventSpy)
    window.addEventListener('phoneflow:open-pawn-detail', pawnEventSpy)
    window.addEventListener('phoneflow:open-loan-detail', loanEventSpy)
    window.addEventListener('phoneflow:open-customer-detail', customerEventSpy)

    renderSearch()
    const input = screen.getByRole('combobox', { name: /Global record search/i })
    fireEvent.change(input, { target: { value: 'iphone' } })

    await act(async () => {
      vi.advanceTimersByTime(250)
    })

    // 1. Select inventory item
    const inventoryItem = screen.getByText('iPhone 15 Pro Max').closest('button')!
    fireEvent.click(inventoryItem)
    expect(mockNavigate).toHaveBeenCalledWith('/stock?openItem=inv-1')
    expect(stockEventSpy).toHaveBeenCalled()
    expect((stockEventSpy.mock.calls[0][0] as CustomEvent).detail).toEqual({ id: 'inv-1' })

    // Reopen search and select pawn
    fireEvent.focus(input)
    const pawnItem = screen.getByText('Pawn #P-1002').closest('button')!
    fireEvent.click(pawnItem)
    expect(mockNavigate).toHaveBeenCalledWith('/pawn-management?openPawn=pawn-1')
    expect(pawnEventSpy).toHaveBeenCalled()
    expect((pawnEventSpy.mock.calls[0][0] as CustomEvent).detail).toEqual({ id: 'pawn-1', pawnNo: 'P-1002' })

    // Reopen search and select loan
    fireEvent.focus(input)
    const loanItem = screen.getByText('Loan #LN-2026-004').closest('button')!
    fireEvent.click(loanItem)
    expect(mockNavigate).toHaveBeenCalledWith('/loans?openLoan=loan-1')
    expect(loanEventSpy).toHaveBeenCalled()

    // Reopen search and select customer
    fireEvent.focus(input)
    const customerItem = screen.getByText('010999888').closest('button')!
    fireEvent.click(customerItem)
    expect(mockNavigate).toHaveBeenCalledWith('/customers?openCustomer=cust-1')
    expect(customerEventSpy).toHaveBeenCalled()

    window.removeEventListener('phoneflow:open-stock-item', stockEventSpy)
    window.removeEventListener('phoneflow:open-pawn-detail', pawnEventSpy)
    window.removeEventListener('phoneflow:open-loan-detail', loanEventSpy)
    window.removeEventListener('phoneflow:open-customer-detail', customerEventSpy)
  })

  it('supports arrow key navigation, Enter to select, and Escape to dismiss', async () => {
    vi.spyOn(apiModule, 'api').mockResolvedValue(sampleSearchResponse)
    renderSearch()

    const input = screen.getByRole('combobox', { name: /Global record search/i })
    fireEvent.change(input, { target: { value: 'iphone' } })

    await act(async () => {
      vi.advanceTimersByTime(250)
    })

    const options = screen.getAllByRole('option')
    expect(options.length).toBe(6)

    // Initially first item is highlighted
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    // Arrow down moves highlight to second item (pawn)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(options[1]).toHaveAttribute('aria-selected', 'true')

    // Arrow down moves highlight to third item (loan)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(options[2]).toHaveAttribute('aria-selected', 'true')

    // Arrow up moves back to second item
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(options[1]).toHaveAttribute('aria-selected', 'true')

    // Enter selects the currently highlighted pawn item
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockNavigate).toHaveBeenCalledWith('/pawn-management?openPawn=pawn-1')

    // Reopen and test Escape
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: /Search results/i })).not.toBeInTheDocument()
  })

  it('handles empty results, error state, and query clearing', async () => {
    const apiSpy = vi.spyOn(apiModule, 'api')

    // 1. Empty state
    apiSpy.mockResolvedValueOnce({
      query: 'unknown-item',
      results: {},
      total: 0,
    })

    renderSearch()
    const input = screen.getByRole('combobox', { name: /Global record search/i })
    fireEvent.change(input, { target: { value: 'unknown-item' } })

    await act(async () => {
      vi.advanceTimersByTime(250)
    })

    expect(screen.getByText('No records found')).toBeInTheDocument()

    // 2. Clear button
    const clearBtn = screen.getByRole('button', { name: /Clear search query/i })
    fireEvent.click(clearBtn)
    expect(input).toHaveValue('')

    // 3. Error state
    apiSpy.mockRejectedValueOnce(new Error('Network disconnected'))
    fireEvent.change(input, { target: { value: 'error-query' } })

    await act(async () => {
      vi.advanceTimersByTime(250)
    })

    expect(screen.getByText('Search error')).toBeInTheDocument()
    expect(screen.getByText('Network disconnected')).toBeInTheDocument()
  })

  it('renders mobile trigger button and opens full-width search panel', async () => {
    vi.spyOn(apiModule, 'api').mockResolvedValue(sampleSearchResponse)
    renderSearch()

    const mobileTrigger = screen.getByRole('button', { name: /Open search panel/i })
    expect(mobileTrigger).toBeInTheDocument()

    // Clicking trigger opens mobile dialog panel
    fireEvent.click(mobileTrigger)
    const mobileDialog = screen.getByRole('dialog', { name: /Global record search/i })
    expect(mobileDialog).toBeInTheDocument()
    expect(mobileDialog.parentElement).toBe(document.body)

    // Mobile input is autofocusable and functional
    const mobileInput = screen.getByRole('combobox', { name: /Search records/i })
    expect(mobileInput).toBeInTheDocument()

    fireEvent.change(mobileInput, { target: { value: 'iphone' } })
    await act(async () => {
      vi.advanceTimersByTime(250)
    })

    expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()

    // Close button dismisses the mobile panel
    const closeBtn = screen.getByRole('button', { name: /Close search panel/i })
    fireEvent.click(closeBtn)
    expect(screen.queryByRole('dialog', { name: /Global record search/i })).not.toBeInTheDocument()
  })
})
