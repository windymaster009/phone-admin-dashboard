import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AppWithBackend from './app/AppWithBackend'
import './styles/styles.css'
import './styles/backend.css'
import './styles/loading.css'
import './features/dashboard/dashboard-performance.css'
import './features/dashboard/inventory-insights.css'
import './features/operations/operation-modals.css'
import './features/customers/customer-workspace.css'
import './features/activity/activity-report.css'
import './features/loans/loan-workspace.css'
import './features/loans/loan-dashboard.css'
import './features/receipts/receipt-center.css'
import './features/documents/secure-documents.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppWithBackend />
  </StrictMode>,
)
