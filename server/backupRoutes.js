import { Router } from 'express'
import { allowRoles, requireAuth, writeActivity } from './auth.js'
import {
  BackupInProgressError,
  deleteBackup,
  getBackupList,
  getBackupStatus,
  resolveBackupArchive,
  runBackup,
} from './backupService.js'

const router = Router()
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

router.get('/status', requireAuth, asyncRoute(async (req, res) => {
  res.json(await getBackupStatus({ canRun: req.user.role === 'OWNER' }))
}))

router.get('/', requireAuth, allowRoles('OWNER'), asyncRoute(async (_req, res) => {
  res.json({ backups: await getBackupList() })
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
