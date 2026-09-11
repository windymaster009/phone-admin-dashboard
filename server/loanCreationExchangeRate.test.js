import assert from 'node:assert/strict'
import test from 'node:test'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { User, ActivityLog } from './models.js'
import { AuthSession } from './authSessionModels.js'
import { Loan } from './loanModels.js'
import loanRouter from './loanRoutes.js'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-loan-tests'
const testUserId = new mongoose.Types.ObjectId()
const testSessionId = 'loan-test-session-1'

const testToken = jwt.sign(
  { sub: testUserId.toString(), sid: testSessionId },
  process.env.JWT_SECRET,
  { expiresIn: 3600 },
)

async function callLoanRoute(method, path, body = {}) {
  return new Promise((resolve, reject) => {
    const req = {
      method,
      url: path,
      params: {},
      query: {},
      body,
      headers: {
        authorization: `Bearer ${testToken}`,
      },
      get(header) {
        return this.headers[header.toLowerCase()]
      },
      ip: '127.0.0.1',
    }

    let responseData = null
    let responseStatus = 200
    let responseCount = 0
    const res = {
      status(code) {
        responseStatus = code
        return this
      },
      json(data) {
        responseCount += 1
        if (responseCount > 1) {
          reject(new Error('Loan route attempted to send more than one JSON response'))
          return this
        }
        responseData = data
        setTimeout(() => resolve({ status: responseStatus, body: data, responseCount }), 0)
        return this
      },
      cookie() {},
      clearCookie() {},
      setHeader() {},
      getHeader() {},
    }

    loanRouter.handle(req, res, (err) => {
      if (err) reject(err)
      else resolve({ status: responseStatus, body: responseData })
    })
  })
}

const origAuthSessionFindOne = AuthSession.findOne
const origAuthSessionUpdateOne = AuthSession.updateOne
const origUserFindById = User.findById
const origActivityLogSave = ActivityLog.prototype.save

test.beforeEach(() => {
  AuthSession.findOne = async () => ({
    _id: new mongoose.Types.ObjectId(),
    sessionId: testSessionId,
    user: testUserId,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86400000),
  })
  AuthSession.updateOne = async () => ({ acknowledged: true })
  ActivityLog.prototype.save = async function () { return this }
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: testUserId,
      name: 'Test Manager',
      email: 'manager@phoneflow.test',
      role: 'MANAGER',
      active: true,
    }),
  })
})

test.afterEach(() => {
  AuthSession.findOne = origAuthSessionFindOne
  AuthSession.updateOne = origAuthSessionUpdateOne
  ActivityLog.prototype.save = origActivityLogSave
  User.findById = origUserFindById
})

test('Loan list sends exactly one response', async () => {
  const origLoanFind = Loan.find
  let findCall = 0

  Loan.find = () => {
    findCall += 1
    if (findCall === 1) return { select: () => ({ lean: async () => [] }) }
    if (findCall === 2) {
      return {
        sort: () => ({
          limit: () => ({
            populate: async () => [],
          }),
        }),
      }
    }
    return { select: () => ({ lean: async () => [] }) }
  }

  try {
    const res = await callLoanRoute('GET', '/')
    assert.equal(res.status, 200)
    assert.equal(res.responseCount, 1)
    assert.deepEqual(res.body.loans, [])
  } finally {
    Loan.find = origLoanFind
  }
})

test('Loan creation stores exchangeRate=1 for USD loan', async () => {
  const origLoanCreate = Loan.create
  let createdPayload = null

  Loan.create = async (payload) => {
    createdPayload = payload
    return {
      _id: new mongoose.Types.ObjectId(),
      ...payload,
    }
  }

  try {
    const res = await callLoanRoute('POST', '/', {
      borrower: { name: 'Alice Smith', phone: '012345678' },
      currency: 'USD',
      principal: 500,
      interestType: 'FIXED',
      interestValue: 25,
      loanDate: '2026-03-01',
      dueDate: '2026-04-01',
    })

    assert.equal(res.status, 201)
    assert(createdPayload, 'Loan.create should have been called')
    assert.equal(createdPayload.currency, 'USD')
    assert.equal(createdPayload.exchangeRate, 1)
    assert.equal(createdPayload.exchangeRateEstimated, false)
  } finally {
    Loan.create = origLoanCreate
  }
})

test('Loan creation stores validated exchangeRate for KHR loan', async () => {
  const origLoanCreate = Loan.create
  let createdPayload = null

  Loan.create = async (payload) => {
    createdPayload = payload
    return {
      _id: new mongoose.Types.ObjectId(),
      ...payload,
    }
  }

  try {
    const res = await callLoanRoute('POST', '/', {
      borrower: { name: 'Bob Meas', phone: '098765432' },
      currency: 'KHR',
      principal: 2000000,
      exchangeRate: 4050,
      interestType: 'FIXED',
      interestValue: 100000,
      loanDate: '2026-03-01',
      dueDate: '2026-04-01',
    })

    assert.equal(res.status, 201)
    assert(createdPayload, 'Loan.create should have been called')
    assert.equal(createdPayload.currency, 'KHR')
    assert.equal(createdPayload.exchangeRate, 4050)
    assert.equal(createdPayload.exchangeRateEstimated, false)
  } finally {
    Loan.create = origLoanCreate
  }
})

test('Loan creation falls back to standard rate when KHR rate is missing or invalid', async () => {
  const origLoanCreate = Loan.create
  let createdPayload = null

  Loan.create = async (payload) => {
    createdPayload = payload
    return {
      _id: new mongoose.Types.ObjectId(),
      ...payload,
    }
  }

  try {
    const res = await callLoanRoute('POST', '/', {
      borrower: { name: 'Charlie Meas', phone: '098765433' },
      currency: 'KHR',
      principal: 1000000,
      exchangeRate: -1, // invalid rate
      interestType: 'NONE',
      loanDate: '2026-03-01',
      dueDate: '2026-04-01',
    })

    assert.equal(res.status, 201)
    assert(createdPayload, 'Loan.create should have been called')
    assert.equal(createdPayload.currency, 'KHR')
    assert.equal(createdPayload.exchangeRate, 4100)
    assert.equal(createdPayload.exchangeRateEstimated, true)
  } finally {
    Loan.create = origLoanCreate
  }
})
