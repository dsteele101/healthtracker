'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import * as local from '@/lib/local-db'
import { fromDatetimeLocal, parseDuration, toDatetimeLocal } from '@/lib/format'
import { useExerciseTypes } from '@/lib/use-store'
import type { ExerciseEntry } from '@/lib/types'
import { SyncBadge } from '../../components/sync-badge'

const LAST_TYPE_KEY = 'tracker:last-exercise-type'

/** localStorage doesn't exist during prerender. */
function readRememberedType(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(LAST_TYPE_KEY)
}

export default function LogExercisePage() {
  const router = useRouter()
  const types = useExerciseTypes()

  /* This page is prerendered at build time, so a default timestamp computed
   * anywhere but the browser would be the *build* date — months stale by the
   * time it's used. Initialising lazily runs it during hydration on the client;
   * the prerendered markup is discarded, which is what suppressHydrationWarning
   * on the input acknowledges. */
  const [performedAt, setPerformedAt] = useState(() =>
    toDatetimeLocal(new Date().toISOString()),
  )
  const [remembered] = useState(readRememberedType)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sets, setSets] = useState('1')
  const [reps, setReps] = useState('')
  const [duration, setDuration] = useState('')
  const [weight, setWeight] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  /* Derived rather than synced into state via an effect: types arrive
   * asynchronously from IndexedDB, and an effect that back-fills a default
   * would render once with the wrong value first. Most sessions repeat the
   * previous exercise, so that one leads. */
  const fallbackId =
    remembered && types?.some((t) => t.id === remembered) ? remembered : types?.[0]?.id
  const typeId = selectedId ?? fallbackId ?? ''
  const selected = types?.find((t) => t.id === typeId)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!selected) return setError('Pick an exercise.')

    const setsValue = Number(sets)
    if (!Number.isInteger(setsValue) || setsValue < 1) {
      return setError('Sets must be a whole number, at least 1.')
    }

    let repsValue: number | null = null
    if (selected.tracks_reps && reps.trim()) {
      const parsed = Number(reps)
      if (!Number.isInteger(parsed) || parsed < 0) {
        return setError('Reps must be a whole number.')
      }
      repsValue = parsed
    }

    let durationValue: number | null = null
    if (selected.tracks_duration && duration.trim()) {
      const parsed = parseDuration(duration)
      if (parsed === null) return setError('Time should look like 90, 1:30, or 1:02:03.')
      durationValue = parsed
    }

    // Mirrors the server validator, which rejects an entry recording nothing.
    if (repsValue === null && durationValue === null && !notes.trim()) {
      return setError('Add reps, a time, or a note.')
    }

    let weightValue: number | null = null
    if (weight.trim()) {
      const parsed = Number(weight)
      if (!Number.isFinite(parsed) || parsed < 0) {
        return setError('Weight must be a positive number.')
      }
      weightValue = Math.round(parsed * 100) / 100
    }

    setSaving(true)
    const now = new Date().toISOString()
    const entry: ExerciseEntry = {
      id: crypto.randomUUID(),
      exercise_type_id: selected.id,
      sets: setsValue,
      reps: repsValue,
      duration_seconds: durationValue,
      weight: weightValue,
      notes: notes.trim() || null,
      performed_at: performedAt ? fromDatetimeLocal(performedAt) : now,
      session_id: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }

    // Writes to IndexedDB, which always succeeds. Reaching the server is the
    // sync layer's problem, and the entry is safe either way.
    await local.put('exercise_entries', entry)
    localStorage.setItem(LAST_TYPE_KEY, selected.id)
    router.push('/')
  }

  if (types !== undefined && types.length === 0) {
    return (
      <main className="page">
        <h1 className="title">Log exercise</h1>
        <div className="empty">
          No exercises defined yet.
          <div style={{ marginTop: 16 }}>
            <Link href="/types" className="btn btn-primary">
              Add your first exercise
            </Link>
          </div>
        </div>
        <Link href="/" className="btn btn-block">
          Cancel
        </Link>
      </main>
    )
  }

  return (
    <main className="page">
      <header className="spread">
        <h1 className="title">Log exercise</h1>
        <SyncBadge />
      </header>

      <form onSubmit={save} className="stack">
        <div className="field">
          <label className="label" htmlFor="type">
            Exercise
          </label>
          <select
            id="type"
            value={typeId}
            suppressHydrationWarning
            onChange={(e) => {
              setSelectedId(e.target.value)
              setError(null)
            }}
          >
            {types?.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="label" htmlFor="sets">
            Sets
          </label>
          <input
            id="sets"
            inputMode="numeric"
            value={sets}
            onChange={(e) => {
              setSets(e.target.value)
              setError(null)
            }}
            placeholder="1"
            autoComplete="off"
          />
        </div>

        {/* Only the fields this exercise actually measures. */}
        {selected?.tracks_reps && (
          <div className="field">
            <label className="label" htmlFor="reps">
              Reps
            </label>
            <input
              id="reps"
              /* inputMode gets the numeric keypad on the phone. Deliberately no
               * `pattern`: it would hand validation to the browser, which
               * blocks submit with a native tooltip instead of the inline error
               * used everywhere else in the app — and those tooltips are easy
               * to miss on a phone. */
              inputMode="numeric"
              value={reps}
              onChange={(e) => {
                setReps(e.target.value)
                setError(null)
              }}
              placeholder="12"
              autoComplete="off"
            />
          </div>
        )}

        {selected?.tracks_duration && (
          <div className="field">
            <label className="label" htmlFor="duration">
              Time
            </label>
            <input
              id="duration"
              value={duration}
              onChange={(e) => {
                setDuration(e.target.value)
                setError(null)
              }}
              placeholder="1:30"
              autoComplete="off"
            />
            <p className="hint">Seconds (90) or clock time (1:30).</p>
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="weight">
            Weight
          </label>
          <input
            id="weight"
            inputMode="decimal"
            value={weight}
            onChange={(e) => {
              setWeight(e.target.value)
              setError(null)
            }}
            placeholder="Optional"
            autoComplete="off"
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="when">
            When
          </label>
          <input
            id="when"
            type="datetime-local"
            value={performedAt}
            suppressHydrationWarning
            onChange={(e) => setPerformedAt(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="notes">
            Notes
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value)
              setError(null)
            }}
            rows={2}
            placeholder="Optional"
            style={{ paddingTop: 10, paddingBottom: 10, minHeight: 66 }}
          />
        </div>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <Link href="/" className="btn btn-block">
          Cancel
        </Link>
      </form>
    </main>
  )
}
