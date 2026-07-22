'use client'

import { useEffect } from 'react'

/** Registers the service worker that makes the app launchable offline. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Registering during dev fights Turbopack's HMR — the SW serves a stale
    // shell and hot updates stop landing. Production only.
    if (process.env.NODE_ENV !== 'production') return

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.error('Service worker registration failed:', error)
      })
    }

    // Wait for load so the SW install doesn't compete with the first paint.
    if (document.readyState === 'complete') {
      register()
    } else {
      window.addEventListener('load', register, { once: true })
    }
  }, [])

  return null
}
