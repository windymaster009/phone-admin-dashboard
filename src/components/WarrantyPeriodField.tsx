import { CalendarRange } from 'lucide-react'
import './warranty-period-field.css'

type WarrantyPeriodFieldProps = {
  value: string
  onChange: (value: string) => void
  kind: 'sale' | 'service'
}

export default function WarrantyPeriodField({ value, onChange, kind }: WarrantyPeriodFieldProps) {
  const days = Number(value)
  const invalid = value.trim() === '' || !Number.isInteger(days) || days < 0 || days > 3650
  const help = invalid
    ? 'Use a whole number from 0 to 3650.'
    : days === 0
      ? kind === 'sale' ? 'No refund warranty for this sale.' : 'No service warranty for this charge.'
      : kind === 'sale'
        ? `Refundable for ${days} day${days === 1 ? '' : 's'} after the sale.`
        : `${days} day${days === 1 ? '' : 's'} of service warranty.`

  return (
    <label className={`warranty-period-field${invalid ? ' field-invalid' : ''}`}>
      <span>Warranty period</span>
      <div className="warranty-period-input">
        <CalendarRange size={16} aria-hidden="true" />
        <input
          required
          type="number"
          inputMode="numeric"
          min="0"
          max="3650"
          step="1"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Enter days"
          aria-label="Warranty period in days"
        />
        <span>days</span>
      </div>
      <small>{help}</small>
    </label>
  )
}
