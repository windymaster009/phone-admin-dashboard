export const id = '202609210001'
export const description = 'Restore recorded sale warranties to existing receipt snapshots'

const batchSize = 100

async function backfillBatch(db, batch) {
  if (!batch.length) return
  const trades = await db.collection('trades').find({
    _id: { $in: batch.map((receipt) => receipt.sourceId) },
    type: 'SELL',
  }).project({ warrantyDays: 1, warrantyExpiresAt: 1 }).toArray()
  const tradeById = new Map(trades.map((trade) => [String(trade._id), trade]))
  const operations = []

  for (const receipt of batch) {
    const trade = tradeById.get(String(receipt.sourceId))
    const warrantyDays = Number(trade?.warrantyDays)
    if (!Number.isInteger(warrantyDays) || warrantyDays < 1 || warrantyDays > 3650) continue

    const warrantyExpiresAt = trade.warrantyExpiresAt ? new Date(trade.warrantyExpiresAt) : null
    const fields = {
      'snapshot.warrantyDays': warrantyDays,
      'snapshot.warrantyBackfilledFromTrade': true,
    }
    if (warrantyExpiresAt && !Number.isNaN(warrantyExpiresAt.getTime())) {
      fields['snapshot.warrantyExpiresAt'] = warrantyExpiresAt
    }
    operations.push({
      updateOne: {
        filter: { _id: receipt._id, 'snapshot.warrantyDays': { $exists: false } },
        update: { $set: fields },
      },
    })
  }

  if (operations.length) await db.collection('receipts').bulkWrite(operations)
}

export async function up(db) {
  const cursor = db.collection('receipts').find({
    sourceType: 'TRADE',
    documentType: 'SALE_RECEIPT',
    'snapshot.warrantyDays': { $exists: false },
  }).project({ _id: 1, sourceId: 1 })

  const batch = []
  for await (const receipt of cursor) {
    batch.push(receipt)
    if (batch.length === batchSize) {
      await backfillBatch(db, batch)
      batch.length = 0
    }
  }
  await backfillBatch(db, batch)
}

export async function down(db) {
  await db.collection('receipts').updateMany(
    { 'snapshot.warrantyBackfilledFromTrade': true },
    { $unset: {
      'snapshot.warrantyDays': '',
      'snapshot.warrantyExpiresAt': '',
      'snapshot.warrantyBackfilledFromTrade': '',
    } },
  )
}
