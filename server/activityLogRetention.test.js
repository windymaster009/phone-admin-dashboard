import assert from 'node:assert/strict'
import test from 'node:test'
import { ActivityLog, computeActivityLogExpiresAt } from './models.js'

test('computeActivityLogExpiresAt uses default 90 days for operational entities', () => {
  const previousEnv = process.env.ACTIVITY_LOG_RETENTION_DAYS
  delete process.env.ACTIVITY_LOG_RETENTION_DAYS

  try {
    const createdAt = new Date('2026-01-01T00:00:00.000Z')
    const expiresAt = computeActivityLogExpiresAt('TRADE', createdAt)
    const expected = new Date('2026-04-01T00:00:00.000Z') // 90 days in 2026 (non-leap year)
    assert.equal(expiresAt.toISOString(), expected.toISOString())
  } finally {
    process.env.ACTIVITY_LOG_RETENTION_DAYS = previousEnv
  }
})

test('computeActivityLogExpiresAt uses default 180 days for security entities', () => {
  const previousEnv = process.env.SECURITY_EVENT_RETENTION_DAYS
  delete process.env.SECURITY_EVENT_RETENTION_DAYS

  try {
    const createdAt = new Date('2026-01-01T00:00:00.000Z')
    const expiresAt = computeActivityLogExpiresAt('AUTH_SESSION', createdAt)
    const expected = new Date('2026-06-30T00:00:00.000Z') // 180 days in 2026
    assert.equal(expiresAt.toISOString(), expected.toISOString())
  } finally {
    process.env.SECURITY_EVENT_RETENTION_DAYS = previousEnv
  }
})

test('computeActivityLogExpiresAt respects custom environment variables', () => {
  const prevAct = process.env.ACTIVITY_LOG_RETENTION_DAYS
  const prevSec = process.env.SECURITY_EVENT_RETENTION_DAYS

  try {
    process.env.ACTIVITY_LOG_RETENTION_DAYS = '30'
    process.env.SECURITY_EVENT_RETENTION_DAYS = '60'

    const createdAt = new Date('2026-01-01T00:00:00.000Z')
    const actExp = computeActivityLogExpiresAt('INVENTORY', createdAt)
    const secExp = computeActivityLogExpiresAt('AUTH_SESSION', createdAt)

    const expectedAct = new Date('2026-01-31T00:00:00.000Z')
    const expectedSec = new Date('2026-03-02T00:00:00.000Z')

    assert.equal(actExp.toISOString(), expectedAct.toISOString())
    assert.equal(secExp.toISOString(), expectedSec.toISOString())
  } finally {
    process.env.ACTIVITY_LOG_RETENTION_DAYS = prevAct
    process.env.SECURITY_EVENT_RETENTION_DAYS = prevSec
  }
})

test('ActivityLog pre-validate hook sets expiresAt automatically', async () => {
  const log = new ActivityLog({
    action: 'CREATE',
    entity: 'PAWN',
    createdAt: new Date('2026-05-01T12:00:00.000Z'),
  })

  await log.validate()
  assert.ok(log.expiresAt instanceof Date)
  assert.ok(log.expiresAt > log.createdAt)
})

test('ActivityLog preserves explicit expiresAt if provided', async () => {
  const explicitDate = new Date('2099-12-31T23:59:59.000Z')
  const log = new ActivityLog({
    action: 'DELETE',
    entity: 'CUSTOMER',
    expiresAt: explicitDate,
  })

  await log.validate()
  assert.equal(log.expiresAt.toISOString(), explicitDate.toISOString())
})
