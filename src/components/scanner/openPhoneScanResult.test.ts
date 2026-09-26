import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InventoryItem, RelatedPawn } from '../../features/operations/operationDomain'
import { openPhoneScanResult } from './openPhoneScanResult'

const item = { _id: 'item-1', name: 'iPhone', sku: 'SKU-1' } as InventoryItem
const pawn = { _id: 'pawn-1', pawnNo: 'PW-20260926-KTAOI', status: 'ACTIVE' } as RelatedPawn

describe('desktop phone scan result', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('opens the exact pawn contract directly on pawn management', () => {
    window.history.replaceState({}, '', '/pawn-management')
    const listener = vi.fn()
    window.addEventListener('phoneflow:open-pawn-detail', listener, { once: true })
    openPhoneScanResult({ item, relatedPawn: pawn })
    expect(listener).toHaveBeenCalledOnce()
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ id: 'pawn-1', pawnNo: 'PW-20260926-KTAOI' })
  })

  it('opens the exact product directly on stock information', () => {
    window.history.replaceState({}, '', '/stock')
    const listener = vi.fn()
    window.addEventListener('phoneflow:open-stock-item', listener, { once: true })
    openPhoneScanResult({ item, relatedPawn: null })
    expect(listener).toHaveBeenCalledOnce()
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ item })
  })
})
