import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import mongoose from 'mongoose'
import { allowRoles, requireAuth, writeActivity } from './auth.js'
import { Expense } from './expenseModels.js'
import { convertToUsd, roundMoney } from './reportCurrency.js'

const router = Router()
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const roles = ['OWNER', 'MANAGER']
const categories = ['RENT', 'UTILITIES', 'SALARY', 'TRANSPORT', 'REPAIR', 'SUPPLIES', 'MARKETING', 'TAX', 'OTHER']
const methods = ['CASH', 'KHQR', 'BANK', 'CARD', 'OTHER']
const statuses = ['RECORDED', 'VOIDED']
const clean = (value) => typeof value === 'string' ? value.trim() : ''
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function requestError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function choice(value, allowed, label, fallback = 'ALL') {
  const normalized = clean(value || fallback).toUpperCase()
  if (normalized !== 'ALL' && !allowed.includes(normalized)) throw requestError(400, `Choose a valid ${label}`)
  return normalized
}

function fallbackExchangeRate() {
  const configured = Number(process.env.USD_KHR_FALLBACK_RATE || 4100)
  return Number.isFinite(configured) && configured >= 1000 && configured <= 10000 ? configured : 4100
}

function parseExpenseDate(value) {
  const input = clean(value)
  const date = new Date(`${input}T00:00:00+07:00`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input) || Number.isNaN(date.getTime())) throw requestError(400, 'Choose a valid expense date')
  const cambodiaToday = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
  if (input > cambodiaToday) throw requestError(400, 'Expense date cannot be in the future')
  return date
}

function expenseAmount(value, currency) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) throw requestError(400, 'Amount must be greater than zero')
  if (currency === 'KHR') {
    if (!Number.isInteger(amount) || amount % 100 !== 0) throw requestError(400, 'KHR expenses must use whole 100 KHR increments')
    return amount
  }
  return roundMoney(amount)
}

function makeExpenseNo() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  return `EX-${date}-${randomUUID().slice(0, 5).toUpperCase()}`
}

router.get('/', requireAuth, allowRoles(...roles), asyncRoute(async (req, res) => {
  const status = choice(req.query.status, statuses, 'expense status')
  const category = choice(req.query.category, categories, 'expense category')
  const currency = choice(req.query.currency, ['USD', 'KHR'], 'currency')
  const method = choice(req.query.method, methods, 'payment method')
  const search = clean(req.query.search)
  const query = {
    ...(status !== 'ALL' ? { status } : {}),
    ...(category !== 'ALL' ? { category } : {}),
    ...(currency !== 'ALL' ? { currency } : {}),
    ...(method !== 'ALL' ? { paymentMethod: method } : {}),
  }
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i')
    query.$or = [{ expenseNo: regex }, { title: regex }, { payee: regex }, { reference: regex }]
  }
  const matchingExpenses = await Expense.find(query)
    .populate('createdBy voidedBy', 'name role')
    .sort({ expenseDate: -1, createdAt: -1 })
    .lean()
  const recorded = matchingExpenses.filter((expense) => expense.status === 'RECORDED')
  const totalUsd = roundMoney(recorded.reduce((sum, expense) => sum + convertToUsd(expense.amount, expense.currency, expense.exchangeRate).amountUsd, 0))
  const totals = recorded.reduce((result, expense) => {
    result[expense.currency] += Number(expense.amount || 0)
    return result
  }, { USD: 0, KHR: 0 })
  const categoryTotals = recorded.reduce((result, expense) => {
    const value = convertToUsd(expense.amount, expense.currency, expense.exchangeRate).amountUsd
    result[expense.category] = roundMoney((result[expense.category] || 0) + value)
    return result
  }, {})
  const topCategory = Object.entries(categoryTotals).sort((left, right) => right[1] - left[1])[0]?.[0] || null
  res.json({ expenses: matchingExpenses.slice(0, 500), summary: { totalUsd, totals, topCategory, recorded: recorded.length, voided: matchingExpenses.length - recorded.length }, totalRecords: matchingExpenses.length, limited: matchingExpenses.length > 500, exchangeRate: fallbackExchangeRate() })
}))

router.post('/', requireAuth, allowRoles(...roles), asyncRoute(async (req, res) => {
  const idempotencyKey = clean(req.body.idempotencyKey)
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 120) throw requestError(400, 'Expense request key is invalid')
  const replay = await Expense.findOne({ idempotencyKey }).populate('createdBy voidedBy', 'name role')
  if (replay) return res.json({ expense: replay, replayed: true })

  const title = clean(req.body.title)
  if (title.length < 2 || title.length > 120) throw requestError(400, 'Description must be between 2 and 120 characters')
  const category = choice(req.body.category, categories, 'expense category', '')
  const currency = choice(req.body.currency, ['USD', 'KHR'], 'currency', '')
  const paymentMethod = choice(req.body.paymentMethod, methods, 'payment method', '')
  const amount = expenseAmount(req.body.amount, currency)
  const exchangeRateInput = Number(req.body.exchangeRate)
  const exchangeRate = currency === 'USD' ? 1 : exchangeRateInput
  if (currency === 'KHR' && (!Number.isFinite(exchangeRate) || exchangeRate < 1000 || exchangeRate > 10000)) throw requestError(400, 'Exchange rate must be between 1,000 and 10,000 KHR per USD')
  const payee = clean(req.body.payee)
  const reference = clean(req.body.reference)
  const notes = clean(req.body.notes)
  if (payee.length > 120 || reference.length > 100 || notes.length > 1000) throw requestError(400, 'Expense details are too long')

  const expense = await Expense.create({
    expenseNo: makeExpenseNo(), title, category, amount, currency, exchangeRate,
    paymentMethod, expenseDate: parseExpenseDate(req.body.expenseDate), payee, reference, notes,
    idempotencyKey, createdBy: req.user._id,
  })
  await writeActivity(req, {
    action: 'CREATE', entity: 'EXPENSE', entityId: expense._id,
    details: { expenseNo: expense.expenseNo, title, category, amount, currency, paymentMethod },
  }, { required: true })
  res.status(201).json({ expense: await expense.populate('createdBy', 'name role') })
}))

router.post('/:id/void', requireAuth, allowRoles(...roles), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw requestError(400, 'Expense record is invalid')
  const reason = clean(req.body.reason)
  if (reason.length < 5 || reason.length > 500) throw requestError(400, 'Enter a void reason between 5 and 500 characters')
  const expense = await Expense.findOneAndUpdate(
    { _id: req.params.id, status: 'RECORDED' },
    { $set: { status: 'VOIDED', voidReason: reason, voidedAt: new Date(), voidedBy: req.user._id } },
    { new: true, runValidators: true },
  )
  if (!expense) throw requestError(409, 'This expense is already voided or no longer available')
  await writeActivity(req, {
    action: 'VOID', entity: 'EXPENSE', entityId: expense._id,
    details: { expenseNo: expense.expenseNo, reason, amount: expense.amount, currency: expense.currency },
  }, { required: true })
  res.json({ expense: await expense.populate('createdBy voidedBy', 'name role') })
}))

export default router
