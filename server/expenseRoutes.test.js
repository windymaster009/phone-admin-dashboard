import assert from 'node:assert/strict'
import test from 'node:test'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { ActivityLog, User } from './models.js'
import { AuthSession } from './authSessionModels.js'
import { Expense } from './expenseModels.js'
import expenseRouter from './expenseRoutes.js'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-expenses'
const userId = new mongoose.Types.ObjectId()
const sessionId = 'expense-test-session'
const token = jwt.sign({ sub: userId.toString(), sid: sessionId }, process.env.JWT_SECRET, { expiresIn: 3600 })

async function callRoute(method, path, body = {}, role = 'MANAGER') {
  User.findById = () => ({ select: () => Promise.resolve({ _id: userId, name: 'Test Manager', role, active: true }) })
  return new Promise((resolve, reject) => {
    const req = { method, url: path, body, query: {}, headers: { authorization: `Bearer ${token}` }, ip: '127.0.0.1', get(name) { return this.headers[name.toLowerCase()] } }
    let status = 200
    const res = { status(code) { status = code; return this }, json(payload) { resolve({ status, body: payload }) }, cookie() {}, clearCookie() {} }
    expenseRouter.handle(req, res, (error) => error ? resolve({ status: error.status || 500, body: { message: error.message } }) : reject(new Error('Route did not respond')))
  })
}

const originals = {
  sessionFindOne: AuthSession.findOne, sessionUpdateOne: AuthSession.updateOne, userFindById: User.findById,
  expenseFindOne: Expense.findOne, expenseCreate: Expense.create, expenseFindOneAndUpdate: Expense.findOneAndUpdate,
  activitySave: ActivityLog.prototype.save,
}

test.beforeEach(() => {
  AuthSession.findOne = async () => ({ _id: new mongoose.Types.ObjectId(), sessionId, user: userId, revokedAt: null, expiresAt: new Date(Date.now() + 86_400_000) })
  AuthSession.updateOne = async () => ({ acknowledged: true })
  ActivityLog.prototype.save = async function save() { return this }
})

test.afterEach(() => {
  AuthSession.findOne = originals.sessionFindOne
  AuthSession.updateOne = originals.sessionUpdateOne
  User.findById = originals.userFindById
  Expense.findOne = originals.expenseFindOne
  Expense.create = originals.expenseCreate
  Expense.findOneAndUpdate = originals.expenseFindOneAndUpdate
  ActivityLog.prototype.save = originals.activitySave
})

test('POST / creates one audited record with an idempotency key', async () => {
  Expense.findOne = () => ({ populate: async () => null })
  let created = null
  Expense.create = async (payload) => {
    created = { _id: new mongoose.Types.ObjectId(), ...payload, status: 'RECORDED', populate: async function populate() { return this } }
    return created
  }
  const response = await callRoute('POST', '/', {
    title: 'Electricity bill', category: 'UTILITIES', amount: 41, currency: 'USD', exchangeRate: 1,
    paymentMethod: 'CASH', expenseDate: '2026-10-09', idempotencyKey: 'expense-request-001',
  })
  assert.equal(response.status, 201, JSON.stringify(response.body))
  assert.equal(response.body.expense.title, 'Electricity bill')
  assert.equal(created.idempotencyKey, 'expense-request-001')
})

test('POST /:id/void records a reason instead of deleting the expense', async () => {
  const id = new mongoose.Types.ObjectId()
  let update = null
  Expense.findOneAndUpdate = async (_match, updateValue) => {
    update = updateValue
    return { _id: id, expenseNo: 'EX-1', amount: 20, currency: 'USD', status: 'VOIDED', populate: async function populate() { return this } }
  }
  const response = await callRoute('POST', `/${id}/void`, { reason: 'Duplicate receipt entry' })
  assert.equal(response.status, 200)
  assert.equal(response.body.expense.status, 'VOIDED')
  assert.equal(update.$set.voidReason, 'Duplicate receipt entry')
})

test('expense writes reject cashier access', async () => {
  const response = await callRoute('POST', '/', {}, 'CASHIER')
  assert.equal(response.status, 403)
})
