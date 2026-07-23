'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import * as local from '@/lib/local-db'
import { useActiveSession } from '@/lib/use-store'

/** "12m" or "1h 12m" since the session started. */
function elapsed(startedAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
  const m = Math.floor(seconds / 60)
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`
}

/** Pinned to the top of every screen while a session is in progress, so
 *  "you're still logging under Leg Day" stays visible no matter where you
 *  navigate to. Renders nothing otherwise -- same quiet-by-default contract
 *  as SyncBadge, and mounted in the root layout for the same reason. */
export function ActiveSessionBar() {
  const session = useActiveSession()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!session) return
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [session])

  if (!session) return null

  return (
    <div className="active-session-bar">
      <Link href={`/sessions/${session.id}`} className="grow">
        <strong>{session.name ?? 'Workout in progress'}</strong>
        <span> · {elapsed(session.started_at, now)}</span>
      </Link>
      <button
        type="button"
        className="btn"
        onClick={() => {
          const finishedAt = new Date().toISOString()
          void local.put('workout_sessions', { ...session, ended_at: finishedAt, updated_at: finishedAt })
        }}
      >
        Finish
      </button>
    </div>
  )
}
