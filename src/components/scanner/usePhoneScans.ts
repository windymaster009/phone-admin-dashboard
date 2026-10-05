import { useEffect, useRef } from 'react'
import { api } from '../../lib/api'

export type PhoneScanEvent = { _id: string; code: string; mode?: 'lookup' | 'input' }
type ScanBatch = { events: PhoneScanEvent[]; cursor: string; active: boolean }
const PENDING_RETRY_MS = 500
const ERROR_RETRY_MS = 2_000
const IDLE_RECONNECT_MS = 100
const LONG_POLL_SECONDS = 25

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
      let retryDelay = IDLE_RECONNECT_MS
      try {
        if (!document.hidden && pending.length) {
          if (await handler.current(pending[0])) pending.shift()
          retryDelay = pending.length ? PENDING_RETRY_MS : 0
          return
        }
        // Keep one quiet long request open so a phone can wake the desktop even
        // when this tab is in the background. No scan polling runs every second.
        if (pending.length < 50) {
          const query = new URLSearchParams({ wait: String(LONG_POLL_SECONDS) })
          if (cursor !== undefined) query.set('after', cursor)
          const batch = await api<ScanBatch>(`/scanner/events?${query}`, { signal: controller.signal }, { deduplicate: false })
          if (disposed) return
          pending.push(...batch.events)
          cursor = batch.cursor
        }
        if (!document.hidden && pending.length && await handler.current(pending[0])) pending.shift()
        retryDelay = pending.length ? PENDING_RETRY_MS : IDLE_RECONNECT_MS
      } catch {
        // Keep the cursor and queued scans across temporary network failures.
        retryDelay = ERROR_RETRY_MS
      } finally {
        if (!disposed) timer = setTimeout(poll, retryDelay)
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
