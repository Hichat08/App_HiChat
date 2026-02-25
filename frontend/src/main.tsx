import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    // Some browser extensions inject onboarding scripts that reject with undefined.
    if (typeof event.reason === 'undefined') {
      event.preventDefault()
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
