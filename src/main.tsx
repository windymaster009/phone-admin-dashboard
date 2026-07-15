import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AppWithBackend from './AppWithBackend'
import './styles.css'
import './backend.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppWithBackend />
  </StrictMode>,
)
