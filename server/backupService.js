import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Transform } from 'node:stream'
import { finished, pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { createGzip, createGunzip } from 'node:zlib'
import mongoose from 'mongoose'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const stateFilename = 'backup-state.json'
const backupNamePattern = /^phoneflow-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json\.gz$/

let activeBackupPromise = null
let activeRestorePromise = null
let schedulerTimer = null
let schedulerTickRunning = false
const stagedRestores = new Map()

export class BackupInProgressError extends Error {
  constructor() {
    super('A backup is already running')
    this.name = 'BackupInProgressError'
    this.status = 409
    this.expose = true
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function validTimezone(value) {
  const candidate = value || 'Asia/Phnom_Penh'
  try {
    new Intl.DateTimeFormat('en', { timeZone: candidate }).format(new Date())
    return candidate
  } catch {
    console.warn(`Invalid BACKUP_TIMEZONE ${candidate}; using Asia/Phnom_Penh`)
    return 'Asia/Phnom_Penh'
  }
}

function backupConfig() {
  const enabledValue = String(process.env.BACKUP_ENABLED ?? 'true').toLowerCase()
  const schedule = /^([01]\d|2[0-3]):[0-5]\d$/.test(process.env.BACKUP_SCHEDULE || '')
    ? process.env.BACKUP_SCHEDULE
    : '02:00'

  return {
    enabled: !['false', '0', 'no', 'off'].includes(enabledValue),
    directory: path.resolve(process.env.BACKUP_DIR || path.join(appRoot, 'backups')),
    uploadsDirectory: path.resolve(process.env.UPLOAD_DIR || path.join(appRoot, 'uploads')),
    retentionCount: positiveInteger(process.env.BACKUP_RETENTION_COUNT, 14),
    retryMinutes: positiveInteger(process.env.BACKUP_RETRY_MINUTES, 60),
    restoreMaxBytes: positiveInteger(process.env.BACKUP_RESTORE_MAX_BYTES, 512 * 1024 * 1024),
    restoreMaxUncompressedBytes: positiveInteger(process.env.BACKUP_RESTORE_MAX_UNCOMPRESSED_BYTES, 1024 * 1024 * 1024),
    schedule,
    timezone: validTimezone(process.env.BACKUP_TIMEZONE),
  }
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function assertPrivateBackupDirectory(config) {
  const publicDirectories = [config.uploadsDirectory, path.join(appRoot, 'dist')]
  if (publicDirectories.some((directory) => isInside(directory, config.directory))) {
    throw new Error('BACKUP_DIR must not be inside uploads/ or dist/ because backup archives contain sensitive data')
  }
}

function backupTimestamp(date = new Date()) {
  return date.toISOString().replaceAll(':', '-').replace('.', '-')
}

function statePath(config = backupConfig()) {
  return path.join(config.directory, stateFilename)
}

async function ensureBackupDirectory(config = backupConfig()) {
  assertPrivateBackupDirectory(config)
  await fs.mkdir(config.directory, { recursive: true })
}

async function writeJsonAtomic(filepath, value) {
  const temporaryPath = `${filepath}.${randomUUID()}.tmp`
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await fs.rename(temporaryPath, filepath)
}

async function readState(config = backupConfig()) {
  try {
    return JSON.parse(await fs.readFile(statePath(config), 'utf8'))
  } catch (error) {
    if (error?.code !== 'ENOENT') console.error('Unable to read backup state:', error.message)
    return {}
  }
}

async function updateState(patch, config = backupConfig()) {
  await ensureBackupDirectory(config)
  const current = await readState(config)
  await writeJsonAtomic(statePath(config), { ...current, ...patch, updatedAt: new Date().toISOString() })
}

function encodeMongoValue(value) {
  if (value === null || value === undefined) return value
  if (value instanceof Date) return { $phoneflowBson: 'Date', value: value.toISOString() }
  if (Buffer.isBuffer(value)) return { $phoneflowBson: 'Buffer', value: value.toString('base64') }
  if (Array.isArray(value)) return value.map(encodeMongoValue)

  if (typeof value === 'object') {
    const bsonType = value._bsontype
    if (bsonType === 'ObjectId') return { $phoneflowBson: 'ObjectId', value: value.toHexString() }
    if (bsonType === 'Decimal128') return { $phoneflowBson: 'Decimal128', value: value.toString() }
    if (bsonType === 'Long') return { $phoneflowBson: 'Long', value: value.toString() }
    if (bsonType === 'Int32') return { $phoneflowBson: 'Int32', value: Number(value.valueOf()) }
    if (bsonType === 'Double') return { $phoneflowBson: 'Double', value: Number(value.valueOf()) }
    if (bsonType === 'Binary') {
      return { $phoneflowBson: 'Buffer', value: Buffer.from(value.buffer).toString('base64') }
    }
    if (bsonType === 'BSONRegExp') {
      return { $phoneflowBson: 'RegExp', pattern: value.pattern, options: value.options }
    }

    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeMongoValue(item)]))
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { $phoneflowBson: 'NonFiniteNumber', value: String(value) }
  }

  return value
}

export function decodeMongoValue(value) {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map(decodeMongoValue)
  if (typeof value !== 'object') return value

  if (value.$phoneflowBson === 'Date') return new Date(value.value)
  if (value.$phoneflowBson === 'Buffer') return Buffer.from(value.value, 'base64')
  if (value.$phoneflowBson === 'ObjectId') return new mongoose.Types.ObjectId(value.value)
  if (value.$phoneflowBson === 'Decimal128') return mongoose.mongo.Decimal128.fromString(value.value)
  if (value.$phoneflowBson === 'Long') return mongoose.mongo.Long.fromString(value.value)
  if (value.$phoneflowBson === 'Int32') return new mongoose.mongo.Int32(value.value)
  if (value.$phoneflowBson === 'Double') return new mongoose.mongo.Double(value.value)
  if (value.$phoneflowBson === 'RegExp') return new mongoose.mongo.BSONRegExp(value.pattern, value.options)
  if (value.$phoneflowBson === 'NonFiniteNumber') return Number(value.value)

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeMongoValue(item)]))
}

async function writeChunk(stream, chunk) {
  if (stream.write(chunk)) return
  await new Promise((resolve, reject) => {
    const cleanup = () => {
      stream.off('drain', onDrain)
      stream.off('error', onError)
    }
    const onDrain = () => {
      cleanup()
      resolve()
    }
    const onError = (error) => {
      cleanup()
      reject(error)
    }
    stream.once('drain', onDrain)
    stream.once('error', onError)
  })
}

async function listUploadFiles(root) {
  const files = []

  async function walk(directory) {
    let entries
    try {
      entries = await fs.readdir(directory, { withFileTypes: true })
    } catch (error) {
      if (error?.code === 'ENOENT') return
      throw error
    }

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) await walk(absolutePath)
      if (entry.isFile()) files.push(absolutePath)
    }
  }

  await walk(root)
  return files.sort()
}

async function sha256File(filepath) {
  const hash = createHash('sha256')
  const stream = createReadStream(filepath)
  for await (const chunk of stream) hash.update(chunk)
  return hash.digest('hex')
}

async function listBackupMetadata(config = backupConfig()) {
  await ensureBackupDirectory(config)
  const entries = await fs.readdir(config.directory, { withFileTypes: true })
  const metadata = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.meta.json')) continue
    try {
      const item = JSON.parse(await fs.readFile(path.join(config.directory, entry.name), 'utf8'))
      if (!backupNamePattern.test(item.filename || '')) throw new Error('Invalid archive filename')
      const archivePath = path.join(config.directory, item.filename)
      await fs.access(archivePath)
      metadata.push(item)
    } catch (error) {
      console.error(`Skipping invalid backup metadata ${entry.name}:`, error.message)
    }
  }

  return metadata.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
}

async function applyRetention(config = backupConfig()) {
  const backups = await listBackupMetadata(config)
  const expired = backups.slice(config.retentionCount)

  for (const backup of expired) {
    const archivePath = path.join(config.directory, backup.filename)
    const metadataPath = path.join(config.directory, `${backup.filename}.meta.json`)
    await Promise.all([
      fs.rm(archivePath, { force: true }),
      fs.rm(metadataPath, { force: true }),
    ])
  }
}

async function clearInterruptedState(config = backupConfig()) {
  const entries = await fs.readdir(config.directory, { withFileTypes: true })
  await Promise.all(entries
    .filter((entry) => entry.isFile() && (entry.name.endsWith('.partial') || entry.name.startsWith('.restore-')))
    .map((entry) => fs.rm(path.join(config.directory, entry.name), { force: true })))

  const state = await readState(config)
  if (state.running) {
    await updateState({
      running: false,
      lastError: 'The previous backup was interrupted before completion',
      lastErrorAt: new Date().toISOString(),
    }, config)
  }
}

async function performBackup({ trigger = 'MANUAL', requestedBy = null } = {}) {
  const config = backupConfig()
  const db = mongoose.connection.db
  if (!db || mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB must be connected before creating a backup')
  }

  await ensureBackupDirectory(config)
  const startedAt = new Date()
  const filename = `phoneflow-${backupTimestamp(startedAt)}.json.gz`
  const finalPath = path.join(config.directory, filename)
  const temporaryPath = `${finalPath}.${randomUUID()}.partial`
  const gzip = createGzip({ level: 6 })
  const output = createWriteStream(temporaryPath, { mode: 0o600 })
  gzip.pipe(output)

  let collectionCount = 0
  let documentCount = 0
  let uploadCount = 0
  let uncompressedUploadBytes = 0

  await updateState({
    running: true,
    lastAttemptAt: startedAt.toISOString(),
    lastError: null,
  }, config)

  try {
    const collectionNames = (await db.listCollections({}, { nameOnly: true }).toArray())
      .map((item) => item.name)
      .filter((name) => !name.startsWith('system.'))
      .sort()

    await writeChunk(gzip, JSON.stringify({
      formatVersion: 1,
      application: 'PhoneFlow',
      createdAt: startedAt.toISOString(),
      database: db.databaseName,
    }).replace(/}$/, ',"collections":['))

    for (const [collectionIndex, name] of collectionNames.entries()) {
      if (collectionIndex > 0) await writeChunk(gzip, ',')
      const collection = db.collection(name)
      let indexes = []
      try {
        indexes = await collection.indexes()
      } catch (error) {
        console.error(`Unable to read indexes for ${name}:`, error.message)
      }

      await writeChunk(gzip, `{"name":${JSON.stringify(name)},"indexes":${JSON.stringify(encodeMongoValue(indexes))},"documents":[`)
      let firstDocument = true
      const cursor = collection.find({})

      for await (const document of cursor) {
        if (!firstDocument) await writeChunk(gzip, ',')
        await writeChunk(gzip, JSON.stringify(encodeMongoValue(document)))
        firstDocument = false
        documentCount += 1
      }

      await writeChunk(gzip, ']}')
      collectionCount += 1
    }

    await writeChunk(gzip, '],"uploads":[')
    const uploadFiles = await listUploadFiles(config.uploadsDirectory)

    for (const [uploadIndex, absolutePath] of uploadFiles.entries()) {
      if (uploadIndex > 0) await writeChunk(gzip, ',')
      const relativePath = path.relative(config.uploadsDirectory, absolutePath).split(path.sep).join('/')
      const stats = await fs.stat(absolutePath)
      const data = await fs.readFile(absolutePath)
      const fileHash = createHash('sha256').update(data).digest('hex')
      await writeChunk(gzip, JSON.stringify({
        path: relativePath,
        size: stats.size,
        sha256: fileHash,
        data: data.toString('base64'),
      }))
      uploadCount += 1
      uncompressedUploadBytes += stats.size
    }

    const completedAt = new Date()
    await writeChunk(gzip, `],"summary":${JSON.stringify({
      collectionCount,
      documentCount,
      uploadCount,
      uncompressedUploadBytes,
      completedAt: completedAt.toISOString(),
    })}}`)
    gzip.end()
    await finished(output)
    await fs.rename(temporaryPath, finalPath)

    const stats = await fs.stat(finalPath)
    const sha256 = await sha256File(finalPath)
    const metadata = {
      filename,
      createdAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      trigger,
      requestedBy,
      database: db.databaseName,
      collectionCount,
      documentCount,
      uploadCount,
      uncompressedUploadBytes,
      compressedBytes: stats.size,
      sha256,
      formatVersion: 1,
    }

    await writeJsonAtomic(`${finalPath}.meta.json`, metadata)
    await applyRetention(config)
    await updateState({
      running: false,
      lastSuccessAt: completedAt.toISOString(),
      lastSuccessfulFilename: filename,
      lastError: null,
      lastErrorAt: null,
    }, config)

    return metadata
  } catch (error) {
    gzip.destroy()
    output.destroy()
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
    await updateState({
      running: false,
      lastError: error.message || 'Backup failed',
      lastErrorAt: new Date().toISOString(),
    }, config).catch(() => undefined)
    throw error
  }
}

export function isBackupRunning() {
  return Boolean(activeBackupPromise)
}

export function isRestoreRunning() {
  return Boolean(activeRestorePromise)
}

export function runBackup(options = {}) {
  if (activeBackupPromise) throw new BackupInProgressError()
  if (activeRestorePromise && !options.allowDuringRestore) throw new RestoreInProgressError()
  activeBackupPromise = performBackup(options).finally(() => {
    activeBackupPromise = null
  })
  return activeBackupPromise
}

function zonedClock(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    dateKey: `${value.year}-${value.month}-${value.day}`,
    minutes: Number(value.hour) * 60 + Number(value.minute),
  }
}

async function schedulerTick() {
  if (schedulerTickRunning || isBackupRunning() || isRestoreRunning()) return
  schedulerTickRunning = true

  try {
    const config = backupConfig()
    if (!config.enabled) return

    const now = new Date()
    const clock = zonedClock(now, config.timezone)
    const [scheduleHour, scheduleMinute] = config.schedule.split(':').map(Number)
    if (clock.minutes < scheduleHour * 60 + scheduleMinute) return

    const backups = await listBackupMetadata(config)
    const latest = backups[0]
    if (latest && zonedClock(new Date(latest.createdAt), config.timezone).dateKey === clock.dateKey) return

    const state = await readState(config)
    const lastAttempt = state.lastAttemptAt ? new Date(state.lastAttemptAt) : null
    if (lastAttempt && now.getTime() - lastAttempt.getTime() < config.retryMinutes * 60_000) return

    await runBackup({ trigger: 'SCHEDULED', requestedBy: { type: 'SYSTEM' } })
    console.log(`Scheduled backup completed: ${clock.dateKey}`)
  } catch (error) {
    console.error('Scheduled backup failed:', error.message)
  } finally {
    schedulerTickRunning = false
  }
}

export async function startBackupScheduler() {
  const config = backupConfig()
  await ensureBackupDirectory(config)
  await clearInterruptedState(config)
  if (!config.enabled || schedulerTimer) return

  schedulerTimer = setInterval(() => {
    schedulerTick().catch((error) => console.error('Backup scheduler tick failed:', error.message))
  }, 60_000)
  schedulerTimer.unref?.()
  schedulerTick().catch((error) => console.error('Initial backup scheduler tick failed:', error.message))
  console.log(`Daily backups enabled at ${config.schedule} (${config.timezone}), retaining ${config.retentionCount}`)
}

export function stopBackupScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer)
  schedulerTimer = null
}

function publicMetadata(item) {
  if (!item) return null
  return {
    filename: item.filename,
    createdAt: item.createdAt,
    completedAt: item.completedAt,
    trigger: item.trigger,
    database: item.database,
    collectionCount: item.collectionCount,
    documentCount: item.documentCount,
    uploadCount: item.uploadCount,
    uncompressedUploadBytes: item.uncompressedUploadBytes,
    compressedBytes: item.compressedBytes,
    sha256: item.sha256,
    formatVersion: item.formatVersion,
  }
}

export async function getBackupStatus({ canRun = false } = {}) {
  const config = backupConfig()
  const [backups, state] = await Promise.all([listBackupMetadata(config), readState(config)])
  return {
    enabled: config.enabled,
    running: isBackupRunning(),
    restoring: isRestoreRunning(),
    schedule: config.schedule,
    timezone: config.timezone,
    retentionCount: config.retentionCount,
    count: backups.length,
    latest: publicMetadata(backups[0]),
    lastAttemptAt: state.lastAttemptAt || null,
    lastSuccessAt: state.lastSuccessAt || null,
    lastError: state.lastError || null,
    lastErrorAt: state.lastErrorAt || null,
    canRun,
  }
}

export async function getBackupList() {
  return (await listBackupMetadata()).map(publicMetadata)
}

export async function resolveBackupArchive(filename) {
  if (!backupNamePattern.test(filename)) throw Object.assign(new Error('Invalid backup filename'), { status: 400 })
  const config = backupConfig()
  const filepath = path.join(config.directory, filename)
  await fs.access(filepath)
  return filepath
}

export async function deleteBackup(filename) {
  await deleteBackups([filename])
}

export class RestoreInProgressError extends Error {
  constructor() {
    super('A backup restore is already running')
    this.name = 'RestoreInProgressError'
    this.status = 409
    this.expose = true
  }
}

export async function deleteBackups(filenames) {
  if (!Array.isArray(filenames) || filenames.length === 0) {
    throw Object.assign(new Error('Select at least one backup to delete'), { status: 400 })
  }
  if (filenames.length > 100) {
    throw Object.assign(new Error('No more than 100 backups can be deleted at once'), { status: 400 })
  }

  const uniqueFilenames = [...new Set(filenames)]
  if (uniqueFilenames.some((filename) => typeof filename !== 'string' || !backupNamePattern.test(filename))) {
    throw Object.assign(new Error('Invalid backup filename'), { status: 400 })
  }

  const config = backupConfig()
  const filepaths = await Promise.all(uniqueFilenames.map((filename) => resolveBackupArchive(filename)))
  await Promise.all(filepaths.flatMap((filepath) => [
    fs.rm(filepath, { force: true }),
    fs.rm(`${filepath}.meta.json`, { force: true }),
  ]))

  const remaining = await listBackupMetadata(config)
  await updateState({
    lastSuccessAt: remaining[0]?.completedAt || null,
    lastSuccessfulFilename: remaining[0]?.filename || null,
  }, config)

  return uniqueFilenames
}

export async function readBackupArchive(filepath, { maxBytes = Number.POSITIVE_INFINITY } = {}) {
  const gunzip = createGunzip()
  const input = createReadStream(filepath)
  input.pipe(gunzip)
  const chunks = []
  let totalBytes = 0
  for await (const chunk of gunzip) {
    totalBytes += chunk.length
    if (totalBytes > maxBytes) {
      input.destroy()
      gunzip.destroy()
      throw restoreRequestError(`Expanded backup data exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB restore limit`, 413)
    }
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function restoreRequestError(message, status = 400) {
  return Object.assign(new Error(message), { status, expose: true })
}

function safeRestoreUploadPath(root, relativePath) {
  const normalized = String(relativePath || '').replaceAll('\\', '/')
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw restoreRequestError(`Unsafe upload path in backup: ${relativePath}`)
  }

  const target = path.resolve(root, normalized)
  const relative = path.relative(root, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw restoreRequestError(`Unsafe upload path in backup: ${relativePath}`)
  }
  return target
}

function restorableIndex(index) {
  const { v, ns, ...rest } = index
  return rest
}

async function validatedRestoreArchive(filepath, displayFilename = path.basename(filepath)) {
  let backup
  try {
    const config = backupConfig()
    backup = await readBackupArchive(filepath, { maxBytes: config.restoreMaxUncompressedBytes })
  } catch (error) {
    if (error?.expose) throw error
    throw restoreRequestError('The selected file is not a readable PhoneFlow backup archive')
  }

  if (backup?.formatVersion !== 1 || backup?.application !== 'PhoneFlow') {
    throw restoreRequestError('The selected file is not a supported PhoneFlow backup')
  }
  const createdAt = new Date(backup.createdAt)
  if (Number.isNaN(createdAt.getTime())) throw restoreRequestError('The backup does not contain a valid creation date')
  if (!Array.isArray(backup.collections) || !Array.isArray(backup.uploads)) {
    throw restoreRequestError('The backup archive is incomplete')
  }

  const collectionNames = new Set()
  let documentCount = 0
  for (const collectionBackup of backup.collections) {
    const name = collectionBackup?.name
    if (typeof name !== 'string' || !name || name.startsWith('system.') || !/^[A-Za-z0-9_.-]+$/.test(name)) {
      throw restoreRequestError('The backup contains an invalid collection name')
    }
    if (collectionNames.has(name)) throw restoreRequestError(`The backup contains collection ${name} more than once`)
    if (!Array.isArray(collectionBackup.documents) || !Array.isArray(collectionBackup.indexes)) {
      throw restoreRequestError(`The backup collection ${name} is incomplete`)
    }
    collectionNames.add(name)
    documentCount += collectionBackup.documents.length
  }

  let uploadBytes = 0
  const uploadPaths = new Set()
  const validationRoot = path.resolve(backupConfig().uploadsDirectory, '.restore-validation')
  for (const upload of backup.uploads) {
    const relativePath = String(upload?.path || '').replaceAll('\\', '/')
    safeRestoreUploadPath(validationRoot, relativePath)
    if (uploadPaths.has(relativePath)) throw restoreRequestError(`The backup contains upload ${relativePath} more than once`)
    if (typeof upload.data !== 'string' || !/^[a-f0-9]{64}$/i.test(upload.sha256 || '')) {
      throw restoreRequestError(`The backup upload ${relativePath} is incomplete`)
    }
    const data = Buffer.from(upload.data, 'base64')
    const actualHash = createHash('sha256').update(data).digest('hex')
    if (actualHash !== upload.sha256) throw restoreRequestError(`Upload checksum mismatch: ${relativePath}`)
    if (Number.isFinite(upload.size) && upload.size !== data.length) {
      throw restoreRequestError(`Upload size mismatch: ${relativePath}`)
    }
    uploadPaths.add(relativePath)
    uploadBytes += data.length
  }

  const completedAt = new Date(backup.summary?.completedAt || backup.createdAt)
  const stats = await fs.stat(filepath)
  const sha256 = await sha256File(filepath)
  return {
    backup,
    preview: {
      filename: displayFilename,
      createdAt: createdAt.toISOString(),
      completedAt: Number.isNaN(completedAt.getTime()) ? createdAt.toISOString() : completedAt.toISOString(),
      database: backup.database || null,
      collectionCount: backup.collections.length,
      documentCount,
      uploadCount: backup.uploads.length,
      uncompressedUploadBytes: uploadBytes,
      compressedBytes: stats.size,
      sha256,
      formatVersion: backup.formatVersion,
    },
  }
}

export async function inspectBackupForRestore(filepath, displayFilename) {
  const { preview } = await validatedRestoreArchive(filepath, displayFilename)
  return preview
}

async function cleanupStagedRestore(token) {
  const staged = stagedRestores.get(token)
  if (!staged) return
  stagedRestores.delete(token)
  clearTimeout(staged.timer)
  await fs.rm(staged.filepath, { force: true }).catch(() => undefined)
}

export async function stageRestoreUpload(readable, { filename, userId }) {
  if (activeRestorePromise) throw new RestoreInProgressError()
  const cleanFilename = path.basename(String(filename || ''))
  if (!/\.json\.gz$/i.test(cleanFilename)) {
    throw restoreRequestError('Choose a PhoneFlow .json.gz backup file')
  }

  const config = backupConfig()
  await ensureBackupDirectory(config)
  const contentLength = Number(readable.headers?.['content-length'] || 0)
  if (contentLength > config.restoreMaxBytes) {
    throw restoreRequestError(`Backup uploads are limited to ${Math.round(config.restoreMaxBytes / 1024 / 1024)} MB`, 413)
  }

  const token = randomUUID()
  const filepath = path.join(config.directory, `.restore-${token}.json.gz`)
  let receivedBytes = 0
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      receivedBytes += chunk.length
      if (receivedBytes > config.restoreMaxBytes) {
        callback(restoreRequestError(`Backup uploads are limited to ${Math.round(config.restoreMaxBytes / 1024 / 1024)} MB`, 413))
      } else {
        callback(null, chunk)
      }
    },
  })

  try {
    await pipeline(readable, limiter, createWriteStream(filepath, { mode: 0o600 }))
    if (receivedBytes === 0) throw restoreRequestError('The selected backup file is empty')
    const { preview } = await validatedRestoreArchive(filepath, cleanFilename)
    const timer = setTimeout(() => cleanupStagedRestore(token), 15 * 60_000)
    timer.unref?.()
    stagedRestores.set(token, { filepath, filename: cleanFilename, userId: String(userId), preview, timer })
    return { token, ...preview, expiresInSeconds: 15 * 60 }
  } catch (error) {
    await fs.rm(filepath, { force: true }).catch(() => undefined)
    throw error
  }
}

async function stageServerRestore(filename) {
  const sourcePath = await resolveBackupArchive(filename)
  const config = backupConfig()
  const filepath = path.join(config.directory, `.restore-${randomUUID()}.json.gz`)
  await fs.copyFile(sourcePath, filepath)

  try {
    try {
      const metadata = JSON.parse(await fs.readFile(`${sourcePath}.meta.json`, 'utf8'))
      const actualHash = await sha256File(filepath)
      if (metadata.sha256 && metadata.sha256 !== actualHash) {
        throw restoreRequestError('Backup checksum does not match its metadata')
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    return filepath
  } catch (error) {
    await fs.rm(filepath, { force: true }).catch(() => undefined)
    throw error
  }
}

async function writeRestoredUploads(backup, targetRoot) {
  await fs.mkdir(targetRoot, { recursive: true })
  for (const upload of backup.uploads) {
    const data = Buffer.from(upload.data, 'base64')
    const target = safeRestoreUploadPath(targetRoot, upload.path)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, data, { mode: 0o600 })
  }
}

async function clearDirectoryContents(directory) {
  await fs.mkdir(directory, { recursive: true })
  const entries = await fs.readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    await fs.rm(path.join(directory, entry.name), {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    })
  }
}

async function copyDirectoryContents(source, destination) {
  await fs.mkdir(destination, { recursive: true })
  const entries = await fs.readdir(source, { withFileTypes: true })
  for (const entry of entries) {
    await fs.cp(path.join(source, entry.name), path.join(destination, entry.name), {
      recursive: true,
      force: true,
      errorOnExist: false,
    })
  }
}

async function prepareUploadsReplacement(stagedUploads, uploadsDirectory) {
  const previousUploads = `${uploadsDirectory}.pre-restore-${randomUUID()}`
  let originalUploadsExisted = true
  try {
    try {
      await fs.access(uploadsDirectory)
    } catch (error) {
      if (error?.code === 'ENOENT') originalUploadsExisted = false
      else throw error
    }

    await fs.mkdir(previousUploads, { recursive: true })
    if (originalUploadsExisted) await copyDirectoryContents(uploadsDirectory, previousUploads)
    await clearDirectoryContents(uploadsDirectory)
    await copyDirectoryContents(stagedUploads, uploadsDirectory)
  } catch (error) {
    await clearDirectoryContents(uploadsDirectory).catch(() => undefined)
    if (originalUploadsExisted) await copyDirectoryContents(previousUploads, uploadsDirectory).catch(() => undefined)
    else await fs.rm(uploadsDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined)
    await fs.rm(previousUploads, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined)
    throw error
  }

  let settled = false
  return {
    async commit() {
      if (settled) return
      settled = true
      await Promise.allSettled([
        fs.rm(previousUploads, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
        fs.rm(stagedUploads, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
      ])
    },
    async rollback() {
      if (settled) return
      settled = true
      await clearDirectoryContents(uploadsDirectory)
      if (originalUploadsExisted) await copyDirectoryContents(previousUploads, uploadsDirectory)
      else await fs.rm(uploadsDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      await Promise.all([
        fs.rm(previousUploads, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
        fs.rm(stagedUploads, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
      ])
    },
  }
}

export async function replaceUploadsForRestore(stagedUploads, uploadsDirectory) {
  const replacement = await prepareUploadsReplacement(stagedUploads, uploadsDirectory)
  await replacement.commit()
}

async function performRestore(filepath, { source, requestedBy }) {
  const config = backupConfig()
  const { backup, preview } = await validatedRestoreArchive(filepath, source)
  const stagedUploads = `${config.uploadsDirectory}.restore-${randomUUID()}`

  await writeRestoredUploads(backup, stagedUploads)
  let safetyBackup
  let uploadsReplacement
  try {
    safetyBackup = await runBackup({
      trigger: 'MANUAL',
      requestedBy: { ...requestedBy, reason: 'PRE_RESTORE_SAFETY_BACKUP' },
      allowDuringRestore: true,
    })

    uploadsReplacement = await prepareUploadsReplacement(stagedUploads, config.uploadsDirectory)

    const db = mongoose.connection.db
    if (!db || mongoose.connection.readyState !== 1) throw new Error('MongoDB must be connected before restoring a backup')
    await db.dropDatabase()

    for (const collectionBackup of backup.collections) {
      const collection = db.collection(collectionBackup.name)
      const documents = collectionBackup.documents.map(decodeMongoValue)
      if (documents.length > 0) await collection.insertMany(documents, { ordered: true })

      const indexes = decodeMongoValue(collectionBackup.indexes)
        .filter((index) => index?.name !== '_id_' && index?.key)
        .map(restorableIndex)
      if (indexes.length > 0) await collection.createIndexes(indexes)
    }

    for (const collectionName of ['authsessions', 'androidpairings', 'twofactorsetups', 'twofactorchallenges']) {
      const exists = await db.listCollections({ name: collectionName }, { nameOnly: true }).hasNext()
      if (exists) await db.collection(collectionName).deleteMany({})
    }

    await uploadsReplacement.commit()
    await updateState({
      running: false,
      lastRestoreAt: new Date().toISOString(),
      lastRestoredBackupAt: preview.createdAt,
      lastRestoredFilename: source,
    }, config).catch((error) => console.error('Unable to update backup restore state:', error.message))

    return { restored: preview, safetyBackup: publicMetadata(safetyBackup), sessionsRevoked: true }
  } catch (error) {
    await uploadsReplacement?.rollback().catch((rollbackError) => {
      console.error('Unable to roll back uploads after restore failure:', rollbackError.message)
    })
    await fs.rm(stagedUploads, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

function beginRestore(task) {
  if (activeBackupPromise) throw new BackupInProgressError()
  if (activeRestorePromise) throw new RestoreInProgressError()
  const restorePromise = Promise.resolve().then(task).finally(() => {
    if (activeRestorePromise === restorePromise) activeRestorePromise = null
  })
  activeRestorePromise = restorePromise
  return restorePromise
}

export function restoreServerBackup(filename, requestedBy) {
  return beginRestore(async () => {
    const filepath = await stageServerRestore(filename)
    try {
      return await performRestore(filepath, { source: filename, requestedBy })
    } finally {
      await fs.rm(filepath, { force: true }).catch(() => undefined)
    }
  })
}

export function restoreStagedBackup(token, { userId, requestedBy }) {
  const normalizedToken = String(token || '')
  const staged = stagedRestores.get(normalizedToken)
  if (!staged || staged.userId !== String(userId)) {
    throw restoreRequestError('The uploaded backup has expired. Choose the file again.', 404)
  }
  stagedRestores.delete(normalizedToken)
  clearTimeout(staged.timer)

  return beginRestore(async () => {
    try {
      return await performRestore(staged.filepath, { source: staged.filename, requestedBy })
    } finally {
      await fs.rm(staged.filepath, { force: true }).catch(() => undefined)
    }
  })
}

export function getBackupRuntimeConfig() {
  const config = backupConfig()
  assertPrivateBackupDirectory(config)
  return config
}
