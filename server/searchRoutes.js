import { Router } from 'express'
import { requireAuth } from './auth.js'
import { Customer, InventoryItem, Pawn, Supplier } from './models.js'
import { Loan } from './loanModels.js'
import { ServiceOffering } from './serviceModels.js'

const router = Router()
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const LIMIT_PER_CATEGORY = 6

router.get('/', requireAuth, asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'no-store')
  const q = String(req.query.q || req.query.query || req.query.search || '').trim().slice(0, 60)

  if (!q) {
    return res.json({
      query: '',
      total: 0,
      results: {
        inventory: [],
        pawns: [],
        loans: [],
        customers: [],
        services: [],
        suppliers: [],
      },
    })
  }

  const role = req.user?.role || 'CASHIER'
  const pattern = new RegExp(escapeRegex(q), 'i')

  // Enforce server-side role boundaries
  const canSearchInventory = ['OWNER', 'MANAGER', 'CASHIER', 'STOCK'].includes(role)
  const canSearchPawns = ['OWNER', 'MANAGER', 'CASHIER'].includes(role)
  const canSearchLoans = ['OWNER', 'MANAGER', 'CASHIER'].includes(role)
  const canSearchCustomers = ['OWNER', 'MANAGER', 'CASHIER'].includes(role)
  const canSearchServices = ['OWNER', 'MANAGER', 'CASHIER'].includes(role)
  const canSearchSuppliers = ['OWNER', 'MANAGER', 'STOCK'].includes(role)

  const inventoryQuery = canSearchInventory
    ? InventoryItem.find({
        $or: [
          { name: pattern },
          { sku: pattern },
          { barcode: pattern },
          { imei1: pattern },
          { imei2: pattern },
          { serialNumber: pattern },
        ],
      })
        .select('_id name sku barcode imei1 serialNumber brand model category quantity sellPrice pricingCurrency status')
        .limit(LIMIT_PER_CATEGORY)
        .lean()
    : Promise.resolve([])

  const pawnCustomersQuery = canSearchPawns
    ? Customer.find({ $or: [{ name: pattern }, { phone: pattern }] })
        .select('_id name phone')
        .limit(100)
        .lean()
    : Promise.resolve([])

  const pawnsQuery = canSearchPawns
    ? pawnCustomersQuery.then((matchedCustomers) => Pawn.find({
        $or: [
          { pawnNo: pattern },
          { customer: { $in: matchedCustomers.map((customer) => customer._id) } },
          { 'itemSnapshot.name': pattern },
          { 'itemSnapshot.imei': pattern },
        ],
      })
        .select('_id pawnNo customer itemSnapshot.name itemSnapshot.imei principal remainingPrincipal currency status dueDate')
        .limit(LIMIT_PER_CATEGORY)
        .lean().then((pawns) => pawns.map((pawn) => ({
          _id: pawn._id,
          pawnNo: pawn.pawnNo,
          customerName: matchedCustomers.find((customer) => String(customer._id) === String(pawn.customer))?.name,
          customerPhone: matchedCustomers.find((customer) => String(customer._id) === String(pawn.customer))?.phone,
          collateral: pawn.itemSnapshot?.name,
          loanAmount: pawn.remainingPrincipal ?? pawn.principal,
          currency: pawn.currency,
          status: pawn.status,
          dueDate: pawn.dueDate,
        }))))
    : Promise.resolve([])

  const loansQuery = canSearchLoans
    ? Loan.find({
        $or: [
          { loanNo: pattern },
          { 'borrower.name': pattern },
          { 'borrower.phone': pattern },
          { reason: pattern },
        ],
      })
        .select('_id loanNo borrower.name borrower.phone principal remainingBalance currency status dueDate')
        .limit(LIMIT_PER_CATEGORY)
        .lean()
    : Promise.resolve([])

  const customersQuery = canSearchCustomers
    ? Customer.find({
        $or: [
          { name: pattern },
          { phone: pattern },
          ...(role !== 'CASHIER' ? [{ nationalIdNumber: pattern }] : []),
        ],
      })
        .select(role === 'CASHIER'
          ? '_id name phone active'
          : '_id name phone nationalIdNumber active')
        .limit(LIMIT_PER_CATEGORY)
        .lean()
    : Promise.resolve([])

  const servicesQuery = canSearchServices
    ? ServiceOffering.find({
        active: true,
        $or: [
          { code: pattern },
          { name: pattern },
          { category: pattern },
        ],
      })
        .select('_id code name category price currency active')
        .limit(LIMIT_PER_CATEGORY)
        .lean()
    : Promise.resolve([])

  const suppliersQuery = canSearchSuppliers
    ? Supplier.find({
        $or: [
          { name: pattern },
          { phone: pattern },
        ],
      })
        .select('_id name phone active')
        .limit(LIMIT_PER_CATEGORY)
        .lean()
    : Promise.resolve([])

  const [inventory, pawns, loans, customers, services, suppliers] = await Promise.all([
    inventoryQuery,
    pawnsQuery,
    loansQuery,
    customersQuery,
    servicesQuery,
    suppliersQuery,
  ])

  const total = inventory.length + pawns.length + loans.length + customers.length + services.length + suppliers.length

  res.json({
    query: q,
    total,
    results: {
      inventory: inventory.map((item) => ({
        _id: item._id,
        productName: item.name,
        brand: item.brand,
        model: item.model,
        sku: item.sku,
        barcode: item.barcode,
        imei: item.imei1,
        serialNumber: item.serialNumber,
        category: item.category,
        salePrice: item.sellPrice,
        currency: item.pricingCurrency,
        quantity: item.quantity,
        status: item.status,
      })),
      pawns,
      loans: loans.map((loan) => ({
        _id: loan._id,
        loanNo: loan.loanNo,
        customerName: loan.borrower?.name,
        customerPhone: loan.borrower?.phone,
        principal: loan.principal,
        remainingBalance: loan.remainingBalance,
        currency: loan.currency,
        status: loan.status,
        dueDate: loan.dueDate,
      })),
      customers,
      services,
      suppliers,
    },
  })
}))

export default router
