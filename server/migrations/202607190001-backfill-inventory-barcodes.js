export const id = '202607190001'
export const description = 'Backfill unique barcodes for existing inventory items'

export async function up(db) {
  const inventory = db.collection('inventoryitems')
  const cursor = inventory.find(
    { $or: [{ barcode: { $exists: false } }, { barcode: null }, { barcode: '' }] },
    { projection: { _id: 1 } },
  )

  let operations = []
  for await (const item of cursor) {
    operations.push({
      updateOne: {
        filter: { _id: item._id, $or: [{ barcode: { $exists: false } }, { barcode: null }, { barcode: '' }] },
        update: { $set: { barcode: `PF-LEGACY-${item._id.toString().toUpperCase()}` } },
      },
    })
    if (operations.length === 500) {
      await inventory.bulkWrite(operations, { ordered: false })
      operations = []
    }
  }
  if (operations.length > 0) await inventory.bulkWrite(operations, { ordered: false })

  const indexes = await inventory.indexes()
  const barcodeIndex = indexes.find((index) => index.key?.barcode === 1)
  if (barcodeIndex && !barcodeIndex.unique) {
    throw new Error(`Existing barcode index ${barcodeIndex.name} is not unique; resolve it before running this migration`)
  }
  if (!barcodeIndex) {
    await inventory.createIndex(
      { barcode: 1 },
      { name: 'barcode_1', unique: true, sparse: true },
    )
  }
}

export async function down(db) {
  // Only remove values created by this migration. Barcodes created by normal
  // application usage and the uniqueness index are intentionally preserved.
  await db.collection('inventoryitems').updateMany(
    { barcode: /^PF-LEGACY-/ },
    { $unset: { barcode: '' } },
  )
}
