'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import * as local from '@/lib/local-db'
import { useActiveSession, useWorkoutTemplates } from '@/lib/use-store'
import type { WorkoutSession } from '@/lib/types'
import { SyncBadge } from '../../components/sync-badge'

export default function StartWorkoutPage() {
  const router = useRouter()
  const activeSession = useActiveSession()
  const templates = useWorkoutTemplates()
  const [templateId, setTemplateId] = useState('')
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)

  function selectTemplate(id: string) {
    setTemplateId(id)
    // The name field defaults to the routine's name, but only while the user
    // hasn't typed one of their own -- picking a routine shouldn't clobber a
    // name they already set.
    if (!nameTouched) {
      const template = templates?.find((t) => t.id === id)
      setName(template?.name ?? '')
    }
  }

  async function start(event: React.FormEvent) {
    event.preventDefault()

    const now = new Date().toISOString()
    const session: WorkoutSession = {
      id: crypto.randomUUID(),
      name: name.trim() || null,
      template_id: templateId || null,
      started_at: now,
      ended_at: null,
      notes: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }

    await local.put('workout_sessions', session)
    router.push('/')
  }

  // Two live sessions on one device is more confusing than useful -- point
  // back at the one already running rather than letting a second start.
  if (activeSession) {
    return (
      <main className="page">
        <header className="spread">
          <h1 className="title">Workout in progress</h1>
          <SyncBadge />
        </header>
        <div className="empty">
          You already have &ldquo;{activeSession.name ?? 'a workout'}&rdquo; in progress.
        </div>
        <Link href={`/sessions/${activeSession.id}`} className="btn btn-primary btn-block">
          Go to session
        </Link>
        <Link href="/" className="btn btn-block">
          Back
        </Link>
      </main>
    )
  }

  return (
    <main className="page">
      <header className="spread">
        <h1 className="title">Start workout</h1>
        <SyncBadge />
      </header>

      <form onSubmit={start} className="stack">
        {templates && templates.length > 0 && (
          <div className="field">
            <label className="label" htmlFor="session-template">
              Routine
            </label>
            <select
              id="session-template"
              value={templateId}
              onChange={(e) => selectTemplate(e.target.value)}
            >
              <option value="">Blank workout</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="session-name">
            Name
          </label>
          <input
            id="session-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNameTouched(true)
            }}
            placeholder="Leg day (optional)"
            autoComplete="off"
          />
        </div>

        <button type="submit" className="btn btn-primary btn-block btn-lg">
          Start
        </button>
        <Link href="/" className="btn btn-block">
          Cancel
        </Link>
      </form>
    </main>
  )
}
