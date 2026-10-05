import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { usePhoneScans } from './usePhoneScans'

vi.mock('../../lib/api', () => ({ api: vi.fn() }))

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('phone scan relay', () => {
  it('initializes a cursor, queues scans during forms, and delivers each once in order', async () => {
    vi.useFakeTimers()
    vi.mocked(api).mockResolvedValueOnce({ events: [], cursor: '0' })
      .mockResolvedValueOnce({ events: [{ _id: 'a', code: 'SKU-1' }, { _id: 'b', code: 'SKU-2' }], cursor: 'b' })
      .mockResolvedValue({ events: [], cursor: 'b' })
    const receive = vi.fn().mockReturnValue(false)
    const { unmount } = renderHook(() => usePhoneScans(receive))
    await act(async () => {})
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(receive).toHaveBeenLastCalledWith({ _id: 'a', code: 'SKU-1' })
    receive.mockReturnValue(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(receive.mock.calls.map(([event]) => event.code)).toEqual(['SKU-1', 'SKU-1', 'SKU-2'])
    expect(api).toHaveBeenLastCalledWith('/scanner/events?wait=25&after=b', expect.anything(), expect.anything())
    unmount()
    const count = vi.mocked(api).mock.calls.length
    await vi.advanceTimersByTimeAsync(1000)
    expect(api).toHaveBeenCalledTimes(count)
  })

  it('retains its cursor across network failures', async () => {
    vi.useFakeTimers()
    vi.mocked(api).mockResolvedValueOnce({ events: [], cursor: 'a' })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ events: [{ _id: 'b', code: 'SKU-2' }], cursor: 'b' })
      .mockResolvedValue({ events: [], cursor: 'b' })
    const receive = vi.fn().mockReturnValue(true)
    const { unmount } = renderHook(() => usePhoneScans(receive))
    await act(async () => {})
    await act(async () => { await vi.advanceTimersByTimeAsync(2200) })
    expect(vi.mocked(api).mock.calls[2][0]).toBe('/scanner/events?wait=25&after=a')
    expect(receive).toHaveBeenCalledExactlyOnceWith({ _id: 'b', code: 'SKU-2' })
    unmount()
  })

  it('does not duplicate native phone results', () => {
    vi.stubGlobal('PhoneFlowAndroid', {})
    renderHook(() => usePhoneScans(vi.fn()))
    expect(api).not.toHaveBeenCalled()
  })
})
