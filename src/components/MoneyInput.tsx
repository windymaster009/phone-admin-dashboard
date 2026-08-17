import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'

type Currency = 'USD' | 'KHR'

type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'inputMode' | 'min' | 'max'> & {
  currency: Currency
  value: number | string
  onValueChange: (value: string) => void
  minimum?: number
  maximum?: number
  clampToMaximum?: boolean
  onMaximumExceeded?: (maximum: number) => void
}

function cleanMoneyValue(value: number | string, currency: Currency) {
  const source = String(value ?? '').replaceAll(',', '').replace(/\s/g, '')
  if (currency === 'KHR') return source.replace(/\D/g, '')

  const cleaned = source.replace(/[^\d.]/g, '')
  const dot = cleaned.indexOf('.')
  if (dot < 0) return cleaned
  return `${cleaned.slice(0, dot)}.${cleaned.slice(dot + 1).replaceAll('.', '').slice(0, 2)}`
}

function formatMoneyValue(value: string) {
  if (!value) return ''
  const hasDecimal = value.includes('.')
  const [integer = '', decimal = ''] = value.split('.')
  const normalizedInteger = integer.replace(/^0+(?=\d)/, '') || '0'
  const grouped = normalizedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return hasDecimal ? `${grouped}.${decimal}` : grouped
}

export default function MoneyInput({
  currency,
  value,
  onValueChange,
  minimum = 0,
  maximum,
  clampToMaximum = false,
  onMaximumExceeded,
  name,
  required,
  onFocus,
  onBlur,
  ...props
}: MoneyInputProps) {
  const [draft, setDraft] = useState(() => cleanMoneyValue(value, currency))
  const focused = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!focused.current) setDraft(cleanMoneyValue(value, currency))
  }, [currency, value])

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    const amount = draft === '' || draft === '.' ? Number.NaN : Number(draft)
    if (draft && (!Number.isFinite(amount) || amount < minimum)) {
      input.setCustomValidity(`Enter an amount of at least ${formatMoneyValue(String(minimum))}.`)
    } else if (draft && currency === 'KHR' && amount !== 0 && amount % 100 !== 0) {
      input.setCustomValidity('Cambodian riel amounts must use increments of 100 KHR.')
    } else if (draft && maximum !== undefined && amount > maximum) {
      input.setCustomValidity(`Enter an amount no greater than ${formatMoneyValue(String(maximum))}.`)
    } else {
      input.setCustomValidity('')
    }
  }, [currency, draft, maximum, minimum])

  return <>
    <input
      {...props}
      ref={inputRef}
      type="text"
      inputMode={currency === 'KHR' ? 'numeric' : 'decimal'}
      value={formatMoneyValue(draft)}
      required={required}
      onFocus={(event) => {
        focused.current = true
        onFocus?.(event)
      }}
      onBlur={(event) => {
        focused.current = false
        setDraft(cleanMoneyValue(draft, currency))
        onBlur?.(event)
      }}
      onChange={(event) => {
        const cleanedValue = cleanMoneyValue(event.target.value, currency)
        const amount = Number(cleanedValue)
        const exceedsMaximum = Boolean(
          cleanedValue
          && maximum !== undefined
          && Number.isFinite(amount)
          && amount > maximum
        )
        const nextValue = clampToMaximum && exceedsMaximum
          ? cleanMoneyValue(maximum ?? 0, currency)
          : cleanedValue
        setDraft(nextValue)
        onValueChange(nextValue)
        if (exceedsMaximum && maximum !== undefined) onMaximumExceeded?.(maximum)
      }}
    />
    {name && <input type="hidden" name={name} value={draft} />}
  </>
}
