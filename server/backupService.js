import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { finished } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { createGzip, createGunzip } from 'node:zlib'
import mongoose from 'mongoose'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const stateFilename = 'backup-state.json'
const backupNamePattern = /^phoneflow-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json\.gz$/

let activeBackupPromise = null
let schedulerTimer = null
let schedulerTickRunning = false

export class BackupInProgressError extends Error {
  constructor() {
    super('A backup is already running')
    this.name = 'BackupInProgressError'
    this.status = 409
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
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
    schedule,
    timezone: process.env.BACKUP_TIMEZONE || 'Asia/Phnom_Penh',
  }
}

function backupTimestamp(date = new Date()) {
  return date.toISOString().replaceAll(':', '-').replace('.', '-')
}

function statePath(config = backupConfig()) {
  return path.join(config.directory, stateFilename)
}

async function ensureBackupDirectory(config = backupConfig()) {
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
    stream.once('drain', resolve)
    stream.once('error', reject)
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
      const archivePath = path.join(config.directory, item.filename || '')
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
  const gzip = createGzip({ level: 9 })
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
      const cursor = collection.find({}, { readConcern: { level: 'majority' } })

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

export function runBackup(options = {}) {
  if (activeBackupPromise) throw new BackupInProgressError()
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
  if (schedulerTickRunning || isBackupRunning()) return
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
    running: isBackupRunning() || Boolean(state.running),
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
  const filepath = await resolveBackupArchive(filename)
  await Promise.all([
    fs.rm(filepath, { force: true }),
    fs.rm(`${filepath}.meta.json`, { force: true }),
  ])
}

export async function readBackupArchive(filepath) {
  const gunzip = createGunzip()
  const input = createReadStream(filepath)
  input.pipe(gunzip)
  const chunks = []
  for await (const chunk of gunzip) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function getBackupRuntimeConfig() {
  return backupConfig()
}
