'use client'

import Link from 'next/link'
import { useState } from 'react'
import * as local from '@/lib/local-db'
import { useExerciseTypes } from '@/lib/use-store'
import type { ExerciseType } from '@/lib/types'
import { SyncBadge } from '../components/sync-badge'

export default function ExerciseTypesPage() {
  const types = useExerciseTypes()

  const [name, setName] = useState('')
  const [tracksReps, setTracksReps] = useState(true)
  const [tracksDuration, setTracksDuration] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function addType(event: React.FormEvent) {
    event.preventDefault()

    const trimmed = name.trim()
    if (!trimmed) return setError('Give it a name.')

    // A type that measures nothing would render an entry form with no inputs.
    if (!tracksReps && !tracksDuration) {
      return setError('Track reps, time, or both.')
    }

    const duplicate = types?.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())
    if (duplicate) return setError(`"${trimmed}" already exists.`)

    const now = new Date().toISOString()
    const row: ExerciseType = {
      id: crypto.randomUUID(),
      name: trimmed,
      tracks_reps: tracksReps,
      tracks_duration: tracksDuration,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }

    await local.put('exercise_types', row)
    setName('')
    setTracksReps(true)
    setTracksDuration(false)
    setError(null)
  }

  return (
    <main className="page">
      <header className="spread">
        <h1 className="title">Exercises</h1>
        <SyncBadge />
      </header>

      <form onSubmit={addType} className="card stack">
        <div className="field">
          <label className="label" htmlFor="type-name">
            New exercise
          </label>
          <input
            id="type-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            placeholder="Pull-up, Plank, Squat…"
            autoComplete="off"
          />
        </div>

        <div>
          <span className="label">Measured by</span>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={tracksReps}
              onChange={(e) => {
                setTracksReps(e.target.checked)
                setError(null)
              }}
            />
            Reps
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={tracksDuration}
              onChange={(e) => {
                setTracksDuration(e.target.checked)
                setError(null)
              }}
            />
            Time
          </label>
          <p className="hint">Decides which fields the log form shows.</p>
        </div>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block">
          Add exercise
        </button>
      </form>

      <section className="stack">
        {types === undefined && <p className="muted">Loading…</p>}

        {types?.length === 0 && (
          <div className="empty">
            No exercises yet. Add one above to start logging.
          </div>
        )}

        {types?.map((type) => (
          <div key={type.id} className="card spread">
            <div className="grow">
              <div className="subtitle">{type.name}</div>
              <div className="muted">
                {[type.tracks_reps && 'reps', type.tracks_duration && 'time']
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              {type.rejected_reason && (
                <div className="error">Rejected: {type.rejected_reason}</div>
              )}
            </div>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                // Past entries keep their foreign key and stay readable; the
                // type just stops being offered for new ones.
                if (confirm(`Remove "${type.name}"? Past entries are kept.`)) {
                  void local.remove('exercise_types', type.id)
                }
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </section>

      <Link href="/" className="btn btn-block">
        Done
      </Link>
    </main>
  )
}
