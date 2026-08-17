export const id = '202608170002'
export const description = 'Count the pawn deposit date as the first billable day'

const openStatuses = ['ACTIVE', 'DUE_SOON', 'OVERDUE', 'RENEWED']
const dayMilliseconds = 86_400_000

function shiftDate(value, direction) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Date(date.getTime() + direction * dayMilliseconds)
}

async function flush(pawns, operations) {
  if (!operations.length) return
  await pawns.bulkWrite(operations)
  operations.length = 0
}

export async function up(db) {
  const pawns = db.collection('pawns')
  const cursor = pawns.find({
    feeModel: 'DAILY_SIMPLE',
    status: { $in: openStatuses },
    workflowVersion: { $lt: 5 },
    dueDate: { $type: 'date' },
    $or: [{ renewals: { $exists: false } }, { renewals: { $size: 0 } }],
  })
  const operations = []

  for await (const pawn of cursor) {
    operations.push({
      updateOne: {
        filter: { _id: pawn._id, workflowVersion: { $lt: 5 } },
        update: {
          $set: {
            workflowVersion: 5,
            dueDate: shiftDate(pawn.dueDate, -1),
            graceEndsAt: shiftDate(pawn.graceEndsAt, -1),
            inclusiveDayCountMigratedAt: new Date(),
          },
          $unset: { dueReminderFor: '', dueReminderSentAt: '' },
        },
      },
    })
    if (operations.length === 500) await flush(pawns, operations)
  }

  await flush(pawns, operations)
}

export async function down(db) {
  const pawns = db.collection('pawns')
  const cursor = pawns.find({ inclusiveDayCountMigratedAt: { $exists: true } })
  const operations = []

  for await (const pawn of cursor) {
    operations.push({
      updateOne: {
        filter: { _id: pawn._id, inclusiveDayCountMigratedAt: { $exists: true } },
        update: {
          $set: {
            workflowVersion: 4,
            dueDate: shiftDate(pawn.dueDate, 1),
            graceEndsAt: shiftDate(pawn.graceEndsAt, 1),
          },
          $unset: { inclusiveDayCountMigratedAt: '', dueReminderFor: '', dueReminderSentAt: '' },
        },
      },
    })
    if (operations.length === 500) await flush(pawns, operations)
  }

  await flush(pawns, operations)
}
