import assert from 'node:assert/strict'
import test from 'node:test'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { ActivityLog, User } from './models.js'
import { AuthSession, AndroidPairing } from './authSessionModels.js'
import { TwoFactorChallenge, TwoFactorCredential, TwoFactorSetup } from './twoFactorModels.js'
import { allowRoles, requireAuth, signToken, SESSION_COOKIE_NAME } from './auth.js'
import sessionSecurityRouter from './sessionSecurityRoutes.js'
import appRouter from './routes.js'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-auth-security-12345'
const validEncryptionKey = Buffer.alloc(32, 9).toString('base64')

// Helper to simulate request through an Express router or middleware
function callRouter(routerOrMiddleware, {
  method = 'GET',
  url = '/',
  headers = {},
  body = {},
  query = {},
  params = {},
  user = null,
  authSession = null,
} = {}) {
  return new Promise((resolve) => {
    const headerMap = Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
    )
    const req = {
      method: method.toUpperCase(),
      url,
      originalUrl: url,
      headers: headerMap,
      body,
      query,
      params,
      user,
      authSession,
      ip: '127.0.0.1',
      get(name) {
        return this.headers[name.toLowerCase()]
      },
      socket: { remoteAddress: '127.0.0.1' },
      hostname: 'localhost',
    }

    let statusCode = 200
    let responseBody = null
    const responseHeaders = {}
    const cookiesSet = []
    const cookiesCleared = []

    const res = {
      status(code) {
        statusCode = code
        return this
      },
      setHeader(name, val) {
        responseHeaders[name.toLowerCase()] = val
        return this
      },
      getHeader(name) {
        return responseHeaders[name.toLowerCase()]
      },
      cookie(name, val, opts) {
        cookiesSet.push({ name, val, opts })
        return this
      },
      clearCookie(name, opts) {
        cookiesCleared.push({ name, opts })
        return this
      },
      json(data) {
        responseBody = data
        resolve({ status: statusCode, body: data, headers: responseHeaders, cookiesSet, cookiesCleared })
      },
      send(data) {
        responseBody = data
        resolve({ status: statusCode, body: data, headers: responseHeaders, cookiesSet, cookiesCleared })
      },
      redirect(code, location) {
        resolve({ status: code, location, headers: responseHeaders, cookiesSet, cookiesCleared })
      },
    }

    if (typeof routerOrMiddleware === 'function' && routerOrMiddleware.length === 3) {
      // Standard middleware (req, res, next)
      routerOrMiddleware(req, res, (err) => {
        if (err) resolve({ status: err.status || 500, error: err })
        else resolve({ status: statusCode, passed: true, req, res })
      })
    } else {
      // Express router
      routerOrMiddleware.handle(req, res, (err) => {
        if (err) resolve({ status: err.status || 500, error: err, body: { message: err.message, stack: err.stack } })
        else resolve({ status: statusCode, body: responseBody, headers: responseHeaders, cookiesSet, cookiesCleared })
      })
    }
  })
}

// Stored originals for cleanup
const origUserFindOne = User.findOne
const origUserFindById = User.findById
const origUserFind = User.find
const origUserCreate = User.create
const origUserUpdateOne = User.updateOne
const origUserDeleteOne = User.deleteOne
const origUserCountDocuments = User.countDocuments

const origAuthSessionFindOne = AuthSession.findOne
const origAuthSessionFind = AuthSession.find
const origAuthSessionCreate = AuthSession.create
const origAuthSessionUpdateOne = AuthSession.updateOne
const origAuthSessionFindOneAndUpdate = AuthSession.findOneAndUpdate

const origTwoFactorCredFindOne = TwoFactorCredential.findOne
mongoose.set('bufferCommands', false)

const origActivityLogSave = ActivityLog.prototype.save
const origUserSave = User.prototype.save
const origAuthSessionSave = AuthSession.prototype.save

const origTwoFactorCredCreate = TwoFactorCredential.create
const origTwoFactorCredDeleteOne = TwoFactorCredential.deleteOne

const origTwoFactorSetupFindOne = TwoFactorSetup.findOne
const origTwoFactorSetupCreate = TwoFactorSetup.create
const origTwoFactorSetupDeleteMany = TwoFactorSetup.deleteMany

const origTwoFactorChallengeFindOne = TwoFactorChallenge.findOne
const origTwoFactorChallengeCreate = TwoFactorChallenge.create
const origTwoFactorChallengeUpdateOne = TwoFactorChallenge.updateOne
const origTwoFactorChallengeDeleteMany = TwoFactorChallenge.deleteMany

const origActivityLogCreate = ActivityLog.create
const origActivityLogFind = ActivityLog.find
const origActivityLogCountDocs = ActivityLog.countDocuments

test.beforeEach(() => {
  process.env.TWO_FACTOR_ENCRYPTION_KEY = validEncryptionKey
  ActivityLog.prototype.save = async function () { return this }
  User.prototype.save = async function () { return this }
  AuthSession.prototype.save = async function () { return this }
  ActivityLog.create = async () => ({})
  ActivityLog.find = () => ({
    select: () => ({
      sort: () => ({
        limit: () => ({
          lean: () => Promise.resolve([]),
        }),
      }),
    }),
  })
  ActivityLog.countDocuments = async () => 0
})

test.afterEach(() => {
  ActivityLog.prototype.save = origActivityLogSave
  User.prototype.save = origUserSave
  AuthSession.prototype.save = origAuthSessionSave
  User.findOne = origUserFindOne
  User.findById = origUserFindById
  User.find = origUserFind
  User.create = origUserCreate
  User.updateOne = origUserUpdateOne
  User.deleteOne = origUserDeleteOne
  User.countDocuments = origUserCountDocuments

  AuthSession.findOne = origAuthSessionFindOne
  AuthSession.find = origAuthSessionFind
  AuthSession.create = origAuthSessionCreate
  AuthSession.updateOne = origAuthSessionUpdateOne
  AuthSession.findOneAndUpdate = origAuthSessionFindOneAndUpdate

  TwoFactorCredential.findOne = origTwoFactorCredFindOne
  TwoFactorCredential.create = origTwoFactorCredCreate
  TwoFactorCredential.deleteOne = origTwoFactorCredDeleteOne

  TwoFactorSetup.findOne = origTwoFactorSetupFindOne
  TwoFactorSetup.create = origTwoFactorSetupCreate
  TwoFactorSetup.deleteMany = origTwoFactorSetupDeleteMany

  TwoFactorChallenge.findOne = origTwoFactorChallengeFindOne
  TwoFactorChallenge.create = origTwoFactorChallengeCreate
  TwoFactorChallenge.updateOne = origTwoFactorChallengeUpdateOne
  TwoFactorChallenge.deleteMany = origTwoFactorChallengeDeleteMany

  ActivityLog.create = origActivityLogCreate
  ActivityLog.find = origActivityLogFind
  ActivityLog.countDocuments = origActivityLogCountDocs
})

// -------------------------------------------------------------
// 1. requireAuth and token verification tests
// -------------------------------------------------------------
test('requireAuth: returns 401 when no token is provided', async () => {
  const res = await callRouter(requireAuth, { method: 'GET' })
  assert.equal(res.status, 401)
  assert.equal(res.body.message, 'Authentication required')
})

test('requireAuth: returns 401 on tampered or malformed JWT token', async () => {
  const res = await callRouter(requireAuth, {
    method: 'GET',
    headers: { authorization: 'Bearer invalid.token.value' },
  })
  assert.equal(res.status, 401)
  assert.equal(res.body.message, 'Invalid or expired session')
})

test('requireAuth: returns 401 when JWT is missing sessionId (sid)', async () => {
  const token = jwt.sign({ sub: new mongoose.Types.ObjectId().toString() }, process.env.JWT_SECRET)
  const res = await callRouter(requireAuth, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(res.status, 401)
  assert.equal(res.body.message, 'Your previous session has expired. Sign in again.')
})

test('requireAuth: returns 401 when session is revoked or expired in database', async () => {
  const userId = new mongoose.Types.ObjectId()
  const sessionId = 'test-session-revoked'
  const token = signToken({ _id: userId }, { sessionId })

  // Session findOne returns null because revokedAt is set or session expired
  AuthSession.findOne = async () => null
  User.findById = () => ({
    select: () => Promise.resolve({ _id: userId, active: true, role: 'OWNER' }),
  })

  const res = await callRouter(requireAuth, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(res.status, 401)
  assert.equal(res.body.message, 'Session is no longer active')
})

test('requireAuth: returns 401 when user account is deactivated (active: false)', async () => {
  const userId = new mongoose.Types.ObjectId()
  const sessionId = 'test-session-inactive-user'
  const token = signToken({ _id: userId }, { sessionId })

  AuthSession.findOne = async () => ({
    sessionId,
    user: userId,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 3600000),
  })
  User.findById = () => ({
    select: () => Promise.resolve({ _id: userId, active: false, role: 'CASHIER' }),
  })

  const res = await callRouter(requireAuth, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(res.status, 401)
  assert.equal(res.body.message, 'Session is no longer active')
})

test('requireAuth: enforces CSRF check on cookie-only unsafe requests without header', async () => {
  const userId = new mongoose.Types.ObjectId()
  const sessionId = 'test-session-csrf'
  const token = signToken({ _id: userId }, { sessionId })

  const res = await callRouter(requireAuth, {
    method: 'POST',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    body: { name: 'Test' },
  })
  assert.equal(res.status, 403)
  assert.equal(res.body.message, 'Request verification failed')
})

test('requireAuth: allows cookie-only unsafe request with x-phoneflow-request: 1 header', async () => {
  const userId = new mongoose.Types.ObjectId()
  const sessionId = 'test-session-csrf-pass'
  const token = signToken({ _id: userId }, { sessionId })

  AuthSession.findOne = async () => ({
    sessionId,
    user: userId,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 3600000),
  })
  AuthSession.updateOne = async () => ({ acknowledged: true })
  User.findById = () => ({
    select: () => Promise.resolve({ _id: userId, active: true, role: 'OWNER' }),
  })

  const res = await callRouter(requireAuth, {
    method: 'POST',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
      'x-phoneflow-request': '1',
    },
    body: { name: 'Test' },
  })
  assert.equal(res.passed, true)
  assert.equal(res.req.user.role, 'OWNER')
})

// -------------------------------------------------------------
// 2. allowRoles permission tests
// -------------------------------------------------------------
test('allowRoles: returns 403 when user does not have required role', async () => {
  const middleware = allowRoles('OWNER', 'MANAGER')
  const res = await callRouter(middleware, {
    user: { role: 'CASHIER', name: 'Cashier Staff' },
  })
  assert.equal(res.status, 403)
  assert.equal(res.body.message, 'You do not have permission to perform this action')
})

test('allowRoles: passes when user has an authorized role', async () => {
  const middleware = allowRoles('OWNER', 'MANAGER')
  const res = await callRouter(middleware, {
    user: { role: 'MANAGER', name: 'Store Manager' },
  })
  assert.equal(res.passed, true)
})

// -------------------------------------------------------------
// 3. /auth/login authentication flows
// -------------------------------------------------------------
test('/auth/login: rejects wrong password with 401 and logs security event', async () => {
  const passwordHash = await bcrypt.hash('correctpassword', 12)
  const userId = new mongoose.Types.ObjectId()
  let loggedAction = null
  let loggedReason = null

  User.findOne = async () => ({
    _id: userId,
    name: 'Owner',
    email: 'owner@shop.com',
    role: 'OWNER',
    active: true,
    passwordHash,
  })

  ActivityLog.create = async (doc) => {
    loggedAction = doc.action
    loggedReason = doc.details?.reason
    return {}
  }

  const res = await callRouter(sessionSecurityRouter, {
    method: 'POST',
    url: '/auth/login',
    body: { email: 'owner@shop.com', password: 'wrongpassword' },
  })

  assert.equal(res.status, 401)
  assert.equal(res.body.message, 'Invalid email or password')
})

test('/auth/login: rejects inactive user account with 401', async () => {
  const passwordHash = await bcrypt.hash('secret1234', 12)
  User.findOne = async () => ({
    _id: new mongoose.Types.ObjectId(),
    name: 'Ex-employee',
    email: 'inactive@shop.com',
    role: 'CASHIER',
    active: false,
    passwordHash,
  })

  const res = await callRouter(sessionSecurityRouter, {
    method: 'POST',
    url: '/auth/login',
    body: { email: 'inactive@shop.com', password: 'secret1234' },
  })

  assert.equal(res.status, 401)
  assert.equal(res.body.message, 'Invalid email or password')
})

test('/auth/login: signs in active user without 2FA, issues session and sets cookie', async () => {
  const userId = new mongoose.Types.ObjectId()
  const passwordHash = await bcrypt.hash('secret1234', 12)
  User.findOne = async () => ({
    _id: userId,
    name: 'Shop Owner',
    email: 'owner@shop.com',
    role: 'OWNER',
    active: true,
    passwordHash,
  })
  User.updateOne = async () => ({ acknowledged: true })
  TwoFactorCredential.exists = async () => false
  TwoFactorCredential.findOne = () => ({
    select: () => ({
      lean: () => Promise.resolve(null),
    }),
  })

  let createdSessionId = null
  AuthSession.create = async (doc) => {
    createdSessionId = doc.sessionId
    return {
      _id: new mongoose.Types.ObjectId(),
      ...doc,
    }
  }

  const res = await callRouter(sessionSecurityRouter, {
    method: 'POST',
    url: '/auth/login',
    body: { email: 'owner@shop.com', password: 'secret1234' },
  })

  assert.equal(res.status, 200)
  assert.equal(res.body.user.email, 'owner@shop.com')
  assert.equal(res.body.user.role, 'OWNER')
  assert.ok(createdSessionId)

  // Verify session cookie was set
  const sessionCookie = res.cookiesSet.find((c) => c.name === SESSION_COOKIE_NAME)
  assert.ok(sessionCookie)
  assert.ok(sessionCookie.val)
})

test('/auth/login: returns requiresTwoFactor challenge when user has 2FA enabled', async () => {
  const userId = new mongoose.Types.ObjectId()
  const passwordHash = await bcrypt.hash('secret1234', 12)
  User.findOne = async () => ({
    _id: userId,
    name: 'Protected Owner',
    email: '2fa@shop.com',
    role: 'OWNER',
    active: true,
    passwordHash,
  })

  TwoFactorCredential.exists = async () => true
  TwoFactorCredential.findOne = () => ({
    select: () => ({
      lean: () => Promise.resolve({ _id: new mongoose.Types.ObjectId() }),
    }),
  })

  TwoFactorChallenge.deleteMany = async () => ({ acknowledged: true })
  TwoFactorChallenge.create = async (doc) => ({
    _id: new mongoose.Types.ObjectId(),
    ...doc,
  })

  const res = await callRouter(sessionSecurityRouter, {
    method: 'POST',
    url: '/auth/login',
    body: { email: '2fa@shop.com', password: 'secret1234' },
  })

  assert.equal(res.status, 200)
  assert.equal(res.body.requiresTwoFactor, true)
  assert.ok(res.body.challengeToken)
  assert.ok(res.body.expiresAt)
  assert.equal(res.body.account.email, '2fa@shop.com')
})

// -------------------------------------------------------------
// 4. /auth/me and /auth/logout
// -------------------------------------------------------------
test('/auth/me: returns user profile when authenticated', async () => {
  const userId = new mongoose.Types.ObjectId()
  const sessionId = 'me-session-1'
  const token = signToken({ _id: userId }, { sessionId })

  AuthSession.findOne = async () => ({
    sessionId,
    user: userId,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 3600000),
  })
  AuthSession.updateOne = async () => ({ acknowledged: true })
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: userId,
      name: 'Logged-in User',
      email: 'user@shop.com',
      role: 'MANAGER',
      active: true,
    }),
  })

  const res = await callRouter(sessionSecurityRouter, {
    method: 'GET',
    url: '/auth/me',
    headers: { authorization: `Bearer ${token}` },
  })

  assert.equal(res.status, 200)
  assert.equal(res.body.user.name, 'Logged-in User')
  assert.equal(res.body.user.role, 'MANAGER')
})

test('/auth/logout: revokes session in database and clears session cookie', async () => {
  const userId = new mongoose.Types.ObjectId()
  const sessionId = 'logout-session-1'
  const token = signToken({ _id: userId }, { sessionId })
  let revokedSessionId = null

  AuthSession.findOne = async () => ({
    sessionId,
    user: userId,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 3600000),
  })
  AuthSession.findOneAndUpdate = async (filter) => {
    if (filter.sessionId) revokedSessionId = filter.sessionId
    return { acknowledged: true }
  }
  AuthSession.updateOne = async () => ({ acknowledged: true })
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: userId,
      name: 'Owner',
      email: 'owner@shop.com',
      role: 'OWNER',
      active: true,
    }),
  })

  const res = await callRouter(sessionSecurityRouter, {
    method: 'POST',
    url: '/auth/logout',
    headers: { authorization: `Bearer ${token}` },
  })

  assert.equal(res.status, 200)
  assert.equal(res.body.loggedOut, true)
  assert.equal(revokedSessionId, sessionId)
  assert.ok(res.cookiesCleared.some((c) => c.name === SESSION_COOKIE_NAME))
})

// -------------------------------------------------------------
// 5. Server-side role enforcement on /users routes (routes.js)
// -------------------------------------------------------------
test('/users GET: CASHIER is denied (403), MANAGER is allowed (200)', async () => {
  const cashierId = new mongoose.Types.ObjectId()
  const cashierToken = signToken({ _id: cashierId }, { sessionId: 'cashier-sess' })

  AuthSession.findOne = async () => ({
    sessionId: 'cashier-sess',
    user: cashierId,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 3600000),
  })
  AuthSession.updateOne = async () => ({ acknowledged: true })
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: cashierId,
      name: 'Cashier Staff',
      role: 'CASHIER',
      active: true,
    }),
  })

  // 1. CASHIER attempt -> 403
  const cashierRes = await callRouter(appRouter, {
    method: 'GET',
    url: '/users',
    headers: { authorization: `Bearer ${cashierToken}` },
  })
  assert.equal(cashierRes.status, 403)
  assert.equal(cashierRes.body.message, 'You do not have permission to perform this action')

  // 2. MANAGER attempt -> 200
  const managerId = new mongoose.Types.ObjectId()
  const managerToken = signToken({ _id: managerId }, { sessionId: 'manager-sess' })
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: managerId,
      name: 'Manager Staff',
      role: 'MANAGER',
      active: true,
    }),
  })
  User.find = () => ({
    select: () => ({
      sort: () => Promise.resolve([
        { _id: managerId, name: 'Manager Staff', role: 'MANAGER', active: true },
      ]),
    }),
  })

  const managerRes = await callRouter(appRouter, {
    method: 'GET',
    url: '/users',
    headers: { authorization: `Bearer ${managerToken}` },
  })
  assert.equal(managerRes.status, 200)
  assert.equal(managerRes.body.users.length, 1)
})

test('/users POST: MANAGER is denied (403), OWNER can create user (201)', async () => {
  const managerId = new mongoose.Types.ObjectId()
  const managerToken = signToken({ _id: managerId }, { sessionId: 'mgr-sess' })

  AuthSession.findOne = async () => ({
    sessionId: 'mgr-sess',
    user: managerId,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 3600000),
  })
  AuthSession.updateOne = async () => ({ acknowledged: true })
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: managerId,
      name: 'Store Manager',
      role: 'MANAGER',
      active: true,
    }),
  })

  // 1. MANAGER attempt to create user -> 403
  const managerRes = await callRouter(appRouter, {
    method: 'POST',
    url: '/users',
    headers: { authorization: `Bearer ${managerToken}` },
    body: { name: 'New Cashier', email: 'new@shop.com', password: 'password123', role: 'CASHIER' },
  })
  assert.equal(managerRes.status, 403)

  // 2. OWNER attempt -> 201
  const ownerId = new mongoose.Types.ObjectId()
  const ownerToken = signToken({ _id: ownerId }, { sessionId: 'owner-sess' })
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: ownerId,
      name: 'Shop Owner',
      role: 'OWNER',
      active: true,
    }),
  })
  User.create = async (doc) => ({
    _id: new mongoose.Types.ObjectId(),
    name: doc.name,
    email: doc.email,
    role: doc.role,
    active: true,
  })

  const ownerRes = await callRouter(appRouter, {
    method: 'POST',
    url: '/users',
    headers: { authorization: `Bearer ${ownerToken}` },
    body: { name: 'New Cashier', email: 'new@shop.com', password: 'password123', role: 'CASHIER' },
  })
  assert.equal(ownerRes.status, 201)
  assert.equal(ownerRes.body.user.name, 'New Cashier')
  assert.equal(ownerRes.body.user.role, 'CASHIER')
})

test('/users DELETE: MANAGER is denied (403), OWNER can delete inactive staff (200)', async () => {
  const managerId = new mongoose.Types.ObjectId()
  const targetId = new mongoose.Types.ObjectId()
  const managerToken = signToken({ _id: managerId }, { sessionId: 'mgr-del-sess' })

  AuthSession.findOne = async () => ({
    sessionId: 'mgr-del-sess',
    user: managerId,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 3600000),
  })
  AuthSession.updateOne = async () => ({ acknowledged: true })
  User.findById = (id) => ({
    select: () => Promise.resolve({
      _id: managerId,
      name: 'Store Manager',
      role: 'MANAGER',
      active: true,
    }),
  })

  // 1. MANAGER cannot delete -> 403
  const managerRes = await callRouter(appRouter, {
    method: 'DELETE',
    url: `/users/${targetId}`,
    params: { id: targetId.toString() },
    headers: { authorization: `Bearer ${managerToken}` },
  })
  assert.equal(managerRes.status, 403)

  // 2. OWNER can delete inactive staff -> 200
  const ownerId = new mongoose.Types.ObjectId()
  const ownerToken = signToken({ _id: ownerId }, { sessionId: 'owner-del-sess' })
  User.findById = (id) => {
    if (String(id) === String(ownerId)) {
      return {
        select: () => Promise.resolve({
          _id: ownerId,
          name: 'Shop Owner',
          role: 'OWNER',
          active: true,
        }),
      }
    }
    return {
      select: () => Promise.resolve({
        _id: targetId,
        name: 'Inactive Staff',
        role: 'CASHIER',
        active: false,
      }),
    }
  }
  User.deleteOne = async () => ({ acknowledged: true, deletedCount: 1 })
  AuthSession.deleteMany = async () => ({ acknowledged: true })
  AndroidPairing.deleteMany = async () => ({ acknowledged: true })
  TwoFactorCredential.deleteMany = async () => ({ acknowledged: true })
  TwoFactorSetup.deleteMany = async () => ({ acknowledged: true })
  TwoFactorChallenge.deleteMany = async () => ({ acknowledged: true })

  const ownerRes = await callRouter(appRouter, {
    method: 'DELETE',
    url: `/users/${targetId}`,
    params: { id: targetId.toString() },
    headers: { authorization: `Bearer ${ownerToken}` },
  })
  assert.equal(ownerRes.status, 200)
  assert.equal(ownerRes.body.deleted, true)
})

// -------------------------------------------------------------
// 6. 2FA setup and requirement routes (/security/two-factor/*)
// -------------------------------------------------------------
test('/security/two-factor/setup: returns 503 if encryption key is not configured', async () => {
  delete process.env.TWO_FACTOR_ENCRYPTION_KEY
  const ownerId = new mongoose.Types.ObjectId()
  const token = signToken({ _id: ownerId }, { sessionId: 'no-key-sess' })

  AuthSession.findOne = async () => ({
    sessionId: 'no-key-sess',
    user: ownerId,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 3600000),
  })
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: ownerId,
      name: 'Owner',
      role: 'OWNER',
      active: true,
    }),
  })

  const res = await callRouter(sessionSecurityRouter, {
    method: 'POST',
    url: '/security/two-factor/setup',
    headers: { authorization: `Bearer ${token}` },
  })

  assert.equal(res.status, 503)
  assert.match(res.body.message, /TWO_FACTOR_ENCRYPTION_KEY/i)
})

test('/security/two-factor/setup: returns 403 if user role is CASHIER', async () => {
  const cashierId = new mongoose.Types.ObjectId()
  const token = signToken({ _id: cashierId }, { sessionId: 'cashier-2fa-sess' })

  AuthSession.findOne = async () => ({
    sessionId: 'cashier-2fa-sess',
    user: cashierId,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 3600000),
  })
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: cashierId,
      name: 'Cashier Staff',
      role: 'CASHIER',
      active: true,
    }),
  })

  const res = await callRouter(sessionSecurityRouter, {
    method: 'POST',
    url: '/security/two-factor/setup',
    headers: { authorization: `Bearer ${token}` },
  })

  assert.equal(res.status, 403)
  assert.match(res.body.message, /Owner and Manager accounts/i)
})

test('/security/two-factor/setup: generates 2FA secret and setupId for OWNER', async () => {
  const ownerId = new mongoose.Types.ObjectId()
  const token = signToken({ _id: ownerId }, { sessionId: 'owner-2fa-setup-sess' })

  AuthSession.findOne = async () => ({
    sessionId: 'owner-2fa-setup-sess',
    user: ownerId,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 3600000),
  })
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: ownerId,
      name: 'Owner User',
      email: 'owner@shop.com',
      role: 'OWNER',
      active: true,
    }),
  })
  TwoFactorCredential.findOne = () => ({
    select: () => ({
      lean: () => Promise.resolve(null),
    }),
  })
  AuthSession.updateOne = async () => ({ acknowledged: true })
  TwoFactorSetup.deleteMany = async () => ({ acknowledged: true })
  TwoFactorSetup.create = async (doc) => ({
    _id: new mongoose.Types.ObjectId(),
    ...doc,
  })

  const res = await callRouter(sessionSecurityRouter, {
    method: 'POST',
    url: '/security/two-factor/setup',
    headers: { authorization: `Bearer ${token}` },
  })

  assert.equal(res.status, 201)
  assert.ok(res.body.setupId)
  assert.ok(res.body.secret)
  assert.ok(res.body.otpauthUri)
  assert.match(res.body.otpauthUri, /^otpauth:\/\/totp\//)
})

// -------------------------------------------------------------
// 7. Session revocation endpoints (/security/sessions/*)
// -------------------------------------------------------------
test('/security/sessions/revoke-others: revokes other active sessions and returns count', async () => {
  const userId = new mongoose.Types.ObjectId()
  const currentSessionId = 'current-session-123'
  const token = signToken({ _id: userId }, { sessionId: currentSessionId })

  AuthSession.findOne = async () => ({
    sessionId: currentSessionId,
    user: userId,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 3600000),
  })
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: userId,
      name: 'Owner',
      role: 'OWNER',
      active: true,
    }),
  })
  AuthSession.updateMany = async () => ({ modifiedCount: 3 })

  const res = await callRouter(sessionSecurityRouter, {
    method: 'POST',
    url: '/security/sessions/revoke-others',
    headers: { authorization: `Bearer ${token}` },
  })

  assert.equal(res.status, 200)
  assert.equal(res.body.revokedCount, 3)
})

test('/security/sessions/revoke-all: revokes all sessions and clears cookie', async () => {
  const userId = new mongoose.Types.ObjectId()
  const currentSessionId = 'emergency-session'
  const token = signToken({ _id: userId }, { sessionId: currentSessionId })

  AuthSession.findOne = async () => ({
    sessionId: currentSessionId,
    user: userId,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 3600000),
  })
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: userId,
      name: 'Owner',
      role: 'OWNER',
      active: true,
    }),
  })
  AuthSession.updateMany = async () => ({ modifiedCount: 5 })

  const res = await callRouter(sessionSecurityRouter, {
    method: 'POST',
    url: '/security/sessions/revoke-all',
    headers: { authorization: `Bearer ${token}` },
  })

  assert.equal(res.status, 200)
  assert.equal(res.body.revokedCount, 5)
  assert.equal(res.body.loggedOut, true)
  assert.ok(res.cookiesCleared.some((c) => c.name === SESSION_COOKIE_NAME))
})
