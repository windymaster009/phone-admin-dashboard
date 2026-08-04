import { lazy, Suspense, useEffect, useState } from 'react'

const OperationModalBridge = lazy(() => import('./OperationModalBridge'))
const CustomerWorkspaceBridge = lazy(() => import('./CustomerWorkspaceBridge'))
const ActivityReportBridge = lazy(() => import('./ActivityReportBridge'))
const LoanWorkspaceBridge = lazy(() => import('./LoanWorkspaceBridge'))
const LoanDashboardBridge = lazy(() => import('./LoanDashboardBridge'))
const LoanRouteCompatibility = lazy(() => import('./LoanRouteCompatibility'))

export default function DeferredBridges() {
  const [operationsReady, setOperationsReady] = useState(false)
  const [customersReady, setCustomersReady] = useState(false)
  const [activityReady, setActivityReady] = useState(false)
  const [loansReady, setLoansReady] = useState(false)

  useEffect(() => {
    let operationTimer = 0
    let customerTimer = 0
    let activityTimer = 0
    let loanTimer = 0

    const frame = window.requestAnimationFrame(() => {
      operationTimer = window.setTimeout(() => setOperationsReady(true), 0)
      customerTimer = window.setTimeout(
        () => setCustomersReady(true),
        window.location.pathname === '/customers' ? 0 : 450,
      )
      activityTimer = window.setTimeout(() => setActivityReady(true), 900)
      loanTimer = window.setTimeout(
        () => setLoansReady(true),
        window.location.pathname === '/loans' ? 0 : 300,
      )
    })

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(operationTimer)
      window.clearTimeout(customerTimer)
      window.clearTimeout(activityTimer)
      window.clearTimeout(loanTimer)
    }
  }, [])

  return (
    <>
      {operationsReady && (
        <Suspense fallback={null}>
          <OperationModalBridge />
        </Suspense>
      )}
      {customersReady && (
        <Suspense fallback={null}>
          <CustomerWorkspaceBridge />
        </Suspense>
      )}
      {activityReady && (
        <Suspense fallback={null}>
          <ActivityReportBridge />
        </Suspense>
      )}
      {loansReady && (
        <Suspense fallback={null}>
          <LoanWorkspaceBridge />
          <LoanDashboardBridge />
          <LoanRouteCompatibility />
        </Suspense>
      )}
    </>
  )
}
