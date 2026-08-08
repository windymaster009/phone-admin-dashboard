import { timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { clearSessionCookie, requireAuth, setSessionCookie, signToken, writeActivity } from './auth.js'
import { ActivityLog, User } from './models.js'
import {
  consumeAndroidPairing,
  createAndroidPairing,
  createAuthSession,
  listUserSessions,
  markSessionTwoFactorVerified,
  revokeAllSessions,
  revokeOtherSessions,
  revokeSession,
} from './sessionService.js'
import {
  confirmTwoFactorSetup,
  createLoginChallenge,
  createTwoFactorSetup,
  disableTwoFactor,
  getTwoFactorStatus,
  hasTwoFactor,
  regenerateRecoveryCodes,
  twoFactorServerStatus,
  verifyLoginChallenge,
} from './twoFactorService.js'

const router = Router()
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const dummyPasswordHash = bcrypt.hashSync('phoneflow-invalid-password', 12)

const pairingRedeemLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many pairing attempts. Wait a few minutes and try again.' },
})

const twoFactorVerifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many two-factor attempts. Wait a few minutes and try again.' },
})

function clean(value) {
  return typeof value === 'string' ? value.trim() : value
}

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
  }
}

function secureEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''))
  const rightBuffer = Buffer.from(String(right || ''))
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function isLoopbackRequest(req) {
  const address = String(req.socket?.remoteAddress || '')
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

async function issueSession(req, res, user, { kind = 'WEB', deviceName, twoFactorVerifiedAt = null } = {}) {
  const session = await createAuthSession({ user, req, kind, deviceName, twoFactorVerifiedAt })
  const token = signToken(user, { sessionId: session.sessionId, expiresAt: session.expiresAt })
  setSessionCookie(res, token, { expiresAt: session.expiresAt })
  return session
}

async function logSecurityEvent(req, user, action, details = {}) {
  const previousUser = req.user
  req.user = user
  try {
    await writeActivity(req, { action, entity: 'AUTH_SESSION', entityId: user?._id, details })
  } finally {
    req.user = previousUser
  }
}

router.get('/auth/status', asyncRoute(async (_req, res) => {
  const setupRequired = (await User.estimatedDocumentCount()) === 0
  res.json({ setupRequired })
}))

// Compatibility route for Android builds that previously requested an automatic
// LAN owner session. It now performs only a same-host redirect and never signs in.
router.get('/auth/android-lan-session', (req, res) => {
  const redirect = typeof req.query.redirect === 'string' ? req.query.redirect : ''
  try {
    const target = new URL(redirect)
    const requestHost = String(req.hostname || '').replace(/^\[|\]$/g, '').toLowerCase()
    const targetHost = String(target.hostname || '').replace(/^\[|\]$/g, '').toLowerCase()
    if (['http:', 'https:'].includes(target.protocol) && targetHost && targetHost === requestHost) {
      res.setHeader('Cache-Control', 'no-store')
      return res.redirect(302, target.toString())
    }
  } catch {
    // Fall through to a relative dashboard redirect.
  }
  res.setHeader('Cache-Control', 'no-store')
  return res.redirect(302, '/dashboard')
})

router.post('/auth/bootstrap', asyncRoute(async (req, res) => {
  if ((await User.estimatedDocumentCount()) > 0) {
    return res.status(409).json({ message: 'The owner account has already been created' })
  }

  const configuredToken = String(process.env.AUTH_BOOTSTRAP_TOKEN || '')
  const suppliedToken = String(req.get('x-bootstrap-token') || req.body.setupToken || '')
  const localDevelopmentSetup = process.env.NODE_ENV !== 'production' && isLoopbackRequest(req)
  if (!localDevelopmentSetup && (!configuredToken || !secureEqual(configuredToken, suppliedToken))) {
    return res.status(403).json({ message: 'Owner setup is not authorized on this server' })
  }

  const name = clean(req.body.name)
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body.password === 'string' ? req.body.password : ''
  if (!name || !email || !password || password.length < 8) {
    return res.status(400).json({ message: 'Name, email and a password of at least 8 characters are required' })
  }

  const user = await User.create({
    name,
    email,
    passwordHash: await bcrypt.hash(password, 12),
    role: 'OWNER',
  })
  const session = await issueSession(req, res, user)
  await logSecurityEvent(req, user, 'LOGIN', { method: 'BOOTSTRAP', sessionId: session.sessionId })
  res.status(201).json({ user: publicUser(user) })
}))

router.post('/auth/login', asyncRoute(async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body.password === 'string' ? req.body.password : ''
  const user = email ? await User.findOne({ email }) : null
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash || dummyPasswordHash)

  if (!user || !user.active || !passwordMatches) {
    if (user) await logSecurityEvent(req, user, 'LOGIN_FAILED', { reason: user.active ? 'INVALID_PASSWORD' : 'INACTIVE_ACCOUNT' })
    return res.status(401).json({ message: 'Invalid email or password' })
  }

  if (await hasTwoFactor(user._id)) {
    const challenge = await createLoginChallenge({ user, deviceName: clean(req.body.deviceName) })
    await logSecurityEvent(req, user, 'TWO_FACTOR_CHALLENGE', { expiresAt: challenge.expiresAt })
    res.setHeader('Cache-Control', 'no-store')
    return res.json({
      requiresTwoFactor: true,
      challengeToken: challenge.token,
      expiresAt: challenge.expiresAt,
      account: { email: user.email, name: user.name },
    })
  }

  const session = await issueSession(req, res, user)
  req.user = user
  await Promise.all([
    User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }),
    writeActivity(req, {
      action: 'LOGIN',
      entity: 'AUTH_SESSION',
      entityId: user._id,
      details: { sessionId: session.sessionId, kind: session.kind, deviceName: session.deviceName, twoFactor: false },
    }),
  ])
  res.json({ user: publicUser(user) })
}))

router.post('/auth/2fa/verify-login', twoFactorVerifyLimiter, asyncRoute(async (req, res) => {
  const verified = await verifyLoginChallenge({
    token: req.body.challengeToken,
    code: req.body.code,
  })
  const user = await User.findById(verified.userId).select('-passwordHash')
  if (!user || !user.active) return res.status(401).json({ message: 'The staff account is unavailable' })

  const verifiedAt = new Date()
  const session = await issueSession(req, res, user, {
    deviceName: verified.deviceName,
    twoFactorVerifiedAt: verifiedAt,
  })
  req.user = user
  await Promise.all([
    User.updateOne({ _id: user._id }, { $set: { lastLoginAt: verifiedAt } }),
    writeActivity(req, {
      action: 'LOGIN',
      entity: 'AUTH_SESSION',
      entityId: user._id,
      details: {
        sessionId: session.sessionId,
        kind: session.kind,
        deviceName: session.deviceName,
        twoFactor: true,
        recoveryCode: verified.usedRecoveryCode,
      },
    }),
    writeActivity(req, {
      action: verified.usedRecoveryCode ? 'TWO_FACTOR_RECOVERY_USED' : 'TWO_FACTOR_VERIFIED',
      entity: 'AUTH_SESSION',
      entityId: user._id,
      details: { sessionId: session.sessionId },
    }),
  ])
  res.json({ user: publicUser(user), twoFactorVerified: true, recoveryCodeUsed: verified.usedRecoveryCode })
}))

router.get('/auth/me', requireAuth, (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store')
  res.json({ user: publicUser(req.user) })
})

router.post('/auth/logout', requireAuth, asyncRoute(async (req, res) => {
  await revokeSession({ userId: req.user._id, sessionId: req.authSession.sessionId, reason: 'LOGOUT' })
  clearSessionCookie(res)
  await writeActivity(req, {
    action: 'LOGOUT',
    entity: 'AUTH_SESSION',
    entityId: req.user._id,
    details: { sessionId: req.authSession.sessionId },
  })
  res.json({ loggedOut: true })
}))

router.post('/auth/pairing/redeem', pairingRedeemLimiter, asyncRoute(async (req, res) => {
  const pairing = await consumeAndroidPairing(req.body.code)
  if (!pairing) return res.status(401).json({ message: 'Pairing code is invalid or expired' })

  const user = await User.findById(pairing.user).select('-passwordHash')
  if (!user || !user.active) return res.status(401).json({ message: 'The paired staff account is unavailable' })
  if (await hasTwoFactor(user._id) && !pairing.twoFactorVerifiedAt) {
    return res.status(401).json({ message: 'This pairing code was not created from a two-factor verified session' })
  }

  const deviceName = clean(req.body.deviceName) || 'PhoneFlow Android'
  const session = await issueSession(req, res, user, {
    kind: 'ANDROID',
    deviceName,
    twoFactorVerifiedAt: pairing.twoFactorVerifiedAt,
  })
  req.user = user
  await writeActivity(req, {
    action: 'ANDROID_PAIRED',
    entity: 'AUTH_SESSION',
    entityId: user._id,
    details: { sessionId: session.sessionId, deviceName: session.deviceName, twoFactor: Boolean(pairing.twoFactorVerifiedAt) },
  })
  res.json({ user: publicUser(user), paired: true })
}))

router.get('/security/sessions', requireAuth, asyncRoute(async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store')
  res.json({ sessions: await listUserSessions(req.user._id, req.authSession.sessionId) })
}))

router.get('/security/two-factor', requireAuth, asyncRoute(async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store')
  res.json(await getTwoFactorStatus(req.user))
}))

router.post('/security/two-factor/setup', requireAuth, asyncRoute(async (req, res) => {
  if (!twoFactorServerStatus().configured) {
    return res.status(503).json({ message: 'Configure TWO_FACTOR_ENCRYPTION_KEY before enabling two-factor authentication' })
  }
  const status = await getTwoFactorStatus(req.user)
  if (!status.eligible) return res.status(403).json({ message: 'Two-factor authentication is available for Owner and Manager accounts' })
  if (status.enabled) return res.status(409).json({ message: 'Two-factor authentication is already enabled' })

  const setup = await createTwoFactorSetup(req.user)
  await writeActivity(req, {
    action: 'TWO_FACTOR_SETUP_STARTED',
    entity: 'AUTH_SESSION',
    entityId: req.user._id,
    details: { expiresAt: setup.expiresAt },
  })
  res.status(201).json(setup)
}))

router.post('/security/two-factor/enable', requireAuth, twoFactorVerifyLimiter, asyncRoute(async (req, res) => {
  const setupId = String(req.body.setupId || '')
  if (!mongoose.isValidObjectId(setupId)) return res.status(400).json({ message: 'Two-factor setup is invalid or expired' })

  const enabled = await confirmTwoFactorSetup({ user: req.user, setupId, code: req.body.code })
  const verifiedAt = new Date()
  const [, revokedCount] = await Promise.all([
    markSessionTwoFactorVerified({ userId: req.user._id, sessionId: req.authSession.sessionId, verifiedAt }),
    revokeOtherSessions({
      userId: req.user._id,
      currentSessionId: req.authSession.sessionId,
      reason: 'TWO_FACTOR_ENABLED',
    }),
  ])
  req.authSession.twoFactorVerifiedAt = verifiedAt
  await writeActivity(req, {
    action: 'TWO_FACTOR_ENABLED',
    entity: 'AUTH_SESSION',
    entityId: req.user._id,
    details: { revokedOtherSessions: revokedCount },
  })
  res.json({
    enabled: true,
    recoveryCodes: enabled.recoveryCodes,
    recoveryCodesRemaining: enabled.recoveryCodes.length,
  })
}))

router.post('/security/two-factor/recovery-codes', requireAuth, twoFactorVerifyLimiter, asyncRoute(async (req, res) => {
  const result = await regenerateRecoveryCodes({ userId: req.user._id, code: req.body.code })
  await writeActivity(req, {
    action: 'TWO_FACTOR_RECOVERY_REGENERATED',
    entity: 'AUTH_SESSION',
    entityId: req.user._id,
    details: { count: result.recoveryCodes.length },
  })
  res.json(result)
}))

router.post('/security/two-factor/disable', requireAuth, twoFactorVerifyLimiter, asyncRoute(async (req, res) => {
  await disableTwoFactor({ userId: req.user._id, code: req.body.code })
  const revokedCount = await revokeOtherSessions({
    userId: req.user._id,
    currentSessionId: req.authSession.sessionId,
    reason: 'TWO_FACTOR_DISABLED',
  })
  await writeActivity(req, {
    action: 'TWO_FACTOR_DISABLED',
    entity: 'AUTH_SESSION',
    entityId: req.user._id,
    details: { revokedOtherSessions: revokedCount },
  })
  res.json({ disabled: true, revokedOtherSessions: revokedCount })
}))

router.post('/security/android-pairing', requireAuth, asyncRoute(async (req, res) => {
  if (await hasTwoFactor(req.user._id) && !req.authSession.twoFactorVerifiedAt) {
    return res.status(403).json({ message: 'Reauthenticate with two-factor authentication before pairing Android' })
  }
  const pairing = await createAndroidPairing({
    userId: req.user._id,
    sessionId: req.authSession.sessionId,
    twoFactorVerifiedAt: req.authSession.twoFactorVerifiedAt,
  })
  await writeActivity(req, {
    action: 'ANDROID_PAIRING_CREATED',
    entity: 'AUTH_SESSION',
    entityId: req.user._id,
    details: { expiresAt: pairing.expiresAt, twoFactor: Boolean(req.authSession.twoFactorVerifiedAt) },
  })
  res.status(201).json(pairing)
}))

router.delete('/security/sessions/:sessionId', requireAuth, asyncRoute(async (req, res) => {
  const sessionId = String(req.params.sessionId || '')
  const revoked = await revokeSession({ userId: req.user._id, sessionId, reason: 'MANUAL_REVOKE' })
  if (!revoked) return res.status(404).json({ message: 'Active session was not found' })

  const current = sessionId === req.authSession.sessionId
  if (current) clearSessionCookie(res)
  await writeActivity(req, {
    action: 'SESSION_REVOKED',
    entity: 'AUTH_SESSION',
    entityId: req.user._id,
    details: { sessionId, current },
  })
  res.json({ revoked: true, current })
}))

router.post('/security/sessions/revoke-others', requireAuth, asyncRoute(async (req, res) => {
  const revokedCount = await revokeOtherSessions({
    userId: req.user._id,
    currentSessionId: req.authSession.sessionId,
    reason: 'REVOKE_OTHER_DEVICES',
  })
  await writeActivity(req, {
    action: 'OTHER_SESSIONS_REVOKED',
    entity: 'AUTH_SESSION',
    entityId: req.user._id,
    details: { revokedCount, currentSessionId: req.authSession.sessionId },
  })
  res.json({ revokedCount })
}))

router.post('/security/sessions/revoke-all', requireAuth, asyncRoute(async (req, res) => {
  const revokedCount = await revokeAllSessions({ userId: req.user._id, reason: 'REVOKE_ALL_DEVICES' })
  clearSessionCookie(res)
  await writeActivity(req, {
    action: 'ALL_SESSIONS_REVOKED',
    entity: 'AUTH_SESSION',
    entityId: req.user._id,
    details: { revokedCount },
  })
  res.json({ revokedCount, loggedOut: true })
}))

router.get('/security/events', requireAuth, asyncRoute(async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))
  const events = await ActivityLog.find({ user: req.user._id, entity: 'AUTH_SESSION' })
    .select('action details ipAddress createdAt')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
  res.setHeader('Cache-Control', 'private, no-store')
  res.json({ events })
}))

export default router
