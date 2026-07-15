import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AppWithBackend from './AppWithBackend'
import OperationModalBridge from './OperationModalBridge'
import './styles.css'
import './backend.css'
import './operation-modals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppWithBackend />
    <OperationModalBridge />
  </StrictMode>,
)
