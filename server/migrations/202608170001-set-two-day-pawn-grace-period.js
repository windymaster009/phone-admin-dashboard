export const id = '202608170001'
export const description = 'Set open pawn contracts to a two-day grace period'

const openStatuses = ['ACTIVE', 'DUE_SOON', 'OVERDUE', 'RENEWED']
const dayMilliseconds = 86_400_000

async function setGracePeriod(db, gracePeriodDays) {
  const pawns = db.collection('pawns')
  const cursor = pawns.find({ status: { $in: openStatuses }, dueDate: { $type: 'date' } })
  const operations = []

  for await (const pawn of cursor) {
    operations.push({
      updateOne: {
        filter: { _id: pawn._id },
        update: {
          $set: {
            gracePeriodDays,
            graceEndsAt: new Date(pawn.dueDate.getTime() + gracePeriodDays * dayMilliseconds),
          },
        },
      },
    })

    if (operations.length === 500) {
      await pawns.bulkWrite(operations)
      operations.length = 0
    }
  }

  if (operations.length) await pawns.bulkWrite(operations)
}

export async function up(db) {
  await setGracePeriod(db, 2)
}

export async function down(db) {
  await setGracePeriod(db, 5)
}
