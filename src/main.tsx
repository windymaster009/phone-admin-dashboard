import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AppWithBackend from './AppWithBackend'
import OperationModalBridge from './OperationModalBridge'
import CustomerWorkspaceBridge from './CustomerWorkspaceBridge'
import ActivityReportBridge from './ActivityReportBridge'
import BackupStatusBridge from './BackupStatusBridge'
import './styles.css'
import './backend.css'
import './operation-modals.css'
import './customer-workspace.css'
import './activity-report.css'
import './backup-status.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppWithBackend />
    <OperationModalBridge />
    <CustomerWorkspaceBridge />
    <ActivityReportBridge />
    <BackupStatusBridge />
  </StrictMode>,
)
