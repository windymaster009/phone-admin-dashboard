import jwt from 'jsonwebtoken'
import { ActivityLog, User } from './models.js'
import { findActiveSession, sessionDurationMs, touchSession } from './sessionService.js'

export const SESSION_COOKIE_NAME = 'phoneflow_session'

function cookieValue(req, name) {
  const header = String(req.headers.cookie || '')
  for (const part of header.split(';')) {
    const [key, ...valueParts] = part.trim().split('=')
    if (key === name) return decodeURIComponent(valueParts.join('='))
  }
  return null
}

export function getRequestSessionToken(req) {
  const header = req.headers.authorization || ''
  const bearerToken = header.startsWith('Bearer ') ? header.slice(7) : null
  const cookieToken = cookieValue(req, SESSION_COOKIE_NAME)
  return { bearerToken, cookieToken, token: bearerToken || cookieToken }
}

export function setSessionCookie(res, token, { expiresAt } = {}) {
  const remainingMs = expiresAt ? Math.max(1_000, new Date(expiresAt).getTime() - Date.now()) : sessionDurationMs()
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: remainingMs,
    priority: 'high',
  })
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    priority: 'high',
  })
}

export function signToken(user, { sessionId, expiresAt } = {}) {
  if (!sessionId) throw new Error('A server-side session ID is required to sign a PhoneFlow session')
  const remainingSeconds = expiresAt
    ? Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000))
    : Math.ceil(sessionDurationMs() / 1000)

  return jwt.sign(
    { sub: user._id.toString(), sid: sessionId },
    process.env.JWT_SECRET,
    { expiresIn: remainingSeconds },
  )
}

export async function requireAuth(req, res, next) {
  try {
    const { bearerToken, cookieToken, token } = getRequestSessionToken(req)
    if (!token) return res.status(401).json({ message: 'Authentication required' })

    const unsafeMethod = !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
    if (!bearerToken && cookieToken && unsafeMethod && req.get('x-phoneflow-request') !== '1') {
      return res.status(403).json({ message: 'Request verification failed' })
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET)
    if (!payload?.sub || !payload?.sid) {
      clearSessionCookie(res)
      return res.status(401).json({ message: 'Your previous session has expired. Sign in again.' })
    }

    const [session, user] = await Promise.all([
      findActiveSession(payload.sid, payload.sub),
      User.findById(payload.sub).select('-passwordHash'),
    ])

    if (!session || !user || !user.active) {
      clearSessionCookie(res)
      return res.status(401).json({ message: 'Session is no longer active' })
    }

    req.user = user
    req.authSession = session
    touchSession(session, req)
    next()
  } catch {
    clearSessionCookie(res)
    return res.status(401).json({ message: 'Invalid or expired session' })
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action' })
    }
    next()
  }
}

export async function writeActivity(req, { action, entity, entityId, details }) {
  try {
    await ActivityLog.create({
      user: req.user?._id,
      action,
      entity,
      entityId,
      details,
      ipAddress: req.ip,
    })
  } catch (error) {
    console.error('Activity log failed:', error.message)
  }
}
