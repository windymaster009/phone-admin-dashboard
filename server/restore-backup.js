import 'dotenv/config'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import mongoose from 'mongoose'
import {
  decodeMongoValue,
  getBackupRuntimeConfig,
  readBackupArchive,
} from './backupService.js'

function printUsage() {
  console.log('Usage: npm run backup:restore -- <backup.json.gz> --confirm --drop')
  console.log('This command deletes the current database and uploads before restoring the archive.')
}

async function sha256File(filepath) {
  const hash = createHash('sha256')
  const stream = createReadStream(filepath)
  for await (const chunk of stream) hash.update(chunk)
  return hash.digest('hex')
}

function safeUploadPath(root, relativePath) {
  const normalized = String(relativePath || '').replaceAll('\\', '/')
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new Error(`Unsafe upload path in backup: ${relativePath}`)
  }

  const target = path.resolve(root, normalized)
  const relative = path.relative(root, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe upload path in backup: ${relativePath}`)
  }
  return target
}

function restorableIndex(index) {
  const { v, ns, ...rest } = index
  return rest
}

const args = process.argv.slice(2)
const archiveArgument = args.find((value) => !value.startsWith('--'))
if (!archiveArgument || !args.includes('--confirm') || !args.includes('--drop')) {
  printUsage()
  process.exit(1)
}

if (!process.env.MONGO_URI) {
  console.error('MONGO_URI is required in .env')
  process.exit(1)
}

const archivePath = path.resolve(archiveArgument)
const metadataPath = `${archivePath}.meta.json`
const config = getBackupRuntimeConfig()
let connected = false

try {
  await fs.access(archivePath)

  try {
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'))
    const actualHash = await sha256File(archivePath)
    if (metadata.sha256 && metadata.sha256 !== actualHash) {
      throw new Error('Backup checksum does not match its metadata file')
    }
    console.log(`Checksum verified: ${actualHash}`)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.warn('Backup metadata file was not found; checksum verification was skipped.')
    } else {
      throw error
    }
  }

  console.log('Reading compressed backup...')
  const backup = await readBackupArchive(archivePath)
  if (backup.formatVersion !== 1 || backup.application !== 'PhoneFlow') {
    throw new Error('This file is not a supported PhoneFlow backup')
  }

  console.log('Connecting to MongoDB...')
  await mongoose.connect(process.env.MONGO_URI)
  connected = true
  const db = mongoose.connection.db

  console.log(`Dropping current database: ${db.databaseName}`)
  await db.dropDatabase()

  for (const collectionBackup of backup.collections || []) {
    const collection = db.collection(collectionBackup.name)
    const documents = (collectionBackup.documents || []).map(decodeMongoValue)
    if (documents.length > 0) await collection.insertMany(documents, { ordered: true })

    const indexes = decodeMongoValue(collectionBackup.indexes || [])
      .filter((index) => index?.name !== '_id_' && index?.key)
      .map(restorableIndex)
    if (indexes.length > 0) await collection.createIndexes(indexes)
    console.log(`Restored ${collectionBackup.name}: ${documents.length} documents`)
  }

  await fs.rm(config.uploadsDirectory, { recursive: true, force: true })
  await fs.mkdir(config.uploadsDirectory, { recursive: true })

  for (const upload of backup.uploads || []) {
    const data = Buffer.from(upload.data || '', 'base64')
    const actualHash = createHash('sha256').update(data).digest('hex')
    if (upload.sha256 && actualHash !== upload.sha256) {
      throw new Error(`Upload checksum mismatch: ${upload.path}`)
    }
    const target = safeUploadPath(config.uploadsDirectory, upload.path)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, data, { mode: 0o600 })
  }

  console.log(`Restore complete: ${backup.summary?.documentCount || 0} documents and ${backup.summary?.uploadCount || 0} uploads`)
} catch (error) {
  console.error(`Restore failed: ${error.message}`)
  process.exitCode = 1
} finally {
  if (connected) await mongoose.disconnect()
}
