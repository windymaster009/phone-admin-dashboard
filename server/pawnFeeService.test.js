import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DAILY_PAWN_FEE_RATE,
  addPawnDays,
  calculateDailyPawnSummary,
  calculatePawnFee,
  validateMaximumPawnPrincipal,
} from './pawnFeeService.js'

test('calculates the required simple daily fee examples', () => {
  assert.equal(calculatePawnFee(20, 3), 1.5)
  assert.equal(calculatePawnFee(20, 7), 3.5)
  assert.equal(calculatePawnFee(20, 15), 7.5)
  assert.equal(calculatePawnFee(20, 30), 15)
})

test('enforces the valuation maximum while allowing a smaller principal', () => {
  assert.equal(validateMaximumPawnPrincipal(20, 47.5), 20)
  assert.throws(() => validateMaximumPawnPrincipal(47.51, 47.5), /valuation limit/)
})

test('charges only four elapsed days for early redemption', () => {
  const start = new Date('2026-08-01T00:00:00.000Z')
  const summary = calculateDailyPawnSummary({
    feeModel: 'DAILY_SIMPLE',
    status: 'ACTIVE',
    currency: 'USD',
    remainingPrincipal: 20,
    dailyFeeRate: DAILY_PAWN_FEE_RATE,
    termDays: 7,
    startDate: start,
    currentTermStartDate: start,
    feeAccrualStartedAt: start,
  }, addPawnDays(start, 4))

  assert.equal(summary.accruedFee, 2)
  assert.equal(summary.redemptionTotal, 22)
  assert.equal(summary.feeAtDueDate, 3.5)
  assert.equal(summary.totalAtDueDate, 23.5)
})

test('renewal fee does not become principal', () => {
  const start = new Date('2026-08-01T00:00:00.000Z')
  const due = addPawnDays(start, 7)
  const summary = calculateDailyPawnSummary({
    feeModel: 'DAILY_SIMPLE', status: 'ACTIVE', currency: 'USD',
    remainingPrincipal: 20, dailyFeeRate: 2.5, termDays: 7,
    startDate: start, currentTermStartDate: start, feeAccrualStartedAt: start,
  }, due)

  assert.equal(summary.accruedFee, 3.5)
  assert.equal(summary.remainingPrincipal, 20)
  assert.equal(addPawnDays(due, 7).toISOString(), '2026-08-15T00:00:00.000Z')
})
