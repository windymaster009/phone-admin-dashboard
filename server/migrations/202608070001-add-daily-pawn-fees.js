export const id = '202608070001'
export const description = 'Version pawn contracts for simple daily fees and fixed terms'

export async function up(db) {
  const pawns = db.collection('pawns')
  await pawns.updateMany(
    { feeModel: { $exists: false } },
    {
      $set: {
        feeModel: 'LEGACY_MONTHLY',
        dailyFeeRate: 0,
        termDays: 0,
        accruedPawnFee: 0,
        pawnFeePaid: 0,
      },
    },
  )
  await pawns.createIndex({ dueReminderFor: 1 }, { name: 'dueReminderFor_1', sparse: true })
}

export async function down(db) {
  const pawns = db.collection('pawns')
  await pawns.updateMany(
    { feeModel: 'LEGACY_MONTHLY' },
    { $unset: { feeModel: '', dailyFeeRate: '', termDays: '', accruedPawnFee: '', pawnFeePaid: '' } },
  )
  await pawns.dropIndex('dueReminderFor_1').catch(() => undefined)
}
