import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import { inspectBackupForRestore } from './backupService.js'

function archivePayload({ uploadHash } = {}) {
  const data = Buffer.from('phoneflow-image')
  return {
    formatVersion: 1,
    application: 'PhoneFlow',
    createdAt: '2026-08-14T04:09:42.458Z',
    database: 'phone_shop',
    collections: [{ name: 'users', indexes: [], documents: [{ name: 'Owner' }] }],
    uploads: [{
      path: 'inventory/example.jpg',
      size: data.length,
      sha256: uploadHash || createHash('sha256').update(data).digest('hex'),
      data: data.toString('base64'),
    }],
    summary: {
      collectionCount: 1,
      documentCount: 1,
      uploadCount: 1,
      completedAt: '2026-08-14T04:09:45.625Z',
    },
  }
}

async function withArchive(payload, callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'phoneflow-backup-test-'))
  const filepath = path.join(directory, 'phoneflow-test.json.gz')
  try {
    await fs.writeFile(filepath, gzipSync(JSON.stringify(payload)))
    return await callback(filepath)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

test('restore inspection reads the archive date and content counts', async () => {
  await withArchive(archivePayload(), async (filepath) => {
    const preview = await inspectBackupForRestore(filepath, 'downloaded-backup.json.gz')
    assert.equal(preview.filename, 'downloaded-backup.json.gz')
    assert.equal(preview.createdAt, '2026-08-14T04:09:42.458Z')
    assert.equal(preview.documentCount, 1)
    assert.equal(preview.uploadCount, 1)
    assert.equal(preview.collectionCount, 1)
  })
})

test('restore inspection rejects an upload checksum mismatch', async () => {
  await withArchive(archivePayload({ uploadHash: '0'.repeat(64) }), async (filepath) => {
    await assert.rejects(
      inspectBackupForRestore(filepath, 'damaged-backup.json.gz'),
      /Upload checksum mismatch/,
    )
  })
})
