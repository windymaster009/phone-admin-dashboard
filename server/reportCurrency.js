export const USD_KHR_FALLBACK_DEFAULT = 4100
export const KHR_RATE_MIN = 1000
export const KHR_RATE_MAX = 10000

export const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100

export function fallbackExchangeRate() {
  const configuredRate = Number(process.env.USD_KHR_FALLBACK_RATE)
  return isValidKhrRate(configuredRate) ? configuredRate : USD_KHR_FALLBACK_DEFAULT
}

export function isValidKhrRate(rate) {
  const num = Number(rate)
  return Number.isFinite(num) && num >= KHR_RATE_MIN && num <= KHR_RATE_MAX
}

export function resolveKhrExchangeRate(rate) {
  if (isValidKhrRate(rate)) {
    return { rate: Number(rate), isFallback: false }
  }
  return { rate: fallbackExchangeRate(), isFallback: true }
}

export function convertToUsd(amount, currency, exchangeRate) {
  const rawAmount = Number(amount || 0)
  if (currency !== 'KHR') {
    return {
      amountUsd: roundMoney(rawAmount),
      isFallback: false,
      rate: 1,
    }
  }

  const { rate, isFallback } = resolveKhrExchangeRate(exchangeRate)
  return {
    amountUsd: roundMoney(rawAmount / rate),
    isFallback,
    rate,
  }
}
