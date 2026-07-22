'use client'

import Link from 'next/link'
import { useState } from 'react'
import * as local from '@/lib/local-db'
import { useExerciseTypes } from '@/lib/use-store'
import type { ExerciseType } from '@/lib/types'
import { DEFAULT_EXERCISE_ICON, EXERCISE_ICON_PRESETS } from '@/lib/exercise-icons'
import { parseInfoUrl } from '@/lib/info-url'
import { SyncBadge } from '../components/sync-badge'
import { InfoUrlField } from '../components/info-url-field'

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

/** Edits everything about an existing type in place: name, which fields the
 *  log form asks for, and the icon. Existing types predate icon/tracks_weight
 *  and carry them as null/false, so this has to be reachable after creation,
 *  not just at add-time. */
function TypeRow({ type }: { type: local.Local<ExerciseType> }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(type.name)
  const [tracksReps, setTracksReps] = useState(type.tracks_reps)
  const [tracksDuration, setTracksDuration] = useState(type.tracks_duration)
  const [tracksWeight, setTracksWeight] = useState(type.tracks_weight)
  const [icon, setIcon] = useState(type.icon)
  const [infoUrl, setInfoUrl] = useState(type.info_url ?? '')
  const [error, setError] = useState<string | null>(null)

  function startEditing() {
    setName(type.name)
    setTracksReps(type.tracks_reps)
    setTracksDuration(type.tracks_duration)
    setTracksWeight(type.tracks_weight)
    setIcon(type.icon)
    setInfoUrl(type.info_url ?? '')
    setError(null)
    setEditing(true)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return setError('Give it a name.')
    if (!tracksReps && !tracksDuration) {
      return setError('Track reps, time, or both. Weight can be added to either.')
    }
    const parsedInfoUrl = parseInfoUrl(infoUrl)
    if (!parsedInfoUrl.ok) return setError('More info link must be a valid URL.')

    await local.put('exercise_types', {
      ...type,
      name: trimmed,
      tracks_reps: tracksReps,
      tracks_duration: tracksDuration,
      tracks_weight: tracksWeight,
      icon,
      info_url: parsedInfoUrl.value,
      updated_at: new Date().toISOString(),
    })
    setEditing(false)
  }

  if (editing) {
    return (
      <form onSubmit={save} className="card stack">
        <div className="field">
          <label className="label" htmlFor={`name-${type.id}`}>
            Name
          </label>
          <input
            id={`name-${type.id}`}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            autoComplete="off"
          />
        </div>

        <MeasuredByFields
          tracksReps={tracksReps}
          tracksDuration={tracksDuration}
          tracksWeight={tracksWeight}
          onChange={(field, checked) => {
            setError(null)
            if (field === 'reps') setTracksReps(checked)
            if (field === 'duration') setTracksDuration(checked)
            if (field === 'weight') setTracksWeight(checked)
          }}
        />

        <div className="field">
          <span className="label">Icon</span>
          <IconPicker value={icon} onChange={setIcon} />
        </div>

        <InfoUrlField id={`info-url-${type.id}`} value={infoUrl} onChange={setInfoUrl} />

        {error && <p className="error">{error}</p>}

        <div className="spread">
          <button type="button" className="btn" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="card stack">
      <div className="spread">
        <button
          type="button"
          className="btn type-icon-btn"
          aria-label={`Edit ${type.name}`}
          onClick={startEditing}
        >
          <span className="type-icon" aria-hidden="true">
            {type.icon ?? DEFAULT_EXERCISE_ICON}
          </span>
        </button>
        <div className="grow">
          <div className="subtitle">{type.name}</div>
          <div className="muted">
            {[
              type.tracks_reps && 'reps',
              type.tracks_duration && 'time',
              type.tracks_weight && 'weight',
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {type.rejected_reason && (
            <div className="error">Rejected: {type.rejected_reason}</div>
          )}
        </div>
        <button type="button" className="btn" onClick={startEditing}>
          Edit
        </button>
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
    </div>
  )
}

/** Shared between the create form and the per-row editor so the three
 *  checkboxes stay in sync. */
function MeasuredByFields({
  tracksReps,
  tracksDuration,
  tracksWeight,
  onChange,
}: {
  tracksReps: boolean
  tracksDuration: boolean
  tracksWeight: boolean
  onChange: (field: 'reps' | 'duration' | 'weight', checked: boolean) => void
}) {
  return (
    <div>
      <span className="label">Measured by</span>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={tracksReps}
          onChange={(e) => onChange('reps', e.target.checked)}
        />
        Reps
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={tracksDuration}
          onChange={(e) => onChange('duration', e.target.checked)}
        />
        Time
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={tracksWeight}
          onChange={(e) => onChange('weight', e.target.checked)}
        />
        Weight
      </label>
      <p className="hint">Decides which fields the log form shows.</p>
    </div>
  )
}

export default function ExerciseTypesPage() {
  const types = useExerciseTypes()

  const [name, setName] = useState('')
  const [tracksReps, setTracksReps] = useState(true)
  const [tracksDuration, setTracksDuration] = useState(false)
  const [tracksWeight, setTracksWeight] = useState(false)
  const [icon, setIcon] = useState<string | null>(null)
  const [infoUrl, setInfoUrl] = useState('')
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

    const parsedInfoUrl = parseInfoUrl(infoUrl)
    if (!parsedInfoUrl.ok) return setError('More info link must be a valid URL.')

    const now = new Date().toISOString()
    const row: ExerciseType = {
      id: crypto.randomUUID(),
      name: trimmed,
      tracks_reps: tracksReps,
      tracks_duration: tracksDuration,
      tracks_weight: tracksWeight,
      icon,
      info_url: parsedInfoUrl.value,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }

    await local.put('exercise_types', row)
    setName('')
    setTracksReps(true)
    setTracksDuration(false)
    setTracksWeight(false)
    setIcon(null)
    setInfoUrl('')
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

        <MeasuredByFields
          tracksReps={tracksReps}
          tracksDuration={tracksDuration}
          tracksWeight={tracksWeight}
          onChange={(field, checked) => {
            setError(null)
            if (field === 'reps') setTracksReps(checked)
            if (field === 'duration') setTracksDuration(checked)
            if (field === 'weight') setTracksWeight(checked)
          }}
        />

        <div className="field">
          <span className="label">Icon</span>
          <IconPicker value={icon} onChange={setIcon} />
        </div>

        <InfoUrlField id="info-url-new" value={infoUrl} onChange={setInfoUrl} />

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
