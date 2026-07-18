export const id = '202607190002'
export const description = 'Add supplier records and version existing purchase transactions'

export async function up(db) {
  const trades = db.collection('trades')
  await trades.updateMany(
    { type: 'BUY', purchaseWorkflowVersion: { $exists: false } },
    [
      {
        $set: {
          sellerType: 'LEGACY',
          purchaseDate: '$createdAt',
          currency: 'USD',
          exchangeRate: 1,
          transactionSubtotal: '$subtotal',
          transactionTotal: '$total',
          transactionAmountPaid: '$amountPaid',
          transactionBalance: '$balance',
          paymentStatus: {
            $cond: [
              { $lte: ['$amountPaid', 0] },
              'UNPAID',
              { $cond: [{ $gt: ['$balance', 0] }, 'PARTIAL', 'PAID'] },
            ],
          },
          purchaseWorkflowVersion: 1,
        },
      },
    ],
  )

  const suppliers = db.collection('suppliers')
  const indexes = await suppliers.indexes().catch(() => [])
  if (!indexes.some((index) => index.key?.name === 1)) await suppliers.createIndex({ name: 1 }, { name: 'name_1' })
  if (!indexes.some((index) => index.key?.phone === 1)) await suppliers.createIndex({ phone: 1 }, { name: 'phone_1', sparse: true })
  if (!indexes.some((index) => index.key?.active === 1)) await suppliers.createIndex({ active: 1 }, { name: 'active_1' })
}

export async function down(db) {
  await db.collection('trades').updateMany(
    { purchaseWorkflowVersion: 1 },
    {
      $unset: {
        sellerType: '', purchaseDate: '', currency: '', exchangeRate: '',
        transactionSubtotal: '', transactionTotal: '', transactionAmountPaid: '',
        transactionBalance: '', paymentStatus: '', purchaseWorkflowVersion: '',
      },
    },
  )
}
