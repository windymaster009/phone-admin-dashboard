import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeSaleWarrantyDays, normalizeTradeRefundRequest, restoreReturnedInventory, saleWarrantyStatus } from './tradeRefundService.js'

const sale = {
  tradeNo: 'SL-20260822-TEST',
  type: 'SELL',
  status: 'COMPLETED',
  paymentMethod: 'CASH',
  transactionAmountPaid: 25,
  amountPaid: 25,
}

test('normalizes an explicitly confirmed full cash refund', () => {
  assert.deepEqual(normalizeTradeRefundRequest({
    reason: '  Customer returned item  ',
    confirmation: sale.tradeNo,
    inventoryDisposition: 'restock',
  }, sale), {
    amount: 25,
    reason: 'Customer returned item',
    inventoryDisposition: 'RESTOCK',
  })
})

test('rejects a repeated refund', () => {
  assert.throws(
    () => normalizeTradeRefundRequest({ reason: 'Returned item', confirmation: sale.tradeNo, inventoryDisposition: 'RESTOCK' }, { ...sale, status: 'RETURNED' }),
    /already been refunded/,
  )
})

test('uses the same record-only refund rules for a historical non-cash sale', () => {
  assert.deepEqual(normalizeTradeRefundRequest({
    reason: 'Customer returned item',
    confirmation: sale.tradeNo,
    inventoryDisposition: 'NO_RESTOCK',
  }, { ...sale, paymentMethod: 'KHQR' }), {
    amount: 25,
    reason: 'Customer returned item',
    inventoryDisposition: 'NO_RESTOCK',
  })
})

test('normalizes a manually entered sale warranty', () => {
  assert.equal(normalizeSaleWarrantyDays('30'), 30)
  assert.equal(normalizeSaleWarrantyDays(0), 0)
  assert.throws(() => normalizeSaleWarrantyDays('2.5'), /whole number/)
  assert.throws(() => normalizeSaleWarrantyDays(3651), /between 0 and 3650/)
})

test('identifies active, expired, and missing sale warranties', () => {
  const now = new Date('2026-08-30T12:00:00.000Z')
  assert.equal(saleWarrantyStatus({ warrantyDays: 7, warrantyExpiresAt: '2026-09-03T12:00:00.000Z' }, now).state, 'ACTIVE')
  assert.equal(saleWarrantyStatus({ warrantyDays: 7, warrantyExpiresAt: '2026-08-29T12:00:00.000Z' }, now).state, 'EXPIRED')
  assert.equal(saleWarrantyStatus({ warrantyDays: 0 }, now).state, 'NO_WARRANTY')
  assert.equal(saleWarrantyStatus({}, now).state, 'NOT_RECORDED')
})

test('rejects refunds outside the recorded warranty', () => {
  assert.throws(
    () => normalizeTradeRefundRequest({ reason: 'Customer returned item', confirmation: sale.tradeNo, inventoryDisposition: 'RESTOCK' }, { ...sale, warrantyDays: 0 }),
    /without a refund warranty/,
  )
  assert.throws(
    () => normalizeTradeRefundRequest({ reason: 'Customer returned item', confirmation: sale.tradeNo, inventoryDisposition: 'RESTOCK' }, { ...sale, warrantyDays: 1, warrantyExpiresAt: '2020-01-01T00:00:00.000Z' }),
    /warranty expired/,
  )
})

test('restores serialized and quantity-based inventory safely', () => {
  const phone = { name: 'Phone', category: 'PHONE', quantity: 0, status: 'SOLD' }
  const accessory = { name: 'Cable', category: 'ACCESSORY', quantity: 4, status: 'IN_STOCK' }
  restoreReturnedInventory(phone, 1)
  restoreReturnedInventory(accessory, 3)
  assert.deepEqual(phone, { name: 'Phone', category: 'PHONE', quantity: 1, status: 'IN_STOCK' })
  assert.deepEqual(accessory, { name: 'Cable', category: 'ACCESSORY', quantity: 7, status: 'IN_STOCK' })
})

test('does not overwrite a serialized item that changed after its sale', () => {
  assert.throws(
    () => restoreReturnedInventory({ name: 'Phone', category: 'PHONE', quantity: 1, status: 'IN_STOCK' }, 1),
    /no longer matches/,
  )
})
