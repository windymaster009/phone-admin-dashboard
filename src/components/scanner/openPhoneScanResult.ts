import type { InventoryItem, RelatedPawn } from '../../features/operations/operationDomain'

export type PhoneScanResult = { item: InventoryItem; relatedPawn?: RelatedPawn | null }

export function openPhoneScanResult(result: PhoneScanResult) {
  if (result.relatedPawn?._id) {
    if (window.location.pathname === '/pawn-management') {
      window.dispatchEvent(new CustomEvent('phoneflow:open-pawn-detail', {
        detail: { id: result.relatedPawn._id, pawnNo: result.relatedPawn.pawnNo },
      }))
    } else {
      window.location.assign(`/pawn-management?openPawn=${encodeURIComponent(result.relatedPawn._id)}`)
    }
    return
  }
  if (window.location.pathname === '/stock') {
    window.dispatchEvent(new CustomEvent('phoneflow:open-stock-item', { detail: { item: result.item } }))
  } else {
    window.location.assign(`/stock?openItem=${encodeURIComponent(result.item._id)}`)
  }
}
