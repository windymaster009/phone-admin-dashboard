import mongoose from 'mongoose'

const { Schema, model } = mongoose

const encryptedSecretFields = {
  encryptedSecret: { type: Buffer, required: true, select: false },
  iv: { type: Buffer, required: true, select: false },
  authTag: { type: Buffer, required: true, select: false },
}

const twoFactorCredentialSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  ...encryptedSecretFields,
  recoveryCodeHashes: [{ type: String }],
  enabledAt: { type: Date, default: Date.now },
  lastUsedAt: Date,
  lastRecoveryUsedAt: Date,
}, { timestamps: true, versionKey: false })

const twoFactorSetupSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ...encryptedSecretFields,
  expiresAt: { type: Date, required: true, index: true },
}, { timestamps: true, versionKey: false })

twoFactorSetupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
twoFactorSetupSchema.index({ user: 1, createdAt: -1 })

const twoFactorChallengeSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true, index: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  deviceName: { type: String, trim: true, maxlength: 100 },
  attempts: { type: Number, min: 0, default: 0 },
  usedAt: { type: Date, default: null, index: true },
  expiresAt: { type: Date, required: true, index: true },
}, { timestamps: true, versionKey: false })

twoFactorChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
twoFactorChallengeSchema.index({ user: 1, usedAt: 1, expiresAt: -1 })

export const TwoFactorCredential = model('TwoFactorCredential', twoFactorCredentialSchema)
export const TwoFactorSetup = model('TwoFactorSetup', twoFactorSetupSchema)
export const TwoFactorChallenge = model('TwoFactorChallenge', twoFactorChallengeSchema)
