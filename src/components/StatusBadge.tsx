import { AlertTriangle, BadgeCheck, Boxes, Clock3, HandCoins, ShoppingCart, Wrench } from 'lucide-react'
import { titleStatus } from '../lib/presentation'

export default function StatusBadge({ status }: { status: string }) {
  const label = titleStatus(status)
  const slug = status.toLowerCase().replaceAll('_', '-')
  const Icon = status === 'IN_STOCK' || status === 'ACTIVE' || status === 'PAID'
    ? BadgeCheck
    : status === 'RESERVED' || status === 'DUE_SOON'
      ? Clock3
      : status === 'SOLD' || status === 'SALE'
        ? ShoppingCart
        : status === 'PAWNED'
          ? HandCoins
          : status === 'REPAIR'
            ? Wrench
            : status === 'ARCHIVED'
              ? Boxes
              : AlertTriangle

  return <span className={`status-badge status-${slug}`}><Icon size={14} strokeWidth={2} aria-hidden="true" />{label}</span>
}
