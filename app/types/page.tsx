'use client'

import Link from 'next/link'
import { useState } from 'react'
import * as local from '@/lib/local-db'
import { useExerciseTypes } from '@/lib/use-store'
import type { ExerciseType } from '@/lib/types'
import { DEFAULT_EXERCISE_ICON, EXERCISE_ICON_PRESETS } from '@/lib/exercise-icons'
import { SyncBadge } from '../components/sync-badge'

/** Preset grid plus a "no icon" option that clears back to the generic
 *  fallback. Shared between the create form and the per-row editor below. */
function IconPicker({
  value,
  onChange,
}: {
  value: string | null
  onChange: (icon: string | null) => void
}) {
  return (
    <div className="icon-grid">
      <button
        type="button"
        className={`icon-choice ${value === null ? 'icon-choice-active' : ''}`}
        aria-pressed={value === null}
        aria-label="No icon"
        onClick={() => onChange(null)}
      >
        <span className="muted">—</span>
      </button>
      {EXERCISE_ICON_PRESETS.map((icon) => (
        <button
          key={icon}
          type="button"
          className={`icon-choice ${value === icon ? 'icon-choice-active' : ''}`}
          aria-pressed={value === icon}
          aria-label={icon}
          onClick={() => onChange(icon)}
        >
          {icon}
        </button>
      ))}
    </div>
  )
}

/** Existing types predate this field and carry icon: null — editable inline
 *  rather than only at creation, so they aren't stuck showing the fallback.
 *  The picker renders below the whole row rather than inside it: nested in
 *  the row's flex layout, an open grid stretched the row's height instead of
 *  pushing content down the page. */
function TypeRow({ type }: { type: local.Local<ExerciseType> }) {
  const [open, setOpen] = useState(false)

  async function choose(icon: string | null) {
    await local.put('exercise_types', {
      ...type,
      icon,
      updated_at: new Date().toISOString(),
    })
    setOpen(false)
  }

  return (
    <div className="card stack">
      <div className="spread">
        <button
          type="button"
          className="btn type-icon-btn"
          aria-label={`Change icon for ${type.name}`}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="type-icon" aria-hidden="true">
            {type.icon ?? DEFAULT_EXERCISE_ICON}
          </span>
        </button>
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
      {open && <IconPicker value={type.icon} onChange={choose} />}
    </div>
  )
}

export default function ExerciseTypesPage() {
  const types = useExerciseTypes()

  const [name, setName] = useState('')
  const [tracksReps, setTracksReps] = useState(true)
  const [tracksDuration, setTracksDuration] = useState(false)
  const [icon, setIcon] = useState<string | null>(null)
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
      icon,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }

    await local.put('exercise_types', row)
    setName('')
    setTracksReps(true)
    setTracksDuration(false)
    setIcon(null)
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

        <div className="field">
          <span className="label">Icon</span>
          <IconPicker value={icon} onChange={setIcon} />
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
          <TypeRow key={type.id} type={type} />
        ))}
      </section>

      <Link href="/" className="btn btn-block">
        Done
      </Link>
    </main>
  )
}
