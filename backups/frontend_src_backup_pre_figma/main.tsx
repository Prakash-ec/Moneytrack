import React from 'react'
import ReactDOM from 'react-dom/client'

import App from '@/App'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* Offline shell is optional; the app still works without it. */
      })
    })
  } else {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        if (registration.active?.scriptURL.endsWith('/sw.js')) void registration.unregister()
      })
    })
  }
}
