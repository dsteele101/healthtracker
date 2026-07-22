'use client'

import { useSync } from '@/lib/use-store'

/** Shows whether local work has reached the server, and lets you retry.
 *
 *  Deliberately quiet when everything is synced: this sits on every screen and
 *  a persistent green banner would just become noise. It speaks up only when
 *  something is queued or wrong. */
export function SyncBadge() {
  const { outcome, queued, syncing, syncNow } = useSync()

  if (queued === 0 && (outcome === null || outcome.status === 'synced')) {
    return null
  }

  const { label, tone } = describe()

  return (
    <button
      type="button"
      onClick={syncNow}
      disabled={syncing}
      className={`pill ${tone}`}
      style={{ minHeight: 32, cursor: 'pointer' }}
      aria-live="polite"
    >
      <span className="dot" />
      {syncing ? 'Syncing…' : label}
    </button>
  )

  function describe(): { label: string; tone: string } {
    const suffix = queued === 1 ? '1 unsaved' : `${queued} unsaved`

    switch (outcome?.status) {
      case 'offline':
        return { label: `Offline · ${suffix}`, tone: '' }
      case 'unreachable':
        // Distinct from offline on purpose: the phone has a network, the
        // server does not answer. Different thing to go and check.
        return { label: `Server down · ${suffix}`, tone: '' }
      case 'auth-required':
        return { label: 'Sign in again', tone: 'pill-warn' }
      case 'error':
        return { label: `Sync error · ${suffix}`, tone: 'pill-warn' }
      default:
        return { label: suffix, tone: '' }
    }
  }
}
