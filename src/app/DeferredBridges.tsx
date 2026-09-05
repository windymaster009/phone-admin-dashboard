import { lazy, Suspense, useEffect, useState } from 'react'
import ErrorBoundary from '../components/ErrorBoundary'

const DashboardPerformanceBridge = lazy(() => import('../features/dashboard/DashboardPerformanceBridge'))
const InventoryInsightsBridge = lazy(() => import('../features/dashboard/InventoryInsightsBridge'))
const OperationModalBridge = lazy(() => import('../features/operations/OperationModalBridge'))
const CustomerWorkspaceBridge = lazy(() => import('../features/customers/CustomerWorkspaceBridge'))
const ActivityReportBridge = lazy(() => import('../features/activity/ActivityReportBridge'))
const LoanWorkspaceBridge = lazy(() => import('../features/loans/LoanWorkspaceBridge'))
const LoanDashboardBridge = lazy(() => import('../features/loans/LoanDashboardBridge'))
const LoanRouteCompatibility = lazy(() => import('../features/loans/LoanRouteCompatibility'))
const ReceiptCenterBridge = lazy(() => import('../features/receipts/ReceiptCenterBridge'))
const SecureDocumentsBridge = lazy(() => import('../features/documents/SecureDocumentsBridge'))
const SecurityWorkspaceBridge = lazy(() => import('../features/security/SecurityWorkspaceBridge'))

export default function DeferredBridges() {
  const [dashboardReady, setDashboardReady] = useState(false)
  const [operationsReady, setOperationsReady] = useState(false)
  const [customersReady, setCustomersReady] = useState(false)
  const [activityReady, setActivityReady] = useState(false)
  const [loansReady, setLoansReady] = useState(false)
  const [receiptsReady, setReceiptsReady] = useState(false)
  const [documentsReady, setDocumentsReady] = useState(false)
  const [securityReady, setSecurityReady] = useState(false)

  useEffect(() => {
    let dashboardTimer = 0
    let operationTimer = 0
    let customerTimer = 0
    let activityTimer = 0
    let loanTimer = 0
    let receiptTimer = 0
    let documentTimer = 0
    let securityTimer = 0

    const frame = window.requestAnimationFrame(() => {
      const dashboardPath = ['/', '/admin', '/dashboard'].includes(window.location.pathname)
      dashboardTimer = window.setTimeout(() => setDashboardReady(true), dashboardPath ? 0 : 700)
      operationTimer = window.setTimeout(() => setOperationsReady(true), 0)
      customerTimer = window.setTimeout(
        () => setCustomersReady(true),
        window.location.pathname === '/customers' ? 0 : 450,
      )
      loanTimer = window.setTimeout(
        () => setLoansReady(true),
        window.location.pathname === '/loans' ? 0 : 300,
      )
      receiptTimer = window.setTimeout(
        () => setReceiptsReady(true),
        window.location.pathname === '/receipts' ? 0 : 650,
      )
      documentTimer = window.setTimeout(
        () => setDocumentsReady(true),
        window.location.pathname === '/secure-documents' ? 0 : 800,
      )
      securityTimer = window.setTimeout(
        () => setSecurityReady(true),
        window.location.pathname === '/security' ? 0 : 700,
      )
      activityTimer = window.setTimeout(() => setActivityReady(true), 900)
    })

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(dashboardTimer)
      window.clearTimeout(operationTimer)
      window.clearTimeout(customerTimer)
      window.clearTimeout(activityTimer)
      window.clearTimeout(loanTimer)
      window.clearTimeout(receiptTimer)
      window.clearTimeout(documentTimer)
      window.clearTimeout(securityTimer)
    }
  }, [])

  return (
    <>
      {dashboardReady && (
        <ErrorBoundary boundaryName="Deferred:DashboardBridges" compact>
          <Suspense fallback={null}>
            <DashboardPerformanceBridge />
            <InventoryInsightsBridge />
          </Suspense>
        </ErrorBoundary>
      )}
      {operationsReady && (
        <ErrorBoundary boundaryName="Deferred:OperationModalBridge" compact>
          <Suspense fallback={null}>
            <OperationModalBridge />
          </Suspense>
        </ErrorBoundary>
      )}
      {customersReady && (
        <ErrorBoundary boundaryName="Deferred:CustomerWorkspaceBridge" compact>
          <Suspense fallback={null}>
            <CustomerWorkspaceBridge />
          </Suspense>
        </ErrorBoundary>
      )}
      {activityReady && (
        <ErrorBoundary boundaryName="Deferred:ActivityReportBridge" compact>
          <Suspense fallback={null}>
            <ActivityReportBridge />
          </Suspense>
        </ErrorBoundary>
      )}
      {loansReady && (
        <ErrorBoundary boundaryName="Deferred:LoanBridges" compact>
          <Suspense fallback={null}>
            <LoanWorkspaceBridge />
            <LoanDashboardBridge />
            <LoanRouteCompatibility />
          </Suspense>
        </ErrorBoundary>
      )}
      {receiptsReady && (
        <ErrorBoundary boundaryName="Deferred:ReceiptCenterBridge" compact>
          <Suspense fallback={null}>
            <ReceiptCenterBridge />
          </Suspense>
        </ErrorBoundary>
      )}
      {documentsReady && (
        <ErrorBoundary boundaryName="Deferred:SecureDocumentsBridge" compact>
          <Suspense fallback={null}>
            <SecureDocumentsBridge />
          </Suspense>
        </ErrorBoundary>
      )}
      {securityReady && (
        <ErrorBoundary boundaryName="Deferred:SecurityWorkspaceBridge" compact>
          <Suspense fallback={null}>
            <SecurityWorkspaceBridge />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  )
}
