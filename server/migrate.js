import 'dotenv/config'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import mongoose from 'mongoose'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDirectory = path.join(__dirname, 'migrations')
const historyCollectionName = 'phoneflow_migrations'
const lockCollectionName = 'phoneflow_migration_locks'
const migrationFilePattern = /^\d{12}[-_][a-z0-9-]+\.js$/i
const lockId = 'migration-runner'
const lockTtlMs = 10 * 60 * 1000

function validateMongoUri() {
  const uri = process.env.MONGO_URI || ''
  if (!uri || (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://'))) {
    throw new Error('A valid MONGO_URI is required in .env')
  }
  if (uri.includes('<') || uri.includes('>') || uri.includes('YOUR_')) {
    throw new Error('MONGO_URI still contains placeholder values')
  }
  return uri
}

async function loadMigrations() {
  const filenames = (await readdir(migrationsDirectory))
    .filter((filename) => migrationFilePattern.test(filename))
    .sort((left, right) => left.localeCompare(right))

  const migrations = []
  const seenIds = new Set()
  for (const filename of filenames) {
    const filepath = path.join(migrationsDirectory, filename)
    const source = await readFile(filepath, 'utf8')
    // Git may check files out as CRLF on Windows even when the applied migration
    // used LF. Normalize line endings so unchanged migrations keep one checksum.
    const checksum = createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex')
    const migration = await import(`${pathToFileURL(filepath).href}?checksum=${checksum}`)

    if (!migration.id || typeof migration.up !== 'function' || typeof migration.down !== 'function') {
      throw new Error(`${filename} must export id, up(db), and down(db)`)
    }
    if (!filename.startsWith(String(migration.id))) {
      throw new Error(`${filename} must start with its exported migration id (${migration.id})`)
    }
    if (seenIds.has(migration.id)) throw new Error(`Duplicate migration id: ${migration.id}`)
    seenIds.add(migration.id)
    migrations.push({ ...migration, filename, checksum })
  }
  return migrations
}

async function acquireLock(db) {
  const locks = db.collection(lockCollectionName)
  await locks.deleteOne({ _id: lockId, acquiredAt: { $lt: new Date(Date.now() - lockTtlMs) } })
  const owner = randomUUID()
  try {
    await locks.insertOne({ _id: lockId, owner, acquiredAt: new Date() })
  } catch (error) {
    if (error?.code === 11000) throw new Error('Another migration process is already running')
    throw error
  }
  return async () => { await locks.deleteOne({ _id: lockId, owner }) }
}

async function migrationStatus(db, migrations) {
  const applied = await db.collection(historyCollectionName).find().sort({ _id: 1 }).toArray()
  const appliedById = new Map(applied.map((record) => [record._id, record]))
  const knownIds = new Set(migrations.map((migration) => migration.id))

  console.log('\nPhoneFlow migration status')
  console.log('--------------------------')
  for (const migration of migrations) {
    const record = appliedById.get(migration.id)
    const state = !record ? 'PENDING' : record.checksum === migration.checksum ? 'APPLIED' : 'MODIFIED'
    const date = record?.appliedAt ? ` (${new Date(record.appliedAt).toISOString()})` : ''
    console.log(`${state.padEnd(8)} ${migration.id}  ${migration.description || migration.filename}${date}`)
  }
  for (const record of applied.filter((item) => !knownIds.has(item._id))) {
    console.log(`MISSING  ${record._id}  Applied migration file is no longer present`)
  }
  console.log('')
  return { applied, appliedById }
}

async function migrateUp(db, migrations) {
  const release = await acquireLock(db)
  try {
    const history = db.collection(historyCollectionName)
    const applied = await history.find().toArray()
    const appliedById = new Map(applied.map((record) => [record._id, record]))
    const modified = migrations.find((migration) => appliedById.has(migration.id) && appliedById.get(migration.id).checksum !== migration.checksum)
    if (modified) throw new Error(`Applied migration ${modified.id} was modified. Restore it and create a new migration instead.`)

    const pending = migrations.filter((migration) => !appliedById.has(migration.id))
    if (pending.length === 0) {
      console.log('Database is already up to date.')
      return
    }

    for (const migration of pending) {
      process.stdout.write(`Applying ${migration.id} - ${migration.description || migration.filename}... `)
      await migration.up(db)
      await history.insertOne({
        _id: migration.id,
        filename: migration.filename,
        description: migration.description || '',
        checksum: migration.checksum,
        appliedAt: new Date(),
      })
      console.log('done')
    }
  } finally {
    await release()
  }
}

async function migrateDown(db, migrations) {
  const release = await acquireLock(db)
  try {
    const history = db.collection(historyCollectionName)
    const last = await history.find().sort({ appliedAt: -1 }).limit(1).next()
    if (!last) {
      console.log('There are no applied migrations to roll back.')
      return
    }
    const migration = migrations.find((item) => item.id === last._id)
    if (!migration) throw new Error(`Cannot roll back ${last._id}: its migration file is missing`)
    if (last.checksum !== migration.checksum) throw new Error(`Cannot roll back ${last._id}: its applied file was modified`)

    process.stdout.write(`Rolling back ${migration.id} - ${migration.description || migration.filename}... `)
    await migration.down(db)
    await history.deleteOne({ _id: migration.id })
    console.log('done')
  } finally {
    await release()
  }
}

async function main() {
  const command = process.argv[2] || 'up'
  if (!['up', 'down', 'status'].includes(command)) {
    throw new Error('Usage: node server/migrate.js [up|down|status]')
  }

  const migrations = await loadMigrations()
  await mongoose.connect(validateMongoUri(), { serverSelectionTimeoutMS: 10000 })
  const db = mongoose.connection.db

  if (command === 'status') await migrationStatus(db, migrations)
  if (command === 'up') await migrateUp(db, migrations)
  if (command === 'down') await migrateDown(db, migrations)
}

try {
  await main()
} catch (error) {
  console.error(`Migration failed: ${error.message}`)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
