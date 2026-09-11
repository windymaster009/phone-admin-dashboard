export const id = '202609110001'
export const description = 'Backfill expiresAt on ActivityLog records and establish retention indexes'

const defaultOperationalRetentionDays = 90
const defaultSecurityRetentionDays = 180

function computeExpiration(entity, createdAt) {
  const isSecurity = entity === 'AUTH_SESSION'
  const envDays = isSecurity
    ? process.env.SECURITY_EVENT_RETENTION_DAYS
    : process.env.ACTIVITY_LOG_RETENTION_DAYS
  const defaultDays = isSecurity ? defaultSecurityRetentionDays : defaultOperationalRetentionDays
  const parsed = Number(envDays)
  const retentionDays = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : defaultDays
  const date = createdAt instanceof Date && !Number.isNaN(createdAt.getTime())
    ? new Date(createdAt)
    : new Date()
  date.setDate(date.getDate() + retentionDays)
  return date
}

async function flush(collection, operations) {
  if (!operations.length) return
  await collection.bulkWrite(operations)
  operations.length = 0
}

export async function up(db) {
  const collection = db.collection('activitylogs')

  // Create indexes safely
  try {
    await collection.createIndex({ createdAt: -1 })
    await collection.createIndex({ entity: 1, createdAt: -1 })
    await collection.createIndex({ user: 1, entity: 1, createdAt: -1 })
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  } catch (indexError) {
    console.warn('Warning creating ActivityLog indexes:', indexError.message)
  }

  const cursor = collection.find({
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
    ],
  })

  const operations = []
  for await (const log of cursor) {
    const createdAt = log.createdAt || (log._id?.getTimestamp ? log._id.getTimestamp() : new Date())
    const expiresAt = computeExpiration(log.entity, createdAt)
    operations.push({
      updateOne: {
        filter: { _id: log._id },
        update: {
          $set: {
            expiresAt,
            retentionMigratedAt: new Date(),
          },
        },
      },
    })
    if (operations.length === 500) await flush(collection, operations)
  }

  await flush(collection, operations)
}

export async function down(db) {
  const collection = db.collection('activitylogs')
  await collection.updateMany(
    { retentionMigratedAt: { $exists: true } },
    { $unset: { expiresAt: '', retentionMigratedAt: '' } },
  )
}
