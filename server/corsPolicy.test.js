import assert from 'node:assert/strict'
import test from 'node:test'
import { corsOriginIsAllowed } from './corsPolicy.js'

test('allows requests without an Origin header', () => {
  assert.equal(corsOriginIsAllowed({ origin: '', requestOrigin: 'http://shop-pc:5000', nodeEnv: 'production' }), true)
})

test('allows the installed app to call its own API from localhost, a LAN IP, or a machine name', () => {
  for (const origin of ['http://localhost:5000', 'http://192.168.1.25:5000', 'http://shop-pc:5000']) {
    assert.equal(corsOriginIsAllowed({ origin, requestOrigin: origin, nodeEnv: 'production' }), true)
  }
})

test('allows explicitly configured cross-origin clients', () => {
  assert.equal(corsOriginIsAllowed({
    origin: 'https://phoneflow.example.com',
    requestOrigin: 'http://127.0.0.1:5000',
    clientOrigin: 'https://phoneflow.example.com, https://backup.example.com',
    nodeEnv: 'production',
  }), true)
})

test('rejects unconfigured cross-origin clients in production', () => {
  assert.equal(corsOriginIsAllowed({
    origin: 'https://attacker.example.com',
    requestOrigin: 'http://shop-pc:5000',
    clientOrigin: 'https://phoneflow.example.com',
    nodeEnv: 'production',
  }), false)
})

test('preserves localhost and private-LAN cross-origin access in development', () => {
  assert.equal(corsOriginIsAllowed({ origin: 'http://localhost:4173', requestOrigin: 'http://localhost:5000', nodeEnv: 'development' }), true)
  assert.equal(corsOriginIsAllowed({ origin: 'http://192.168.1.25:5173', requestOrigin: 'http://192.168.1.25:5000', nodeEnv: 'development' }), true)
})
