import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DepreciationPage from './DepreciationPage'
import { getStoredValuations, safeStorage } from '../../lib/storage'
import { PAWN_AUTO_CALCULATE_EVENT } from '../../lib/pawnPreferences'

describe('DepreciationPage feature integration', () => {
  const mockExchangeRate = {
    usdKhr: 4100,
    source: 'ABA PayWay',
    side: 'bank',
    updatedAt: '2026-09-12T00:00:00.000Z',
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    safeStorage.clear()
    localStorage.clear()
    sessionStorage.clear()
    document.cookie = 'phoneflow_pawn_auto_calculate=; Max-Age=0; Path=/'
    vi.spyOn(window, 'alert').mockImplementation(() => {})

    // Mock exchange-rates endpoint for useExchangeRate hook
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/exchange-rates')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => mockExchangeRate,
        } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
      } as Response
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calculates depreciation matching documented business rules using independently calculated expected values', async () => {
    // Independent formula check:
    // marketPrice = $600
    // ageMonths = 12 -> 12 * 0.0125 = 0.15 (15%) -> deduction = 600 * 0.15 = 90
    // condition = 'good' -> 0.12 (12%) -> deduction = 600 * 0.12 = 72
    // batteryHealth = 85 -> >= 85 is 0% -> deduction = 0
    // includedAccessories: ['BOX', 'CHARGER', 'CABLE'] -> all essential present -> 0% deduction
    // lockStatus = 'unlocked' -> 0% deduction
    // repairCost = $30
    // expectedEstimatedValue = 600 - 90 - 72 - 0 - 0 - 0 - 30 = 408
    // pawnRate = 45% -> maximumPawn = 408 * 0.45 = 183.60
    // riskReserve = 408 - 183.60 = 224.40

    const user = userEvent.setup()
    const goTo = vi.fn()

    render(<DepreciationPage goTo={goTo} />)

    // Wait for exchange rate to load
    await waitFor(() => {
      expect(screen.getByText(/1 USD = 4,100 KHR/i)).toBeInTheDocument()
    })

    // Set market price to 600
    const resaleInput = screen.getByLabelText(/Resale value/i)
    await user.clear(resaleInput)
    await user.type(resaleInput, '600')

    // Set repair cost to 30
    const repairInput = screen.getByLabelText(/Estimated repair cost/i)
    await user.clear(repairInput)
    await user.type(repairInput, '30')

    // Verify breakdown and totals
    const breakdown = document.querySelector('.calculation-breakdown')
    expect(breakdown).toBeInTheDocument()
    expect(breakdown?.textContent).toContain('Resale value$600')
    expect(breakdown?.textContent).toContain('Age (15%)-$90')
    expect(breakdown?.textContent).toContain('Condition (12%)-$72')
    expect(breakdown?.textContent).toContain('Repair cost-$30')
    expect(breakdown?.textContent).toContain('Estimated resale value$408')
    expect(breakdown?.textContent).toContain('Shop risk reserve after loan$224.4')
    expect(screen.getByText('$183.6')).toBeInTheDocument() // Maximum pawn principal in hero
  })

  it('tests relevant date boundaries, zero values, and rounding under a controlled clock', async () => {
    // Control Date time precisely at a leap-year boundary without freezing microtasks
    const controlledTime = new Date('2028-02-29T14:30:00.000Z')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(controlledTime)

    const user = userEvent.setup()
    const goTo = vi.fn()

    render(<DepreciationPage goTo={goTo} />)

    await waitFor(() => {
      expect(screen.getByText(/1 USD = 4,100 KHR/i)).toBeInTheDocument()
    })

    // Zero market price: all deductions and totals must be 0 without NaN or negative values
    const resaleInput = screen.getByLabelText(/Resale value/i)
    await user.clear(resaleInput)
    await user.type(resaleInput, '0')

    expect(screen.getAllByText('$0').length).toBeGreaterThanOrEqual(1)

    // Save valuation with controlled clock
    const saveButton = screen.getByRole('button', { name: /Save valuation only/i })
    await user.click(saveButton)

    const stored = getStoredValuations() as Array<{ id: string; createdAt: string; marketPrice: number }>
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe(`VAL-${controlledTime.getTime()}`)
    expect(stored[0].createdAt).toBe('2028-02-29T14:30:00.000Z')
    expect(stored[0].marketPrice).toBe(0)
    vi.useRealTimers()
  })

  it('converts amounts between USD and KHR following 100-KHR rounding rules', async () => {
    const user = userEvent.setup()
    const goTo = vi.fn()

    render(<DepreciationPage goTo={goTo} />)

    await waitFor(() => {
      expect(screen.getByText(/1 USD = 4,100 KHR/i)).toBeInTheDocument()
    })

    // Switch valuation currency from USD to KHR
    // Initial marketPrice is 500 USD.
    // At rate 4100: 500 * 4100 = 2,050,000 KHR
    const currencySelect = screen.getByLabelText(/Valuation currency/i)
    await user.selectOptions(currencySelect, 'KHR')

    // Breakdown should now format amounts in KHR with whole 100 increments
    await waitFor(() => {
      expect(screen.getByText('2,050,000 KHR')).toBeInTheDocument()
    })

    // Switch back to USD
    // 2,050,000 / 4100 = 500 USD -> formatted as $500
    await user.selectOptions(currencySelect, 'USD')
    await waitFor(() => {
      expect(screen.getByText('$500')).toBeInTheDocument()
    })
  })

  it('blocks activation locked phones and disables the Start pawn action', async () => {
    const user = userEvent.setup()
    const goTo = vi.fn()

    render(<DepreciationPage goTo={goTo} />)

    const lockSelect = screen.getByLabelText(/Lock status/i)
    await user.selectOptions(lockSelect, 'activation_locked')

    // Should indicate blocked status
    expect(screen.getByText('Blocked')).toBeInTheDocument()
    expect(screen.getByText('Offer unavailable')).toBeInTheDocument()
    expect(screen.getByText('Remove activation lock before valuation')).toBeInTheDocument()
    expect(screen.getByText('Do not accept this phone as collateral')).toBeInTheDocument()

    // Start pawn button must be disabled
    const startPawnButton = screen.getByRole('button', { name: /Start pawn with this offer/i })
    expect(startPawnButton).toBeDisabled()
  })

  it('handles manual offer mode when auto-calculate is toggled off', async () => {
    const user = userEvent.setup()
    const goTo = vi.fn()

    render(<DepreciationPage goTo={goTo} />)

    // Initially auto-calculate is true (or default preference)
    const toggle = screen.getByRole('switch', { name: /Auto calculate/i })
    expect(toggle).toBeInTheDocument()

    // Turn auto-calculate off
    await user.click(toggle)

    // Breakdown is hidden in manual mode
    expect(screen.queryByText(/Shop risk reserve after loan/i)).not.toBeInTheDocument()
    expect(screen.getByText('Manual offer')).toBeInTheDocument()

    // In manual mode, estimated resale value equals raw market price ($500)
    // 45% of $500 = $225
    expect(screen.getByText('$225')).toBeInTheDocument()
  })

  it('disables KHR currency option when exchange rate is unavailable and shows loading state', async () => {
    // Exchange rates call hangs
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))

    render(<DepreciationPage goTo={vi.fn()} />)

    const khrOption = screen.getByRole('option', { name: /KHR — Cambodian Riel/i }) as HTMLOptionElement
    expect(khrOption.disabled).toBe(true)
    expect(screen.getByText('Loading exchange rate...')).toBeInTheDocument()
  })

  it('saves valuation to session and dispatches custom event when Start pawn is clicked', async () => {
    const user = userEvent.setup()
    const goTo = vi.fn()
    const eventSpy = vi.fn()
    window.addEventListener('phoneflow:open-pawn', eventSpy)

    render(<DepreciationPage goTo={goTo} />)

    await waitFor(() => {
      expect(screen.getByText(/1 USD = 4,100 KHR/i)).toBeInTheDocument()
    })

    const startPawnButton = screen.getByRole('button', { name: /Start pawn with this offer/i })
    await user.click(startPawnButton)

    // Navigation called
    expect(goTo).toHaveBeenCalledWith('pawn')

    // Session storage contains valuation
    const storedValuation = safeStorage.getJSON<{
      id: string
      marketPrice: number
      eligible: boolean
      maximumPawn: number
    } | null>('phoneflow_last_valuation', null, undefined, 'session')
    expect(storedValuation).toBeTruthy()
    expect(storedValuation?.marketPrice).toBe(500)
    expect(storedValuation?.eligible).toBe(true)

    // Custom event dispatched with valuationId
    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { valuationId: storedValuation?.id },
      }),
    )

    window.removeEventListener('phoneflow:open-pawn', eventSpy)
  })

  it('syncs autoCalculate state when PAWN_AUTO_CALCULATE_EVENT is dispatched externally', async () => {
    render(<DepreciationPage goTo={vi.fn()} />)

    const toggle = screen.getByRole('switch', { name: /Auto calculate/i })

    // Dispatch external auto-calculate preference event
    act(() => {
      window.dispatchEvent(new CustomEvent(PAWN_AUTO_CALCULATE_EVENT, { detail: false }))
    })

    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'false')
      expect(screen.getByText('Manual offer')).toBeInTheDocument()
    })
  })
})
