import { Router } from 'express'
import { allowRoles, clearSessionCookie, requireAuth, writeActivity } from './auth.js'
import {
  BackupInProgressError,
  deleteBackup,
  deleteBackups,
  getBackupList,
  getBackupStatus,
  resolveBackupArchive,
  restoreServerBackup,
  restoreStagedBackup,
  runBackup,
  stageRestoreUpload,
} from './backupService.js'

const router = Router()
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

router.get('/status', requireAuth, asyncRoute(async (req, res) => {
  res.json(await getBackupStatus({ canRun: req.user.role === 'OWNER' }))
}))

router.get('/', requireAuth, allowRoles('OWNER'), asyncRoute(async (_req, res) => {
  res.json({ backups: await getBackupList() })
}))

function requireRestoreConfirmation(req, res) {
  if (req.body?.confirmation !== 'RESTORE') {
    res.status(400).json({ message: 'Type RESTORE to confirm this recovery' })
    return false
  }
  return true
}

function restoreRequester(req) {
  return {
    type: 'USER',
    id: req.user._id.toString(),
    name: req.user.name,
  }
}

router.post('/restore/upload', requireAuth, allowRoles('OWNER'), asyncRoute(async (req, res) => {
  const staged = await stageRestoreUpload(req, {
    filename: req.get('x-backup-filename'),
    userId: req.user._id,
  })
  res.setHeader('Cache-Control', 'no-store')
  res.status(201).json({ backup: staged })
}))

router.post('/restore/upload/:token', requireAuth, allowRoles('OWNER'), asyncRoute(async (req, res) => {
  if (!requireRestoreConfirmation(req, res)) return
  const result = await restoreStagedBackup(req.params.token, {
    userId: req.user._id,
    requestedBy: restoreRequester(req),
  })
  await writeActivity(req, {
    action: 'UPDATE',
    entity: 'BACKUP',
    details: { restoredFrom: result.restored.filename, backupDate: result.restored.createdAt, source: 'UPLOAD' },
  })
  clearSessionCookie(res)
  res.json(result)
}))

router.post('/restore/server/:filename', requireAuth, allowRoles('OWNER'), asyncRoute(async (req, res) => {
  if (!requireRestoreConfirmation(req, res)) return
  const result = await restoreServerBackup(req.params.filename, restoreRequester(req))
  await writeActivity(req, {
    action: 'UPDATE',
    entity: 'BACKUP',
    details: { restoredFrom: result.restored.filename, backupDate: result.restored.createdAt, source: 'SERVER' },
  })
  clearSessionCookie(res)
  res.json(result)
}))

router.delete('/', requireAuth, allowRoles('OWNER'), asyncRoute(async (req, res) => {
  let deleted
  try {
    deleted = await deleteBackups(req.body?.filenames)
  } catch (error) {
    if (error?.code === 'ENOENT') return res.status(404).json({ message: 'One or more backups were not found' })
    throw error
  }

  await writeActivity(req, {
    action: 'DELETE',
    entity: 'BACKUP',
    details: { filenames: deleted, count: deleted.length },
  })
  res.json({ deleted })
}))

router.post('/run', requireAuth, allowRoles('OWNER'), asyncRoute(async (req, res) => {
  try {
    const backup = await runBackup({
      trigger: 'MANUAL',
      requestedBy: {
        type: 'USER',
        id: req.user._id.toString(),
        name: req.user.name,
      },
    })
    await writeActivity(req, {
      action: 'CREATE',
      entity: 'BACKUP',
      details: {
        filename: backup.filename,
        compressedBytes: backup.compressedBytes,
        documentCount: backup.documentCount,
        uploadCount: backup.uploadCount,
      },
    })
    res.status(201).json({ backup })
  } catch (error) {
    if (error instanceof BackupInProgressError) {
      return res.status(409).json({ message: error.message })
    }
    throw error
  }
}))

router.get('/:filename/download', requireAuth, allowRoles('OWNER'), asyncRoute(async (req, res) => {
  let filepath
  try {
    filepath = await resolveBackupArchive(req.params.filename)
  } catch (error) {
    if (error?.code === 'ENOENT') return res.status(404).json({ message: 'Backup not found' })
    throw error
  }

  await writeActivity(req, {
    action: 'DOWNLOAD',
    entity: 'BACKUP',
    details: { filename: req.params.filename },
  })
  res.download(filepath, req.params.filename)
}))

router.delete('/:filename', requireAuth, allowRoles('OWNER'), asyncRoute(async (req, res) => {
  try {
    await deleteBackup(req.params.filename)
  } catch (error) {
    if (error?.code === 'ENOENT') return res.status(404).json({ message: 'Backup not found' })
    throw error
  }

  await writeActivity(req, {
    action: 'DELETE',
    entity: 'BACKUP',
    details: { filename: req.params.filename },
  })
  res.status(204).end()
}))

export default router
