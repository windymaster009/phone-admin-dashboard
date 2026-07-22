export const id = '202607230001'
export const description = 'Add pawn balances, grace periods, and renewal history'

const openStatuses = new Set(['ACTIVE', 'DUE_SOON', 'OVERDUE', 'RENEWED'])

export async function up(db) {
  const pawns = db.collection('pawns')
  const cursor = pawns.find({ workflowVersion: { $ne: 2 } })
  const operations = []

  for await (const pawn of cursor) {
    const payments = Array.isArray(pawn.payments) ? pawn.payments : []
    const amountPaid = payments.reduce((sum, payment) => sum + Math.max(0, Number(payment.amount) || 0), 0)
    const principalPaid = payments
      .filter((payment) => ['PRINCIPAL', 'REDEMPTION'].includes(payment.type))
      .reduce((sum, payment) => sum + Math.max(0, Number(payment.amount) || 0), 0)
    const interestPaid = payments
      .filter((payment) => ['INTEREST', 'RENEWAL'].includes(payment.type))
      .reduce((sum, payment) => sum + Math.max(0, Number(payment.amount) || 0), 0)
    const principal = Math.max(0, Number(pawn.principal) || 0)
    const rate = Math.max(0, Number(pawn.interestRate) || 0)
    const isOpen = openStatuses.has(pawn.status)
    const remainingPrincipal = isOpen ? Math.max(0, principal - principalPaid) : 0
    const accruedInterest = isOpen ? Math.max(0, principal * rate / 100 - interestPaid) : 0
    const dueDate = new Date(pawn.dueDate)
    dueDate.setUTCHours(16, 59, 59, 999)
    const gracePeriodDays = 3
    const graceEndsAt = new Date(dueDate.getTime() + gracePeriodDays * 86_400_000)

    operations.push({
      updateOne: {
        filter: { _id: pawn._id },
        update: {
          $set: {
            originalPrincipal: principal,
            remainingPrincipal,
            interestPeriod: 'MONTHLY',
            accruedInterest,
            fees: 0,
            amountPaid,
            currency: 'USD',
            exchangeRate: 1,
            gracePeriodDays,
            dueDate,
            graceEndsAt,
            status: pawn.status === 'RENEWED' ? 'ACTIVE' : pawn.status,
            renewals: [],
            workflowVersion: 2,
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
  await pawns.createIndex({ graceEndsAt: 1 }, { name: 'graceEndsAt_1' }).catch((error) => {
    if (error.codeName !== 'IndexOptionsConflict') throw error
  })
}

export async function down(db) {
  await db.collection('pawns').updateMany(
    { workflowVersion: 2 },
    { $unset: {
      originalPrincipal: '', remainingPrincipal: '', interestPeriod: '', accruedInterest: '',
      fees: '', amountPaid: '', currency: '', exchangeRate: '', gracePeriodDays: '',
      graceEndsAt: '', renewals: '', redeemedAt: '', forfeitedAt: '', workflowVersion: '',
    } },
  )
  await db.collection('pawns').dropIndex('graceEndsAt_1').catch(() => undefined)
}
