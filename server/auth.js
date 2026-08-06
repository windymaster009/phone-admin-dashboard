import jwt from 'jsonwebtoken'
import { ActivityLog, User } from './models.js'

export const SESSION_COOKIE_NAME = 'phoneflow_session'

function cookieValue(req, name) {
  const header = String(req.headers.cookie || '')
  for (const part of header.split(';')) {
    const [key, ...valueParts] = part.trim().split('=')
    if (key === name) return decodeURIComponent(valueParts.join('='))
  }
  return null
}

function sessionMaxAge() {
  const raw = String(process.env.JWT_EXPIRES_IN || '12h').trim().toLowerCase()
  const match = /^(\d+)(m|h|d)$/.exec(raw)
  if (!match) return 12 * 60 * 60 * 1000
  const amount = Number(match[1])
  const multiplier = match[2] === 'm' ? 60_000 : match[2] === 'd' ? 86_400_000 : 3_600_000
  return amount * multiplier
}

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: sessionMaxAge(),
  })
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  })
}

export function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '12h' },
  )
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || ''
    const bearerToken = header.startsWith('Bearer ') ? header.slice(7) : null
    const cookieToken = cookieValue(req, SESSION_COOKIE_NAME)
    const token = bearerToken || cookieToken

    if (!token) return res.status(401).json({ message: 'Authentication required' })

    const unsafeMethod = !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
    if (!bearerToken && cookieToken && unsafeMethod && req.get('x-phoneflow-request') !== '1') {
      return res.status(403).json({ message: 'Request verification failed' })
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(payload.sub).select('-passwordHash')

    if (!user || !user.active) return res.status(401).json({ message: 'Account is unavailable' })

    req.user = user
    next()
  } catch {
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
