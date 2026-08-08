'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import * as local from '@/lib/local-db'
import { useExerciseTypes } from '@/lib/use-store'
import type { ExerciseType } from '@/lib/types'
import { DEFAULT_EXERCISE_ICON, EXERCISE_ICON_PRESETS } from '@/lib/exercise-icons'
import { parseInfoUrl } from '@/lib/info-url'
import { ExerciseIcon } from '../components/exercise-icon'
import { HeaderActions } from '../components/header-actions'
import { IconPicker as SharedIconPicker } from '../components/icon-picker'
import { InfoUrlField } from '../components/info-url-field'

/** The two ways a type can carry an icon, as the forms below hold them. At most
 *  one is ever set — see 013_exercise_type_icon_svg.sql. */
interface IconChoice {
  icon: string | null
  icon_svg: string | null
}

/* Selects nothing in the preset grid, which is how the picker is told that
 * what's in use didn't come from the grid at all. Any string that isn't a
 * preset would do; this one says why in a stack trace. */
const NOT_A_PRESET = 'generated'

/** Preset grid, a "no icon" option that clears back to the generic fallback,
 *  and a button that draws one from the exercise's name instead. Shared between
 *  the create form and the per-row editor below.
 *
 *  The two kinds are mutually exclusive, and this is where that is enforced:
 *  picking from the grid drops a drawing, drawing one clears the pick. */
function IconField({
  id,
  name,
  value,
  onChange,
}: {
  id: string
  /** What to draw. Empty until the exercise has been named, which is why the
   *  button explains itself rather than just sitting there disabled. */
  name: string
  value: IconChoice
  onChange: (choice: IconChoice) => void
}) {
  const [available, setAvailable] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* Ask up front whether generation is usable. With no API key configured the
   * button never appears, and the grid is the whole feature — the same way a
   * missing OCR credential degrades photo import to manual entry. */
  useEffect(() => {
    let cancelled = false
    fetch('/api/exercise-icon')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setAvailable(Boolean(data?.available))
      })
      .catch(() => {
        if (!cancelled) setAvailable(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const trimmedName = name.trim()

  async function generate() {
    setDrawing(true)
    setError(null)
    try {
      onChange({ icon: null, icon_svg: await requestIcon(trimmedName) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not draw an icon.')
    } finally {
      setDrawing(false)
    }
  }

  return (
    <div className="field">
      <span className="label" id={`${id}-label`}>
        Icon
      </span>

      <SharedIconPicker
        presets={EXERCISE_ICON_PRESETS}
        value={value.icon_svg ? NOT_A_PRESET : value.icon}
        onChange={(icon) => {
          setError(null)
          onChange({ icon, icon_svg: null })
        }}
        renderIcon={(icon) => <ExerciseIcon icon={icon} />}
      />

      {available && (
        <div className="icon-generate">
          {value.icon_svg && (
            <span className="type-icon" aria-label="Generated icon">
              <ExerciseIcon icon={DEFAULT_EXERCISE_ICON} iconSvg={value.icon_svg} />
            </span>
          )}
          <button
            type="button"
            className="btn"
            disabled={drawing || trimmedName === ''}
            onClick={generate}
          >
            {drawing ? 'Drawing…' : value.icon_svg ? 'Draw another' : 'Generate icon'}
          </button>
          <span className="hint grow">
            {trimmedName === ''
              ? 'Name the exercise to draw one.'
              : `Draws an icon for "${trimmedName}".`}
          </span>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  )
}

/** Asks the server to draw one. What comes back has already been through the
 *  sanitizer (see lib/icon-svg.ts), so it goes straight into the row. */
async function requestIcon(name: string): Promise<string> {
  const response = await fetch('/api/exercise-icon', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
    redirect: 'manual',
  })

  /* An expired Cloudflare Access session answers with a redirect to its login
   * origin, which arrives here as an opaqueredirect (status 0). The useful
   * message is "sign in again", not "could not draw an icon". */
  if (
    response.type === 'opaqueredirect' ||
    response.redirected ||
    (response.status >= 300 && response.status < 400)
  ) {
    throw new Error('Session expired. Reload the page and sign in again.')
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error ?? `Could not draw an icon (${response.status}).`)
  }
  return payload.svg as string
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
  const [icon, setIcon] = useState<IconChoice>({
    icon: type.icon,
    icon_svg: type.icon_svg,
  })
  const [infoUrl, setInfoUrl] = useState(type.info_url ?? '')
  const [error, setError] = useState<string | null>(null)

  function startEditing() {
    setName(type.name)
    setTracksReps(type.tracks_reps)
    setTracksDuration(type.tracks_duration)
    setTracksWeight(type.tracks_weight)
    setIcon({ icon: type.icon, icon_svg: type.icon_svg })
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
      icon: icon.icon,
      icon_svg: icon.icon_svg,
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

        <IconField id={`icon-${type.id}`} name={name} value={icon} onChange={setIcon} />

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
            <ExerciseIcon icon={type.icon ?? DEFAULT_EXERCISE_ICON} iconSvg={type.icon_svg} />
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
  const [icon, setIcon] = useState<IconChoice>({ icon: null, icon_svg: null })
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
      icon: icon.icon,
      icon_svg: icon.icon_svg,
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
    setIcon({ icon: null, icon_svg: null })
    setInfoUrl('')
    setError(null)
  }

  return (
    <main className="page">
      <header className="spread">
        <h1 className="title">Exercises</h1>
        <HeaderActions />
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

        <IconField id="icon-new" name={name} value={icon} onChange={setIcon} />

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
