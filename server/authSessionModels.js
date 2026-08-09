import mongoose from 'mongoose'

const { Schema, model } = mongoose

const authSessionSchema = new Schema({
  sessionId: { type: String, required: true, unique: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kind: { type: String, enum: ['WEB', 'ANDROID'], default: 'WEB', index: true },
  deviceName: { type: String, trim: true, maxlength: 100 },
  userAgent: { type: String, trim: true, maxlength: 600 },
  ipAddress: { type: String, trim: true, maxlength: 128 },
  lastSeenAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null, index: true },
  revokedReason: { type: String, trim: true, maxlength: 120 },
}, { timestamps: true, versionKey: false })

authSessionSchema.index({ user: 1, revokedAt: 1, lastSeenAt: -1 })
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const androidPairingSchema = new Schema({
  codeHash: { type: String, required: true, unique: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  createdBySessionId: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null, index: true },
}, { timestamps: true, versionKey: false })

androidPairingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
androidPairingSchema.index({ user: 1, usedAt: 1, expiresAt: -1 })

export const AuthSession = model('AuthSession', authSessionSchema)
export const AndroidPairing = model('AndroidPairing', androidPairingSchema)
