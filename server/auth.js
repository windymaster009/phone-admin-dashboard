import jwt from 'jsonwebtoken'
import { ActivityLog, User } from './models.js'

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
    const token = header.startsWith('Bearer ') ? header.slice(7) : null

    if (!token) return res.status(401).json({ message: 'Authentication required' })

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
