import { useEffect, useRef } from 'react'
import { api } from '../../lib/api'

export type PhoneScanEvent = { _id: string; code: string; mode?: 'lookup' | 'input' }
type ScanBatch = { events: PhoneScanEvent[]; cursor: string }
const POLL_INTERVAL_MS = 500

/** Return false to keep the next scan queued while a form or dialog is open. */
export function usePhoneScans(onScan: (event: PhoneScanEvent) => boolean | Promise<boolean>) {
  const handler = useRef(onScan)
  handler.current = onScan

  useEffect(() => {
    // The native app already presents its own result.
    if ('PhoneFlowAndroid' in window || /Android|iPhone|iPad/i.test(navigator.userAgent)) return
    let disposed = false
    let cursor: string | undefined
    let timer: ReturnType<typeof setTimeout>
    const pending: PhoneScanEvent[] = []
    const controller = new AbortController()
    async function poll() {
      try {
        // Initialize even in a background tab, then catch up when it is visible.
        if (!document.hidden || cursor === undefined) {
          if (pending.length < 50) {
            const suffix = cursor === undefined ? '' : `?after=${encodeURIComponent(cursor)}`
            const batch = await api<ScanBatch>(`/scanner/events${suffix}`, { signal: controller.signal }, { deduplicate: false })
            if (disposed) return
            pending.push(...batch.events)
            cursor = batch.cursor
          }
          if (!document.hidden && pending.length && await handler.current(pending[0])) pending.shift()
        }
      } catch {
        // Keep the cursor and queued scans across temporary network failures.
      } finally {
        if (!disposed) timer = setTimeout(poll, POLL_INTERVAL_MS)
      }
    }
    void poll()
    return () => {
      disposed = true
      controller.abort()
      clearTimeout(timer)
    }
  }, [])
}
