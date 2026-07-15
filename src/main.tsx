import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AppWithBackend from './AppWithBackend'
import OperationModalBridge from './OperationModalBridge'
import CustomerWorkspaceBridge from './CustomerWorkspaceBridge'
import './styles.css'
import './backend.css'
import './operation-modals.css'
import './customer-workspace.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppWithBackend />
    <OperationModalBridge />
    <CustomerWorkspaceBridge />
  </StrictMode>,
)
