import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import backupRouter from './backupRoutes.js'
import { BackupInProgressError } from './backupService.js'
import { ActivityLog, User } from './models.js'
import { AuthSession } from './authSessionModels.js'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-backup-routes-12345'
mongoose.set('bufferCommands', false)

const testSessionId = 'backup-test-session-1'
const originalBackupDir = process.env.BACKUP_DIR
const originalUploadDir = process.env.UPLOAD_DIR
const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'phoneflow-backup-routes-test-'))
// Never use ambient application storage, including an explicitly configured path.
process.env.BACKUP_DIR = path.join(temporaryRoot, 'backups')
process.env.UPLOAD_DIR = path.join(temporaryRoot, 'uploads')

test.after(() => {
  if (originalBackupDir === undefined) delete process.env.BACKUP_DIR
  else process.env.BACKUP_DIR = originalBackupDir
  if (originalUploadDir === undefined) delete process.env.UPLOAD_DIR
  else process.env.UPLOAD_DIR = originalUploadDir
  // Exact unique directory owned by this test process, not an environment value.
  rmSync(temporaryRoot, { recursive: true, force: true })
})

const mockOwner = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00001'),
  name: 'Owner Alice',
  email: 'alice@shop.com',
  role: 'OWNER',
  active: true,
}

const mockManager = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00002'),
  name: 'Manager Bob',
  email: 'bob@shop.com',
  role: 'MANAGER',
  active: true,
}

const mockCashier = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00003'),
  name: 'Cashier Charlie',
  email: 'charlie@shop.com',
  role: 'CASHIER',
  active: true,
}

let currentUser = mockOwner

const origAuthSessionFindOne = AuthSession.findOne
const origAuthSessionUpdateOne = AuthSession.updateOne
const origUserFindById = User.findById

test.beforeEach(() => {
  currentUser = mockOwner
  AuthSession.findOne = async () => ({
    _id: new mongoose.Types.ObjectId(),
    sessionId: testSessionId,
    user: currentUser._id,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86400000),
  })
  AuthSession.updateOne = async () => ({ acknowledged: true })
  User.findById = () => ({
    select: () => Promise.resolve(currentUser),
  })
})

test.afterEach(() => {
  AuthSession.findOne = origAuthSessionFindOne
  AuthSession.updateOne = origAuthSessionUpdateOne
  User.findById = origUserFindById
})

// Stub ActivityLog save so DB operations don't block
ActivityLog.prototype.save = async function() { return this }

function makeToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), sid: testSessionId },
    process.env.JWT_SECRET,
    { expiresIn: 3600 },
  )
}

// Helper to simulate an Express request through backupRouter
function callRouter(router, {
  method = 'GET',
  url = '/',
  headers = {},
  body = {},
  query = {},
  user = null,
  streamContent = null,
} = {}) {
  return new Promise((resolve) => {
    if (user) currentUser = user

    const headerMap = Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
    )
    if (user && !headerMap.authorization && !headerMap.cookie) {
      headerMap.authorization = `Bearer ${makeToken(user)}`
    }

    const reqStream = streamContent !== null
      ? Readable.from(Array.isArray(streamContent) ? streamContent : [streamContent])
      : Readable.from([])

    const req = Object.assign(reqStream, {
      method: method.toUpperCase(),
      url,
      originalUrl: url,
      headers: headerMap,
      body,
      query,
      params: {},
      ip: '127.0.0.1',
      get(name) {
        return this.headers[name.toLowerCase()]
      },
      socket: { remoteAddress: '127.0.0.1' },
      hostname: 'localhost',
    })

    let statusCode = 200
    let responseBody = null
    const responseHeaders = {}
    const cookiesCleared = []

    const res = {
      status(code) {
        statusCode = code
        return this
      },
      setHeader(name, val) {
        responseHeaders[name.toLowerCase()] = val
        return this
      },
      getHeader(name) {
        return responseHeaders[name.toLowerCase()]
      },
      clearCookie(name, opts) {
        cookiesCleared.push({ name, opts })
        return this
      },
      json(data) {
        responseBody = data
        resolve({ status: statusCode, body: data, headers: responseHeaders, cookiesCleared })
      },
      send(data) {
        responseBody = data
        resolve({ status: statusCode, body: data, headers: responseHeaders, cookiesCleared })
      },
      end() {
        resolve({ status: statusCode, body: responseBody, headers: responseHeaders, cookiesCleared })
      },
      download(filepath, filename) {
        responseHeaders['content-disposition'] = `attachment; filename="${filename}"`
        resolve({ status: statusCode, downloadedFile: filepath, filename, headers: responseHeaders, cookiesCleared })
      },
    }

    router.handle(req, res, (err) => {
      if (err) {
        const code = err.status || 500
        resolve({ status: code, body: { message: err.message }, error: err })
      } else {
        resolve({ status: statusCode, body: responseBody, headers: responseHeaders, cookiesCleared })
      }
    })
  })
}

test('GET /status rejects unauthenticated requests with 401', async () => {
  const res = await callRouter(backupRouter, { method: 'GET', url: '/status' })
  assert.equal(res.status, 401)
  assert.match(res.body?.message || '', /Authentication required/i)
})

test('GET /status allows authenticated requests and calculates canRun by OWNER role', async () => {
  // CASHIER gets canRun: false
  const cashierRes = await callRouter(backupRouter, { method: 'GET', url: '/status', user: mockCashier })
  assert.equal(cashierRes.status, 200)
  assert.equal(cashierRes.body.canRun, false)

  // MANAGER gets canRun: false
  const managerRes = await callRouter(backupRouter, { method: 'GET', url: '/status', user: mockManager })
  assert.equal(managerRes.status, 200)
  assert.equal(managerRes.body.canRun, false)

  // OWNER gets canRun: true
  const ownerRes = await callRouter(backupRouter, { method: 'GET', url: '/status', user: mockOwner })
  assert.equal(ownerRes.status, 200)
  assert.equal(ownerRes.body.canRun, true)
})

test('OWNER-only endpoints reject MANAGER and CASHIER with 403', async () => {
  const protectedRoutes = [
    { method: 'GET', url: '/' },
    { method: 'POST', url: '/run' },
    { method: 'GET', url: '/phoneflow-test.json.gz/download' },
    { method: 'DELETE', url: '/phoneflow-test.json.gz' },
    { method: 'DELETE', url: '/' },
    { method: 'POST', url: '/restore/upload' },
    { method: 'POST', url: '/restore/upload/token-123' },
    { method: 'POST', url: '/restore/server/phoneflow-test.json.gz' },
  ]

  for (const route of protectedRoutes) {
    const resCashier = await callRouter(backupRouter, { ...route, user: mockCashier })
    assert.equal(resCashier.status, 403, `${route.method} ${route.url} should reject CASHIER with 403`)
    assert.match(resCashier.body?.message || '', /do not have permission/i)

    const resManager = await callRouter(backupRouter, { ...route, user: mockManager })
    assert.equal(resManager.status, 403, `${route.method} ${route.url} should reject MANAGER with 403`)
  }
})

test('POST /restore/server/:filename requires exact RESTORE confirmation', async () => {
  // Missing confirmation
  const resNoConf = await callRouter(backupRouter, {
    method: 'POST',
    url: '/restore/server/phoneflow-test.json.gz',
    user: mockOwner,
    body: {},
  })
  assert.equal(resNoConf.status, 400)
  assert.equal(resNoConf.body.message, 'Type RESTORE to confirm this recovery')

  // Incorrect confirmation
  const resWrongConf = await callRouter(backupRouter, {
    method: 'POST',
    url: '/restore/server/phoneflow-test.json.gz',
    user: mockOwner,
    body: { confirmation: 'yes' },
  })
  assert.equal(resWrongConf.status, 400)
  assert.equal(resWrongConf.body.message, 'Type RESTORE to confirm this recovery')
})

test('POST /restore/upload/:token requires exact RESTORE confirmation', async () => {
  const res = await callRouter(backupRouter, {
    method: 'POST',
    url: '/restore/upload/stage-token-abc',
    user: mockOwner,
    body: { confirmation: 'RESTORE_NOW' },
  })
  assert.equal(res.status, 400)
  assert.equal(res.body.message, 'Type RESTORE to confirm this recovery')
})

test('BackupInProgressError formats with 409 status code and descriptive message', () => {
  const err = new BackupInProgressError()
  assert.equal(err.name, 'BackupInProgressError')
  assert.equal(err.status, 409)
  assert.equal(err.expose, true)
  assert.equal(err.message, 'A backup is already running')
})

test('GET /:filename/download rejects invalid filename and traversal with 400, and non-existent valid names with 404', async () => {
  const invalidFilenames = [
    '..%2F..%2Fpackage.json',
    '../../package.json',
    'nonexistent.json.gz',
    'invalid-format.tar.gz',
  ]

  for (const filename of invalidFilenames) {
    const res = await callRouter(backupRouter, {
      method: 'GET',
      url: `/${encodeURIComponent(filename)}/download`,
      user: mockOwner,
    })
    assert.equal(res.status, 400, `Download with ${filename} should yield 400`)
    assert.match(res.body?.message || '', /Invalid backup filename/i)
  }

  // Validly formatted filename that does not exist yields 404
  const resNonExistent = await callRouter(backupRouter, {
    method: 'GET',
    url: '/phoneflow-2026-01-01T00-00-00-000Z.json.gz/download',
    user: mockOwner,
  })
  assert.equal(resNonExistent.status, 404)
  assert.equal(resNonExistent.body.message, 'Backup not found')
})

test('DELETE /:filename returns 404 when target backup does not exist', async () => {
  const res = await callRouter(backupRouter, {
    method: 'DELETE',
    url: '/phoneflow-1999-01-01T00-00-00-000Z.json.gz',
    user: mockOwner,
  })
  assert.equal(res.status, 404)
  assert.equal(res.body.message, 'Backup not found')
})

test('DELETE / (bulk) returns 404 when specified backups do not exist', async () => {
  const res = await callRouter(backupRouter, {
    method: 'DELETE',
    url: '/',
    user: mockOwner,
    body: { filenames: ['phoneflow-1999-01-01T00-00-00-000Z.json.gz'] },
  })
  assert.equal(res.status, 404)
  assert.equal(res.body.message, 'One or more backups were not found')
})

test('DELETE / (bulk) validates input: requires non-empty array under 100 valid filenames', async () => {
  // Empty filenames array
  const resEmpty = await callRouter(backupRouter, {
    method: 'DELETE',
    url: '/',
    user: mockOwner,
    body: { filenames: [] },
  })
  assert.equal(resEmpty.status, 400)
  assert.equal(resEmpty.body.message, 'Select at least one backup to delete')

  // Missing filenames property
  const resMissing = await callRouter(backupRouter, {
    method: 'DELETE',
    url: '/',
    user: mockOwner,
    body: {},
  })
  assert.equal(resMissing.status, 400)
  assert.equal(resMissing.body.message, 'Select at least one backup to delete')

  // Exceeds 100 limit
  const tooMany = Array.from({ length: 101 }, (_, i) => `phoneflow-2026-01-01T00-00-00-${String(i).padStart(3, '0')}Z.json.gz`)
  const resTooMany = await callRouter(backupRouter, {
    method: 'DELETE',
    url: '/',
    user: mockOwner,
    body: { filenames: tooMany },
  })
  assert.equal(resTooMany.status, 400)
  assert.equal(resTooMany.body.message, 'No more than 100 backups can be deleted at once')

  // Contains invalid pattern
  const resInvalid = await callRouter(backupRouter, {
    method: 'DELETE',
    url: '/',
    user: mockOwner,
    body: { filenames: ['phoneflow-2026-01-01T00-00-00-000Z.json.gz', 'invalid-backup.tar'] },
  })
  assert.equal(resInvalid.status, 400)
  assert.equal(resInvalid.body.message, 'Invalid backup filename')
})

test('DELETE /:filename rejects invalid filename patterns and traversal with 400', async () => {
  const invalidNames = ['../evil.json.gz', 'backup.tar', 'random-name.json.gz']
  for (const name of invalidNames) {
    const res = await callRouter(backupRouter, {
      method: 'DELETE',
      url: `/${encodeURIComponent(name)}`,
      user: mockOwner,
    })
    assert.equal(res.status, 400, `DELETE ${name} should return 400`)
    assert.equal(res.body.message, 'Invalid backup filename')
  }
})

test('POST /restore/server/:filename validates filename and returns 404 for missing backup', async () => {
  // Invalid filename pattern
  const resInvalid = await callRouter(backupRouter, {
    method: 'POST',
    url: '/restore/server/invalid-archive.json.gz',
    user: mockOwner,
    body: { confirmation: 'RESTORE' },
  })
  assert.equal(resInvalid.status, 400)
  assert.equal(resInvalid.body.message, 'Invalid backup filename')

  // Valid pattern but does not exist
  const resMissing = await callRouter(backupRouter, {
    method: 'POST',
    url: '/restore/server/phoneflow-2026-01-01T00-00-00-000Z.json.gz',
    user: mockOwner,
    body: { confirmation: 'RESTORE' },
  })
  assert.equal(resMissing.status, 404)
  assert.match(resMissing.body?.message || '', /Backup not found|ENOENT/i)
})

test('POST /restore/server preserves staging filesystem failures as server errors', async (t) => {
  // The source exists, but preparing the restore fails. This is not a missing archive.
  t.mock.method(fs, 'access', async () => undefined)
  t.mock.method(fs, 'copyFile', async () => {
    throw Object.assign(new Error('Restore staging directory unavailable'), { code: 'ENOENT' })
  })
  const result = await callRouter(backupRouter, {
    method: 'POST',
    url: '/restore/server/phoneflow-2026-01-01T00-00-00-000Z.json.gz',
    user: mockOwner,
    body: { confirmation: 'RESTORE' },
  })
  assert.equal(result.status, 500)
  assert.equal(result.body.message, 'Restore staging directory unavailable')
})

test('POST /restore/upload validates filename header, empty stream, and size limit', async () => {
  // Missing or non-.json.gz filename header
  const resBadHeader = await callRouter(backupRouter, {
    method: 'POST',
    url: '/restore/upload',
    user: mockOwner,
    headers: { 'x-backup-filename': 'backup.tar' },
    streamContent: Buffer.from('data'),
  })
  assert.equal(resBadHeader.status, 400)
  assert.equal(resBadHeader.body.message, 'Choose a PhoneFlow .json.gz backup file')

  // Empty stream
  const resEmptyStream = await callRouter(backupRouter, {
    method: 'POST',
    url: '/restore/upload',
    user: mockOwner,
    headers: { 'x-backup-filename': 'phoneflow-2026-01-01T00-00-00-000Z.json.gz' },
    streamContent: [],
  })
  assert.equal(resEmptyStream.status, 400)
  assert.equal(resEmptyStream.body.message, 'The selected backup file is empty')

  // Exceeds max bytes via content-length
  const resOversized = await callRouter(backupRouter, {
    method: 'POST',
    url: '/restore/upload',
    user: mockOwner,
    headers: {
      'x-backup-filename': 'phoneflow-2026-01-01T00-00-00-000Z.json.gz',
      'content-length': String(1024 * 1024 * 1024), // 1 GB > 512 MB default limit
    },
    streamContent: Buffer.from('x'),
  })
  assert.equal(resOversized.status, 413)
  assert.match(resOversized.body.message, /Backup uploads are limited to/i)
})

test('POST /restore/upload/:token returns 404 for expired or non-existent token', async () => {
  const res = await callRouter(backupRouter, {
    method: 'POST',
    url: '/restore/upload/non-existent-or-expired-token',
    user: mockOwner,
    body: { confirmation: 'RESTORE' },
  })
  assert.equal(res.status, 404)
  assert.equal(res.body.message, 'The uploaded backup has expired. Choose the file again.')
})
