import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DAILY_PAWN_FEE_RATE,
  addPawnDays,
  calculateDailyPawnSummary,
  calculatePawnFee,
  calculatePawnExtensionQuote,
  dailyPawnFeeRateFromDueFee,
  materializeDailyPawnFee,
  validateMaximumPawnPrincipal,
  validateDailyPawnFeeRate,
} from './pawnFeeService.js'

test('calculates the required simple daily fee examples', () => {
  assert.equal(calculatePawnFee(20, 3), 1.5)
  assert.equal(calculatePawnFee(20, 7), 3.5)
  assert.equal(calculatePawnFee(20, 15), 7.5)
  assert.equal(calculatePawnFee(20, 30), 15)
})

test('counts the deposit date as billable day one for workflow version 5', () => {
  const start = new Date('2026-08-17T00:00:00.000Z')
  const due = addPawnDays(start, 6)
  const pawn = {
    feeModel: 'DAILY_SIMPLE', status: 'ACTIVE', workflowVersion: 5, currency: 'KHR',
    remainingPrincipal: 100_000, dailyFeeRate: 2, termDays: 7,
    startDate: start, currentTermStartDate: start, feeAccrualStartedAt: start,
    dueDate: due, accruedPawnFee: 0, fees: 0,
  }

  const firstDay = calculateDailyPawnSummary(pawn, start)
  assert.equal(firstDay.accruedDays, 1)
  assert.equal(firstDay.accruedFee, 2_000)
  assert.equal(firstDay.feeAtDueDate, 14_000)

  const dueDay = calculateDailyPawnSummary(pawn, due)
  assert.equal(dueDay.accruedDays, 7)
  assert.equal(dueDay.accruedFee, 14_000)
  assert.equal(due.toISOString(), '2026-08-23T00:00:00.000Z')
})

test('does not charge day one twice after its due payment is materialized', () => {
  const start = new Date('2026-08-17T00:00:00.000Z')
  const pawn = {
    feeModel: 'DAILY_SIMPLE', status: 'ACTIVE', workflowVersion: 5, currency: 'KHR',
    remainingPrincipal: 100_000, dailyFeeRate: 2, termDays: 7,
    startDate: start, currentTermStartDate: start, feeAccrualStartedAt: start,
    dueDate: addPawnDays(start, 6), accruedPawnFee: 0, fees: 0,
  }

  assert.equal(materializeDailyPawnFee(pawn, start), 2_000)
  pawn.accruedPawnFee = 0
  assert.equal(calculateDailyPawnSummary(pawn, start).accruedFee, 0)
  assert.equal(calculateDailyPawnSummary(pawn, addPawnDays(start, 1)).accruedFee, 2_000)
})

test('a seven-day extension adds seven new days without charging the paid day twice', () => {
  const start = new Date('2026-08-17T00:00:00.000Z')
  const extensionAt = addPawnDays(start, 3)
  const quote = calculatePawnExtensionQuote({
    feeModel: 'DAILY_SIMPLE', status: 'ACTIVE', workflowVersion: 5, currency: 'KHR',
    remainingPrincipal: 100_000, dailyFeeRate: 2, termDays: 7,
    startDate: start, currentTermStartDate: start,
    feeAccrualStartedAt: addPawnDays(extensionAt, 1),
    dueDate: addPawnDays(start, 6), accruedPawnFee: 0, fees: 0,
  }, 7, extensionAt)

  assert.equal(quote.elapsedContractDays, 4)
  assert.equal(quote.contractLengthDays, 11)
  assert.equal(quote.extensionStartsAt.toISOString(), addPawnDays(extensionAt, 1).toISOString())
  assert.equal(quote.newDueDate.toISOString(), addPawnDays(extensionAt, 7).toISOString())
})

test('validates an owner-entered daily fee rate', () => {
  assert.equal(validateDailyPawnFeeRate(2.5), 2.5)
  assert.equal(validateDailyPawnFeeRate('3.25'), 3.25)
  assert.throws(() => validateDailyPawnFeeRate(-1), /between 0 and 100/)
  assert.throws(() => validateDailyPawnFeeRate(101), /between 0 and 100/)
})

test('derives the daily rate from an owner-entered fee at due date', () => {
  const rate = dailyPawnFeeRateFromDueFee(100, 10, 7, 'USD')
  assert.equal(rate, 1.42857143)
  assert.equal(calculatePawnFee(100, 7, 'USD', rate), 10)
  assert.throws(() => dailyPawnFeeRateFromDueFee(0, 10, 7, 'USD'), /principal/)
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

test('daily pawn fee does not become principal', () => {
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

test('legacy early extension keeps its original start-today behavior', () => {
  const start = new Date('2026-08-01T00:00:00.000Z')
  const due = addPawnDays(start, 7)
  const quote = calculatePawnExtensionQuote({
    feeModel: 'DAILY_SIMPLE', status: 'ACTIVE', currency: 'KHR',
    remainingPrincipal: 50_000, dailyFeeRate: 2, termDays: 7,
    startDate: start, currentTermStartDate: start, feeAccrualStartedAt: start,
    dueDate: due, accruedPawnFee: 0, fees: 0,
  }, 7, addPawnDays(start, 4))

  assert.equal(quote.projectedExtensionFee, 7_000)
  assert.equal(quote.outstandingFeeBalance, 4_000)
  assert.equal(quote.paymentRecorded, 0)
  assert.equal(quote.dailyFeeRate, 2)
  assert.equal(quote.dailyFeeAmount, 1_000)
  assert.equal(quote.elapsedContractDays, 4)
  assert.equal(quote.contractLengthDays, 11)
  assert.equal(quote.extensionStartsAt.toISOString(), addPawnDays(start, 4).toISOString())
  assert.equal(quote.newDueDate.toISOString(), addPawnDays(start, 11).toISOString())
})

test('extended contract summary retains its saved daily rate and cumulative length', () => {
  const start = new Date('2026-08-01T00:00:00.000Z')
  const extensionStart = addPawnDays(start, 4)
  const summary = calculateDailyPawnSummary({
    feeModel: 'DAILY_SIMPLE', status: 'ACTIVE', currency: 'KHR',
    remainingPrincipal: 50_000, dailyFeeRate: 2, termDays: 7,
    startDate: start, currentTermStartDate: extensionStart,
    feeAccrualStartedAt: extensionStart, dueDate: addPawnDays(start, 11),
    renewals: [{ contractLengthDays: 11 }], accruedPawnFee: 0, fees: 0,
  }, addPawnDays(start, 11))

  assert.equal(summary.dailyFeeRate, 2)
  assert.equal(summary.dailyFeeAmount, 1_000)
  assert.equal(summary.feeAtDueDate, 7_000)
  assert.equal(summary.contractLengthDays, 11)
})

test('extension requires already accrued fees to be paid first', () => {
  const start = new Date('2026-08-01T00:00:00.000Z')
  const due = addPawnDays(start, 7)
  const quote = calculatePawnExtensionQuote({
    feeModel: 'DAILY_SIMPLE', status: 'ACTIVE', currency: 'USD',
    remainingPrincipal: 20, dailyFeeRate: 2.5, termDays: 7,
    startDate: start, currentTermStartDate: start, feeAccrualStartedAt: start,
    dueDate: due, accruedPawnFee: 0, fees: 0,
  }, 7, addPawnDays(start, 5))

  assert.equal(quote.accruedFee, 2.5)
  assert.equal(quote.outstandingFeeBalance, 2.5)
  assert.equal(quote.projectedExtensionFee, 3.5)
  assert.equal(quote.paymentRecorded, 0)
  assert.equal(quote.isEarlyExtension, true)
})

test('legacy overdue extension keeps its original start-today behavior', () => {
  const start = new Date('2026-08-01T00:00:00.000Z')
  const due = addPawnDays(start, 7)
  const extensionAt = addPawnDays(start, 8)
  const quote = calculatePawnExtensionQuote({
    feeModel: 'DAILY_SIMPLE', status: 'OVERDUE', currency: 'USD',
    remainingPrincipal: 20, dailyFeeRate: 2.5, termDays: 7,
    startDate: start, currentTermStartDate: start, feeAccrualStartedAt: start,
    dueDate: due, accruedPawnFee: 0, fees: 0,
  }, 7, extensionAt)

  assert.equal(quote.accruedFee, 4)
  assert.equal(quote.outstandingFeeBalance, 4)
  assert.equal(quote.projectedExtensionFee, 3.5)
  assert.equal(quote.paymentRecorded, 0)
  assert.equal(quote.isEarlyExtension, false)
  assert.equal(quote.extensionStartsAt.toISOString(), extensionAt.toISOString())
  assert.equal(quote.newDueDate.toISOString(), addPawnDays(extensionAt, 7).toISOString())
})
