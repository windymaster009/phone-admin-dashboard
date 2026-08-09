import 'dotenv/config'
import mongoose from 'mongoose'
import { InventoryItem, Trade } from './models.js'

const DEMO_MARKER = '[PHONEFLOW_DASHBOARD_DEMO]'
const INVENTORY_PREFIX = 'DEMO-DASH-SKU-'
const TRADE_PREFIX = 'DEMO-DASH-TR-'
const CAMBODIA_OFFSET_MS = 7 * 60 * 60 * 1000

function seededRandom(seed = 20260809) {
  let value = seed >>> 0
  return () => {
    value += 0x6D2B79F5
    let result = value
    result = Math.imul(result ^ (result >>> 15), result | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

const random = seededRandom()
const pick = (values) => values[Math.floor(random() * values.length)]
const roundMoney = (value) => Math.round(value * 100) / 100

function cambodiaParts(now = new Date()) {
  const shifted = new Date(now.getTime() + CAMBODIA_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  }
}

function demoDate(year, month, day, sequence = 0) {
  const cambodiaHour = 10 + ((sequence * 3) % 9)
  const minute = (sequence * 17) % 60
  return new Date(Date.UTC(year, month, day, cambodiaHour - 7, minute, 0))
}

function ensureAllowed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Dashboard demo seed is disabled in production.')
  }
  const allowed = process.env.NODE_ENV === 'development' || String(process.env.DASHBOARD_DEMO_SEED_ALLOWED || '').toLowerCase() === 'true'
  if (!allowed) {
    throw new Error('Set NODE_ENV=development before using the dashboard demo seed.')
  }
  if (!process.argv.includes('--confirm')) {
    throw new Error('Demo seed is a write operation. Re-run with --confirm after checking MONGO_URI.')
  }
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required.')
}

async function cleanDemoData() {
  const [trades, inventory] = await Promise.all([
    Trade.deleteMany({ tradeNo: { $regex: `^${TRADE_PREFIX}` } }),
    InventoryItem.deleteMany({ sku: { $regex: `^${INVENTORY_PREFIX}` } }),
  ])
  return { trades: trades.deletedCount || 0, inventory: inventory.deletedCount || 0 }
}

function inventoryFixtures() {
  return [
    { suffix: 'PH-001', category: 'PHONE', name: 'Demo iPhone 15 Pro Max 256GB', brand: 'Apple', model: 'iPhone 15 Pro Max', quantity: 1, reorderLevel: 1, buyPrice: 720, sellPrice: 865, condition: 'LIKE_NEW' },
    { suffix: 'PH-002', category: 'PHONE', name: 'Demo iPhone 14 Pro 256GB', brand: 'Apple', model: 'iPhone 14 Pro', quantity: 1, reorderLevel: 1, buyPrice: 505, sellPrice: 625, condition: 'GOOD' },
    { suffix: 'PH-003', category: 'PHONE', name: 'Demo Samsung S24 Ultra 512GB', brand: 'Samsung', model: 'S24 Ultra', quantity: 1, reorderLevel: 1, buyPrice: 690, sellPrice: 825, condition: 'LIKE_NEW' },
    { suffix: 'PH-004', category: 'PHONE', name: 'Demo Pixel 8 Pro 256GB', brand: 'Google', model: 'Pixel 8 Pro', quantity: 1, reorderLevel: 1, buyPrice: 410, sellPrice: 510, condition: 'GOOD' },
    { suffix: 'PH-005', category: 'PHONE', name: 'Demo iPhone 13 128GB', brand: 'Apple', model: 'iPhone 13', quantity: 1, reorderLevel: 1, buyPrice: 285, sellPrice: 355, condition: 'GOOD' },
    { suffix: 'TB-001', category: 'TABLET', name: 'Demo iPad Air 5 64GB', brand: 'Apple', model: 'iPad Air 5', quantity: 3, reorderLevel: 1, buyPrice: 350, sellPrice: 425, condition: 'GOOD' },
    { suffix: 'TB-002', category: 'TABLET', name: 'Demo Galaxy Tab S9', brand: 'Samsung', model: 'Tab S9', quantity: 2, reorderLevel: 1, buyPrice: 385, sellPrice: 465, condition: 'LIKE_NEW' },
    { suffix: 'AC-001', category: 'ACCESSORY', name: 'Demo USB-C 20W Adapter', brand: 'Anker', quantity: 18, reorderLevel: 5, buyPrice: 8, sellPrice: 15, condition: 'NEW' },
    { suffix: 'AC-002', category: 'ACCESSORY', name: 'Demo USB-C Cable 1m', brand: 'Baseus', quantity: 28, reorderLevel: 8, buyPrice: 3.5, sellPrice: 8, condition: 'NEW' },
    { suffix: 'AC-003', category: 'ACCESSORY', name: 'Demo MagSafe Case', brand: 'Generic', quantity: 12, reorderLevel: 4, buyPrice: 4, sellPrice: 12, condition: 'NEW' },
    { suffix: 'AC-004', category: 'ACCESSORY', name: 'Demo Tempered Glass', brand: 'Generic', quantity: 4, reorderLevel: 5, buyPrice: 1.2, sellPrice: 5, condition: 'NEW' },
    { suffix: 'SP-001', category: 'SPARE_PART', name: 'Demo iPhone 13 OLED Screen', brand: 'OEM', quantity: 3, reorderLevel: 2, buyPrice: 72, sellPrice: 108, condition: 'NEW' },
    { suffix: 'SP-002', category: 'SPARE_PART', name: 'Demo iPhone 12 Battery', brand: 'OEM', quantity: 2, reorderLevel: 3, buyPrice: 18, sellPrice: 38, condition: 'NEW' },
    { suffix: 'OT-001', category: 'OTHER', name: 'Demo Cleaning Kit', brand: 'PhoneFlow', quantity: 9, reorderLevel: 3, buyPrice: 2.5, sellPrice: 7, condition: 'NEW' },
  ].map((item) => ({
    sku: `${INVENTORY_PREFIX}${item.suffix}`,
    barcode: `${INVENTORY_PREFIX}${item.suffix}`,
    category: item.category,
    name: item.name,
    brand: item.brand,
    model: item.model,
    condition: item.condition,
    quantity: item.quantity,
    reorderLevel: item.reorderLevel,
    buyPrice: item.buyPrice,
    sellPrice: item.sellPrice,
    minimumSellPrice: roundMoney(item.sellPrice * 0.9),
    status: 'IN_STOCK',
    source: 'OTHER',
    notes: DEMO_MARKER,
  }))
}

function tradeRecord({ index, type, date, total, itemName }) {
  const paid = roundMoney(total)
  const costPrice = type === 'SELL' ? roundMoney(total * (0.68 + random() * 0.12)) : paid
  const paymentMethod = pick(['CASH', 'KHQR', 'BANK'])
  const record = {
    tradeNo: `${TRADE_PREFIX}${String(index).padStart(4, '0')}`,
    type,
    currency: 'USD',
    exchangeRate: 1,
    transactionSubtotal: paid,
    transactionTotal: paid,
    transactionAmountPaid: paid,
    transactionBalance: 0,
    paymentStatus: 'PAID',
    items: [{
      name: itemName,
      quantity: 1,
      unitPrice: paid,
      costPrice,
      originalUnitPrice: paid,
      currency: 'USD',
    }],
    subtotal: paid,
    discount: 0,
    total: paid,
    amountPaid: paid,
    balance: 0,
    paymentMethod,
    status: 'COMPLETED',
    notes: DEMO_MARKER,
    createdAt: date,
    updatedAt: date,
  }

  if (type === 'BUY') {
    record.sellerType = 'WALK_IN'
    record.sellerSnapshot = { name: `Demo walk-in seller ${index}` }
    record.purchaseDate = date
  }

  return record
}

function tradeFixtures(now = new Date()) {
  const { year, month: currentMonth, day: currentDay } = cambodiaParts(now)
  const salesNames = ['Demo iPhone sale', 'Demo Samsung sale', 'Demo accessory bundle', 'Demo tablet sale', 'Demo used phone sale']
  const buyNames = ['Demo phone purchase', 'Demo supplier restock', 'Demo accessory restock', 'Demo tablet purchase']
  const trades = []
  let index = 1

  for (let month = 0; month < currentMonth; month += 1) {
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const transactionDays = [3, 7, 11, 16, 21, 26].filter((day) => day <= daysInMonth)
    transactionDays.forEach((day, sequence) => {
      const saleTotal = roundMoney(260 + random() * 1150)
      trades.push(tradeRecord({ index: index++, type: 'SELL', date: demoDate(year, month, day, sequence), total: saleTotal, itemName: pick(salesNames) }))
      if (sequence % 2 === 0 || random() > 0.35) {
        const buyTotal = roundMoney(180 + random() * 840)
        trades.push(tradeRecord({ index: index++, type: 'BUY', date: demoDate(year, month, Math.min(day + 1, daysInMonth), sequence + 1), total: buyTotal, itemName: pick(buyNames) }))
      }
    })
  }

  for (let day = 1; day <= currentDay; day += 1) {
    const baseSale = roundMoney(180 + random() * 980)
    trades.push(tradeRecord({ index: index++, type: 'SELL', date: demoDate(year, currentMonth, day, 1), total: baseSale, itemName: pick(salesNames) }))

    if (day % 2 === 0 || random() > 0.45) {
      const buyTotal = roundMoney(120 + random() * 760)
      trades.push(tradeRecord({ index: index++, type: 'BUY', date: demoDate(year, currentMonth, day, 2), total: buyTotal, itemName: pick(buyNames) }))
    }

    if (day % 3 === 0) {
      const secondSale = roundMoney(70 + random() * 430)
      trades.push(tradeRecord({ index: index++, type: 'SELL', date: demoDate(year, currentMonth, day, 3), total: secondSale, itemName: 'Demo accessory sale' }))
    }
  }

  return trades
}

async function seedDashboard() {
  const removed = await cleanDemoData()
  const inventory = inventoryFixtures()
  const trades = tradeFixtures()
  await InventoryItem.insertMany(inventory)
  await Trade.collection.insertMany(trades)
  return { removed, inventory: inventory.length, trades: trades.length }
}

async function main() {
  ensureAllowed()
  const command = String(process.argv[2] || 'seed').toLowerCase()
  if (!['seed', 'clean'].includes(command)) throw new Error('Use seed or clean as the command.')

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 30_000 })
  const databaseName = mongoose.connection.name
  console.log(`Dashboard demo ${command} on MongoDB database: ${databaseName}`)

  if (command === 'clean') {
    const removed = await cleanDemoData()
    console.log(`Removed ${removed.trades} demo trades and ${removed.inventory} demo inventory records.`)
    return
  }

  const result = await seedDashboard()
  console.log(`Seeded ${result.trades} demo trades and ${result.inventory} demo inventory records.`)
  console.log(`Removed previous demo data first: ${result.removed.trades} trades, ${result.removed.inventory} inventory records.`)
  console.log('Refresh the Dashboard and switch Shop performance between This month and This year.')
}

main()
  .catch((error) => {
    console.error(`Dashboard demo seed failed: ${error.message}`)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {})
  })
