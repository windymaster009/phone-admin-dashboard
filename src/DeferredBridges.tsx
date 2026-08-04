import { lazy, Suspense, useEffect, useState } from 'react'

const OperationModalBridge = lazy(() => import('./OperationModalBridge'))
const CustomerWorkspaceBridge = lazy(() => import('./CustomerWorkspaceBridge'))
const ActivityReportBridge = lazy(() => import('./ActivityReportBridge'))

export default function DeferredBridges() {
  const [operationsReady, setOperationsReady] = useState(false)
  const [customersReady, setCustomersReady] = useState(false)
  const [activityReady, setActivityReady] = useState(false)

  useEffect(() => {
    let operationTimer = 0
    let customerTimer = 0
    let activityTimer = 0

    const frame = window.requestAnimationFrame(() => {
      operationTimer = window.setTimeout(() => setOperationsReady(true), 0)
      customerTimer = window.setTimeout(
        () => setCustomersReady(true),
        window.location.pathname === '/customers' ? 0 : 450,
      )
      activityTimer = window.setTimeout(() => setActivityReady(true), 900)
    })

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(operationTimer)
      window.clearTimeout(customerTimer)
      window.clearTimeout(activityTimer)
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
    </>
  )
}
