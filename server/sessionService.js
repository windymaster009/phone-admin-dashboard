import { createHmac, randomInt, randomUUID } from 'node:crypto'
import { AndroidPairing, AuthSession } from './authSessionModels.js'

const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000

function cleanText(value, maximum = 100) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maximum)
}

export function sessionDurationMs() {
  const raw = String(process.env.JWT_EXPIRES_IN || '12h').trim().toLowerCase()
  const match = /^(\d+)(m|h|d)$/.exec(raw)
  if (!match) return 12 * 60 * 60 * 1000
  const amount = Number(match[1])
  const multiplier = match[2] === 'm' ? 60_000 : match[2] === 'd' ? 86_400_000 : 3_600_000
  return Math.max(5 * 60 * 1000, amount * multiplier)
}

export function pairingDurationMs() {
  const seconds = Number(process.env.ANDROID_PAIRING_TTL_SECONDS || 90)
  const safeSeconds = Number.isInteger(seconds) ? Math.min(300, Math.max(30, seconds)) : 90
  return safeSeconds * 1000
}

function inferDeviceName(req, kind, suppliedName) {
  const supplied = cleanText(suppliedName)
  if (supplied) return supplied

  const userAgent = String(req.get?.('user-agent') || '')
  if (/android/i.test(userAgent)) return kind === 'ANDROID' ? 'PhoneFlow Android' : 'Android browser'
  if (/iphone|ipad/i.test(userAgent)) return 'iPhone / iPad'
  if (/windows/i.test(userAgent)) {
    if (/edg\//i.test(userAgent)) return 'Windows · Edge'
    if (/chrome\//i.test(userAgent)) return 'Windows · Chrome'
    return 'Windows device'
  }
  if (/macintosh|mac os x/i.test(userAgent)) return /chrome\//i.test(userAgent) ? 'Mac · Chrome' : 'Mac'
  if (/linux/i.test(userAgent)) return 'Linux device'
  return kind === 'ANDROID' ? 'PhoneFlow Android' : 'Web browser'
}

export async function createAuthSession({ user, req, kind = 'WEB', deviceName } = {}) {
  const now = new Date()
  const session = await AuthSession.create({
    sessionId: randomUUID(),
    user: user._id,
    kind,
    deviceName: inferDeviceName(req, kind, deviceName),
    userAgent: cleanText(req.get?.('user-agent'), 600),
    ipAddress: cleanText(req.ip || req.socket?.remoteAddress, 128),
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + sessionDurationMs()),
  })
  return session
}

export async function findActiveSession(sessionId, userId) {
  if (!sessionId || !userId) return null
  return AuthSession.findOne({
    sessionId,
    user: userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
}

export function touchSession(session, req) {
  if (!session?._id) return
  const lastSeen = new Date(session.lastSeenAt || 0).getTime()
  const now = Date.now()
  if (now - lastSeen < SESSION_TOUCH_INTERVAL_MS) return

  void AuthSession.updateOne(
    { _id: session._id, revokedAt: null },
    {
      $set: {
        lastSeenAt: new Date(now),
        ipAddress: cleanText(req.ip || req.socket?.remoteAddress, 128),
      },
    },
  ).catch((error) => console.error('Unable to update session activity:', error.message))
}

export async function listUserSessions(userId, currentSessionId) {
  const now = new Date()
  const sessions = await AuthSession.find({ user: userId, expiresAt: { $gt: now } })
    .sort({ revokedAt: 1, lastSeenAt: -1, createdAt: -1 })
    .limit(50)
    .lean()

  return sessions.map((session) => ({
    id: session.sessionId,
    kind: session.kind,
    deviceName: session.deviceName || (session.kind === 'ANDROID' ? 'PhoneFlow Android' : 'Web browser'),
    ipAddress: session.ipAddress || '',
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
    current: session.sessionId === currentSessionId,
  }))
}

export async function revokeSession({ userId, sessionId, reason = 'REVOKED' } = {}) {
  return AuthSession.findOneAndUpdate(
    { user: userId, sessionId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: cleanText(reason, 120) } },
    { new: true },
  )
}

export async function revokeOtherSessions({ userId, currentSessionId, reason = 'REVOKE_OTHERS' } = {}) {
  const result = await AuthSession.updateMany(
    { user: userId, sessionId: { $ne: currentSessionId }, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: cleanText(reason, 120) } },
  )
  return result.modifiedCount || 0
}

export async function revokeAllSessions({ userId, reason = 'REVOKE_ALL' } = {}) {
  const result = await AuthSession.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: cleanText(reason, 120) } },
  )
  return result.modifiedCount || 0
}

function pairingHash(code) {
  const secret = String(process.env.JWT_SECRET || '')
  return createHmac('sha256', secret).update(`phoneflow-android-pairing:${code}`).digest('hex')
}

export async function createAndroidPairing({ userId, sessionId } = {}) {
  const now = new Date()
  await AndroidPairing.deleteMany({ user: userId, usedAt: null })

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const expiresAt = new Date(now.getTime() + pairingDurationMs())
    try {
      await AndroidPairing.create({
        codeHash: pairingHash(code),
        user: userId,
        createdBySessionId: sessionId,
        expiresAt,
      })
      return { code, expiresAt }
    } catch (error) {
      if (error?.code !== 11000) throw error
    }
  }

  throw Object.assign(new Error('Unable to generate a unique pairing code. Try again.'), { status: 503 })
}

export async function consumeAndroidPairing(code) {
  const normalizedCode = String(code || '').replace(/\D/g, '')
  if (!/^\d{6}$/.test(normalizedCode)) return null

  const now = new Date()
  return AndroidPairing.findOneAndUpdate(
    {
      codeHash: pairingHash(normalizedCode),
      usedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { usedAt: now } },
    { new: true },
  )
}
