import assert from 'node:assert/strict'
import test from 'node:test'
import { __twoFactorSelfTest } from './twoFactorService.js'

test('base32 secret round trips', () => {
  const original = Buffer.from('Hello!\xde\xad\xbe\xef', 'binary')
  const encoded = __twoFactorSelfTest.base32Encode(original)
  assert.deepEqual(__twoFactorSelfTest.base32Decode(encoded), original)
})

test('TOTP accepts the expected six-digit code', () => {
  const secret = __twoFactorSelfTest.base32Decode('JBSWY3DPEHPK3PXP')
  assert.equal(__twoFactorSelfTest.verifyTotp(secret, '996554', 59_000), true)
  assert.equal(__twoFactorSelfTest.verifyTotp(secret, '000000', 59_000), false)
})

test('TOTP accepts one adjacent 30-second window for clock drift', () => {
  const secret = __twoFactorSelfTest.base32Decode('JBSWY3DPEHPK3PXP')
  assert.equal(__twoFactorSelfTest.verifyTotp(secret, '996554', 89_000), true)
  assert.equal(__twoFactorSelfTest.verifyTotp(secret, '996554', 119_000), false)
})
