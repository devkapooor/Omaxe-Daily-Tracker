import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './app/App'
import { initializeTheme } from './shared/lib/theme'

const env = (import.meta as ImportMeta & { env: Record<string, boolean | string | undefined> }).env

initializeTheme()

if ('serviceWorker' in navigator && env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
