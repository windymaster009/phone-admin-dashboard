export const DAILY_PAWN_FEE_RATE = 2.5
export const PAWN_TERM_DAYS = Object.freeze([3, 7, 15, 30])

const DAY_MS = 86_400_000

export function pawnCurrencyCode(value) {
  return String(value || '').toUpperCase() === 'KHR' ? 'KHR' : 'USD'
}

export function roundPawnAmount(value, currency = 'USD') {
  const amount = Number(value) || 0
  return pawnCurrencyCode(currency) === 'KHR'
    ? Math.round(amount)
    : Math.round((amount + Number.EPSILON) * 100) / 100
}

export function validatePawnTermDays(value) {
  const termDays = Number(value)
  if (!PAWN_TERM_DAYS.includes(termDays)) {
    const error = new Error('Pawn term must be 3, 7, 15, or 30 days')
    error.status = 400
    throw error
  }
  return termDays
}

export function validateDailyPawnFeeRate(value) {
  const rate = Number(value)
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    const error = new Error('Daily pawn fee rate must be between 0 and 100')
    error.status = 400
    throw error
  }
  return Math.round((rate + Number.EPSILON) * 100) / 100
}

export function validateMaximumPawnPrincipal(principal, maximum, currency = 'USD') {
  const normalizedCurrency = pawnCurrencyCode(currency)
  const requested = roundPawnAmount(principal, normalizedCurrency)
  const limit = roundPawnAmount(maximum, normalizedCurrency)
  const tolerance = normalizedCurrency === 'KHR' ? 0 : 0.000001
  if (requested > limit + tolerance) {
    const error = new Error('Principal cannot exceed the valuation limit')
    error.status = 400
    throw error
  }
  return requested
}

export function addPawnDays(value, days) {
  const start = new Date(value)
  if (Number.isNaN(start.getTime())) throw new TypeError('Pawn start date is invalid')
  return new Date(start.getTime() + Number(days) * DAY_MS)
}

export function elapsedPawnDays(fromValue, toValue = new Date()) {
  const from = new Date(fromValue)
  const to = new Date(toValue)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS))
}

export function calculatePawnFee(principal, days, currency = 'USD', dailyFeeRate = DAILY_PAWN_FEE_RATE) {
  return roundPawnAmount(
    Math.max(0, Number(principal) || 0) * Math.max(0, Number(dailyFeeRate) || 0) / 100 * Math.max(0, Number(days) || 0),
    currency,
  )
}

export function isDailyPawn(pawn) {
  return pawn?.feeModel === 'DAILY_SIMPLE'
}

export function calculateDailyPawnSummary(pawn, asOf = new Date()) {
  const currency = pawnCurrencyCode(pawn?.currency)
  const principal = roundPawnAmount(Math.max(0, Number(pawn?.remainingPrincipal ?? pawn?.principal) || 0), currency)
  const rate = Number(pawn?.dailyFeeRate) || DAILY_PAWN_FEE_RATE
  const accrualStart = pawn?.feeAccrualStartedAt || pawn?.currentTermStartDate || pawn?.startDate || pawn?.issueDate || pawn?.createdAt
  const open = ['ACTIVE', 'DUE_SOON', 'OVERDUE', 'RENEWED'].includes(String(pawn?.status || 'ACTIVE'))
  const effectiveAsOf = open ? asOf : pawn?.redeemedAt || pawn?.forfeitedAt || pawn?.updatedAt || asOf
  const currentSegmentDays = elapsedPawnDays(accrualStart, effectiveAsOf)
  const currentSegmentFee = calculatePawnFee(principal, currentSegmentDays, currency, rate)
  const storedAccruedFee = roundPawnAmount(Math.max(0, Number(pawn?.accruedPawnFee) || 0), currency)
  const accruedFee = roundPawnAmount(storedAccruedFee + currentSegmentFee, currency)
  const otherFees = roundPawnAmount(Math.max(0, Number(pawn?.fees) || 0), currency)
  const termDays = Number(pawn?.termDays) || 0
  const termFee = calculatePawnFee(principal, termDays, currency, rate)
  const redemptionTotal = roundPawnAmount(principal + accruedFee + otherFees, currency)

  return {
    feeModel: 'DAILY_SIMPLE',
    dailyFeeRate: rate,
    termDays,
    accruedDays: elapsedPawnDays(pawn?.currentTermStartDate || pawn?.startDate || pawn?.issueDate || pawn?.createdAt, effectiveAsOf),
    accruedFee,
    feeAtDueDate: termFee,
    totalAtDueDate: roundPawnAmount(principal + termFee + otherFees, currency),
    redemptionTotal,
    remainingPrincipal: principal,
  }
}

export function materializeDailyPawnFee(pawn, at = new Date()) {
  if (!isDailyPawn(pawn)) return 0
  const currency = pawnCurrencyCode(pawn.currency)
  const start = pawn.feeAccrualStartedAt || pawn.currentTermStartDate || pawn.startDate || pawn.issueDate || pawn.createdAt
  const days = elapsedPawnDays(start, at)
  const addedFee = calculatePawnFee(pawn.remainingPrincipal ?? pawn.principal, days, currency, pawn.dailyFeeRate)
  pawn.accruedPawnFee = roundPawnAmount((Number(pawn.accruedPawnFee) || 0) + addedFee, currency)
  // Keep any uncompleted part of the current day instead of discarding it when
  // a payment is recorded between daily boundaries.
  pawn.feeAccrualStartedAt = addPawnDays(start, days)
  return addedFee
}
