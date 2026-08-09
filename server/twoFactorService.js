import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { TwoFactorChallenge, TwoFactorCredential, TwoFactorSetup } from './twoFactorModels.js'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const TOTP_STEP_SECONDS = 30
const TOTP_DIGITS = 6
const LOGIN_CHALLENGE_MS = 5 * 60 * 1000
const SETUP_CHALLENGE_MS = 10 * 60 * 1000
const MAX_LOGIN_ATTEMPTS = 5
const RECOVERY_CODE_COUNT = 10

function requestError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function encryptionKey() {
  const raw = String(process.env.TWO_FACTOR_ENCRYPTION_KEY || '').trim()
  if (!raw) throw requestError(503, 'Two-factor authentication is not configured on this server')
  let key
  try {
    key = Buffer.from(raw, 'base64')
  } catch {
    throw requestError(503, 'TWO_FACTOR_ENCRYPTION_KEY is invalid')
  }
  if (key.length !== 32) throw requestError(503, 'TWO_FACTOR_ENCRYPTION_KEY must decode to exactly 32 bytes')
  return key
}

export function twoFactorServerStatus() {
  try {
    const key = encryptionKey()
    return { configured: key.length === 32 }
  } catch {
    return { configured: false }
  }
}

function encryptSecret(secret) {
  const key = encryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encryptedSecret = Buffer.concat([cipher.update(secret), cipher.final()])
  const authTag = cipher.getAuthTag()
  return { encryptedSecret, iv, authTag }
}

function decryptSecret(record) {
  const key = encryptionKey()
  const decipher = createDecipheriv('aes-256-gcm', key, record.iv)
  decipher.setAuthTag(record.authTag)
  return Buffer.concat([decipher.update(record.encryptedSecret), decipher.final()])
}

function base32Encode(buffer) {
  let bits = ''
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0')
  let output = ''
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, '0')
    output += BASE32_ALPHABET[Number.parseInt(chunk, 2)]
  }
  return output
}

function base32Decode(value) {
  const normalized = String(value || '').toUpperCase().replace(/[^A-Z2-7]/g, '')
  if (!normalized) return Buffer.alloc(0)
  let bits = ''
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character)
    if (index < 0) return Buffer.alloc(0)
    bits += index.toString(2).padStart(5, '0')
  }
  const bytes = []
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2))
  }
  return Buffer.from(bytes)
}

function hotp(secret, counter) {
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', secret).update(counterBuffer).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary = (
    ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff)
  ) >>> 0
  return String(binary % (10 ** TOTP_DIGITS)).padStart(TOTP_DIGITS, '0')
}

function normalizeTotp(code) {
  return String(code || '').replace(/\D/g, '').slice(0, TOTP_DIGITS)
}

function safeCodeEqual(left, right) {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  return a.length === b.length && timingSafeEqual(a, b)
}

export function verifyTotp(secret, code, now = Date.now()) {
  const normalized = normalizeTotp(code)
  if (!/^\d{6}$/.test(normalized)) return false
  const counter = Math.floor(now / 1000 / TOTP_STEP_SECONDS)
  for (const offset of [-1, 0, 1]) {
    if (safeCodeEqual(hotp(secret, counter + offset), normalized)) return true
  }
  return false
}

function recoveryHash(code) {
  return createHmac('sha256', encryptionKey())
    .update(`phoneflow-recovery:${normalizeRecoveryCode(code)}`)
    .digest('hex')
}

function normalizeRecoveryCode(code) {
  return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function generateRecoveryCodes() {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const value = randomBytes(8).toString('hex').toUpperCase()
    return `PF2F-${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}`
  })
}

function challengeHash(token) {
  return createHmac('sha256', encryptionKey()).update(`phoneflow-2fa-login:${token}`).digest('hex')
}

export function twoFactorEligible(role) {
  return ['OWNER', 'MANAGER'].includes(String(role || '').toUpperCase())
}

export async function getTwoFactorStatus(user) {
  const eligible = twoFactorEligible(user?.role)
  const credential = eligible ? await TwoFactorCredential.findOne({ user: user._id }).select('enabledAt recoveryCodeHashes lastUsedAt lastRecoveryUsedAt').lean() : null
  return {
    configured: twoFactorServerStatus().configured,
    eligible,
    enabled: Boolean(credential),
    enabledAt: credential?.enabledAt || null,
    recoveryCodesRemaining: credential?.recoveryCodeHashes?.length || 0,
    lastUsedAt: credential?.lastUsedAt || null,
    lastRecoveryUsedAt: credential?.lastRecoveryUsedAt || null,
  }
}

export async function hasTwoFactor(userId) {
  return Boolean(await TwoFactorCredential.exists({ user: userId }))
}

export async function createTwoFactorSetup(user) {
  if (!twoFactorEligible(user?.role)) throw requestError(403, 'Two-factor authentication is available for Owner and Manager accounts')
  encryptionKey()
  await TwoFactorSetup.deleteMany({ user: user._id })
  const secret = randomBytes(20)
  const encrypted = encryptSecret(secret)
  const setup = await TwoFactorSetup.create({
    user: user._id,
    ...encrypted,
    expiresAt: new Date(Date.now() + SETUP_CHALLENGE_MS),
  })
  const base32Secret = base32Encode(secret)
  const issuer = encodeURIComponent('PhoneFlow')
  const account = encodeURIComponent(user.email || user.name || 'PhoneFlow account')
  const otpauthUri = `otpauth://totp/${issuer}:${account}?secret=${base32Secret}&issuer=${issuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`
  return {
    setupId: setup._id.toString(),
    secret: base32Secret,
    otpauthUri,
    expiresAt: setup.expiresAt,
  }
}

export async function confirmTwoFactorSetup({ user, setupId, code }) {
  const setup = await TwoFactorSetup.findOne({
    _id: setupId,
    user: user._id,
    expiresAt: { $gt: new Date() },
  }).select('+encryptedSecret +iv +authTag')
  if (!setup) throw requestError(400, 'Two-factor setup expired. Start again.')
  const secret = decryptSecret(setup)
  if (!verifyTotp(secret, code)) throw requestError(400, 'Authenticator code is invalid')

  const recoveryCodes = generateRecoveryCodes()
  const recoveryCodeHashes = recoveryCodes.map(recoveryHash)
  const encrypted = encryptSecret(secret)
  await TwoFactorCredential.findOneAndUpdate(
    { user: user._id },
    {
      $set: {
        ...encrypted,
        recoveryCodeHashes,
        enabledAt: new Date(),
        lastUsedAt: new Date(),
        lastRecoveryUsedAt: null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  await TwoFactorSetup.deleteMany({ user: user._id })
  return { recoveryCodes }
}

export async function createLoginChallenge({ user, deviceName }) {
  encryptionKey()
  await TwoFactorChallenge.deleteMany({ user: user._id, usedAt: null })
  const token = randomBytes(32).toString('base64url')
  const challenge = await TwoFactorChallenge.create({
    tokenHash: challengeHash(token),
    user: user._id,
    deviceName: String(deviceName || '').trim().slice(0, 100),
    expiresAt: new Date(Date.now() + LOGIN_CHALLENGE_MS),
  })
  return { token, expiresAt: challenge.expiresAt }
}

async function verifyCredentialCode(credential, code) {
  const secret = decryptSecret(credential)
  if (verifyTotp(secret, code)) return { valid: true, recovery: false }

  const normalizedRecovery = normalizeRecoveryCode(code)
  if (!normalizedRecovery) return { valid: false, recovery: false }
  const hash = recoveryHash(normalizedRecovery)
  const index = credential.recoveryCodeHashes.findIndex((candidate) => safeCodeEqual(candidate, hash))
  if (index < 0) return { valid: false, recovery: false }
  credential.recoveryCodeHashes.splice(index, 1)
  credential.lastRecoveryUsedAt = new Date()
  return { valid: true, recovery: true }
}

export async function verifyLoginChallenge({ token, code }) {
  const tokenHash = challengeHash(String(token || ''))
  const challenge = await TwoFactorChallenge.findOne({
    tokenHash,
    usedAt: null,
    expiresAt: { $gt: new Date() },
    attempts: { $lt: MAX_LOGIN_ATTEMPTS },
  })
  if (!challenge) throw requestError(401, 'Two-factor challenge is invalid or expired')

  const credential = await TwoFactorCredential.findOne({ user: challenge.user })
    .select('+encryptedSecret +iv +authTag recoveryCodeHashes lastUsedAt lastRecoveryUsedAt')
  if (!credential) throw requestError(401, 'Two-factor authentication is not available for this account')

  const result = await verifyCredentialCode(credential, code)
  if (!result.valid) {
    challenge.attempts += 1
    await challenge.save()
    throw requestError(401, challenge.attempts >= MAX_LOGIN_ATTEMPTS
      ? 'Too many invalid two-factor attempts. Sign in with your password again.'
      : 'Authenticator or recovery code is invalid')
  }

  const now = new Date()
  challenge.usedAt = now
  credential.lastUsedAt = now
  await Promise.all([challenge.save(), credential.save()])
  return {
    userId: challenge.user,
    deviceName: challenge.deviceName,
    usedRecoveryCode: result.recovery,
  }
}

export async function verifyCurrentTwoFactorCode({ userId, code }) {
  const credential = await TwoFactorCredential.findOne({ user: userId })
    .select('+encryptedSecret +iv +authTag recoveryCodeHashes lastUsedAt lastRecoveryUsedAt')
  if (!credential) throw requestError(409, 'Two-factor authentication is not enabled')
  const result = await verifyCredentialCode(credential, code)
  if (!result.valid) throw requestError(401, 'Authenticator or recovery code is invalid')
  credential.lastUsedAt = new Date()
  await credential.save()
  return result
}

export async function disableTwoFactor({ userId, code }) {
  await verifyCurrentTwoFactorCode({ userId, code })
  await Promise.all([
    TwoFactorCredential.deleteOne({ user: userId }),
    TwoFactorSetup.deleteMany({ user: userId }),
    TwoFactorChallenge.deleteMany({ user: userId }),
  ])
}

export async function regenerateRecoveryCodes({ userId, code }) {
  const credential = await TwoFactorCredential.findOne({ user: userId })
    .select('+encryptedSecret +iv +authTag recoveryCodeHashes lastUsedAt lastRecoveryUsedAt')
  if (!credential) throw requestError(409, 'Two-factor authentication is not enabled')
  const result = await verifyCredentialCode(credential, code)
  if (!result.valid) throw requestError(401, 'Authenticator or recovery code is invalid')
  const recoveryCodes = generateRecoveryCodes()
  credential.recoveryCodeHashes = recoveryCodes.map(recoveryHash)
  credential.lastUsedAt = new Date()
  await credential.save()
  return { recoveryCodes }
}

export const __twoFactorSelfTest = {
  base32Encode,
  base32Decode,
  verifyTotp,
}
