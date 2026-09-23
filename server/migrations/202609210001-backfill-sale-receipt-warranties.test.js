import assert from 'node:assert/strict'
import test from 'node:test'
import { up, down } from './202609210001-backfill-sale-receipt-warranties.js'

test('backfills only missing sale receipt warranties and can safely undo them', async () => {
  const savedExpiry = new Date('2026-10-21T06:17:21.248Z')
  const receipts = [
    { _id: 'new', sourceType: 'TRADE', sourceId: 'sale-1', documentType: 'SALE_RECEIPT', snapshot: {} },
    { _id: 'existing', sourceType: 'TRADE', sourceId: 'sale-2', documentType: 'SALE_RECEIPT', snapshot: { warrantyDays: 90 } },
    { _id: 'purchase', sourceType: 'TRADE', sourceId: 'purchase-1', documentType: 'PURCHASE_RECEIPT', snapshot: {} },
    { _id: 'no-warranty', sourceType: 'TRADE', sourceId: 'sale-3', documentType: 'SALE_RECEIPT', snapshot: {} },
  ]
  const trades = [
    { _id: 'sale-1', type: 'SELL', warrantyDays: 30, warrantyExpiresAt: savedExpiry },
    { _id: 'sale-2', type: 'SELL', warrantyDays: 90 },
    { _id: 'sale-3', type: 'SELL', warrantyDays: 0 },
  ]
  const db = {
    collection(name) {
      if (name === 'trades') return {
        find: ({ _id, type }) => ({
          project: () => ({ toArray: async () => trades.filter((trade) => _id.$in.includes(trade._id) && trade.type === type) }),
        }),
      }
      assert.equal(name, 'receipts')
      return {
        find: ({ sourceType, documentType }) => ({
          project: () => receipts.filter((receipt) => receipt.sourceType === sourceType
            && receipt.documentType === documentType
            && !Object.hasOwn(receipt.snapshot, 'warrantyDays')),
        }),
        bulkWrite: async (operations) => {
          for (const { updateOne } of operations) {
            const receipt = receipts.find((item) => item._id === updateOne.filter._id)
            if (!receipt || Object.hasOwn(receipt.snapshot, 'warrantyDays')) continue
            for (const [key, value] of Object.entries(updateOne.update.$set)) {
              receipt.snapshot[key.replace('snapshot.', '')] = value
            }
          }
        },
        updateMany: async (_filter, update) => {
          for (const receipt of receipts.filter((item) => item.snapshot.warrantyBackfilledFromTrade)) {
            for (const key of Object.keys(update.$unset)) delete receipt.snapshot[key.replace('snapshot.', '')]
          }
        },
      }
    },
  }

  await up(db)
  assert.equal(receipts[0].snapshot.warrantyDays, 30)
  assert.deepEqual(receipts[0].snapshot.warrantyExpiresAt, savedExpiry)
  assert.equal(receipts[0].snapshot.warrantyBackfilledFromTrade, true)
  assert.equal(receipts[1].snapshot.warrantyDays, 90)
  assert.deepEqual(receipts[2].snapshot, {})
  assert.deepEqual(receipts[3].snapshot, {})

  await down(db)
  assert.deepEqual(receipts[0].snapshot, {})
  assert.equal(receipts[1].snapshot.warrantyDays, 90)
})
