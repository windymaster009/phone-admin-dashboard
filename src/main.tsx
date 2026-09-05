import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AppWithBackend from './app/AppWithBackend'
import ErrorBoundary from './components/ErrorBoundary'
import './styles'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary boundaryName="ApplicationRoot">
      <AppWithBackend />
    </ErrorBoundary>
  </StrictMode>,
)
