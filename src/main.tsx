import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AppWithBackend from './app/AppWithBackend'
import './styles'
import './features/dashboard/dashboard-performance.css'
import './features/dashboard/dashboard-density.css'
import './features/dashboard/dashboard-chart-interactions.css'
import './features/dashboard/inventory-insights.css'
import './features/operations/operation-modals.css'
import './features/operations/pawn-guide.css'
import './features/customers/customer-workspace.css'
import './features/activity/activity-report.css'
import './features/loans/loan-workspace.css'
import './features/loans/loan-dashboard.css'
import './features/receipts/receipt-center.css'
import './features/documents/secure-documents.css'
import './features/security/security-workspace.css'
import './features/security/two-factor.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppWithBackend />
  </StrictMode>,
)
