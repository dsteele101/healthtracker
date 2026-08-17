'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import * as local from '@/lib/local-db'
import { formatSetSummary, formatWhen } from '@/lib/format'
import {
  useDdrEntries,
  useExerciseEntries,
  useExerciseTypes,
  useWorkoutSessions,
  useWorkoutTemplates,
} from '@/lib/use-store'
import type { DdrEntry, ExerciseEntry, WorkoutTemplateItem } from '@/lib/types'
import { ScoreRing } from '../../components/score-ring'

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const sessions = useWorkoutSessions()
  const exercises = useExerciseEntries()
  const ddr = useDdrEntries()
  const types = useExerciseTypes()
  const templates = useWorkoutTemplates()

  const loading = sessions === undefined || exercises === undefined || ddr === undefined
  const session = sessions?.find((s) => s.id === id)
  const memberExercises = exercises?.filter((entry) => entry.session_id === id) ?? []
  const memberDdr = ddr?.filter((entry) => entry.session_id === id) ?? []

  // Not a synced concept of its own -- just the template's item list checked
  // off against what's actually been logged in this session so far.
  const template = session?.template_id
    ? templates?.find((t) => t.id === session.template_id)
    : undefined
  const checklist = template?.items.map((item) => ({
    item,
    type: types?.find((t) => t.id === item.exercise_type_id),
    done: memberExercises.some((entry) => entry.exercise_type_id === item.exercise_type_id),
  }))
  // The exercise the user is currently working through: the first template
  // item not yet logged, in routine order. Undefined once everything's done
  // (or for a session with no template, which has no ordering to track).
  const currentItem = checklist?.find((row) => !row.done)

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')

  function startEditing() {
    if (!session) return
    setName(session.name ?? '')
    setNotes(session.notes ?? '')
    setEditing(true)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!session) return
    await local.put('workout_sessions', {
      ...session,
      name: name.trim() || null,
      notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    })
    setEditing(false)
  }

  async function toggleFinished() {
    if (!session) return
    await local.put('workout_sessions', {
      ...session,
      ended_at: session.ended_at ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  async function removeExercise(entry: local.Local<ExerciseEntry>) {
    await local.put('exercise_entries', {
      ...entry,
      session_id: null,
      updated_at: new Date().toISOString(),
    })
  }

  async function removeDdr(entry: local.Local<DdrEntry>) {
    await local.put('ddr_entries', {
      ...entry,
      session_id: null,
      updated_at: new Date().toISOString(),
    })
  }

  async function addFromTemplateItem(item: WorkoutTemplateItem) {
    if (!session) return
    const now = new Date().toISOString()
    const entry: ExerciseEntry = {
      id: crypto.randomUUID(),
      exercise_type_id: item.exercise_type_id,
      sets: item.target_sets ?? 1,
      reps: item.target_reps ?? null,
      duration_seconds: item.target_duration_seconds ?? null,
      weight: item.target_weight ?? null,
      set_details: item.target_set_details ?? null,
      notes: item.notes ?? null,
      performed_at: now,
      session_id: session.id,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }
    await local.put('exercise_entries', entry)
  }

  async function toggleTemplateItem(item: WorkoutTemplateItem, done: boolean) {
    if (done) {
      const entry = memberExercises.find((e) => e.exercise_type_id === item.exercise_type_id)
      if (entry) await removeExercise(entry)
    } else {
      await addFromTemplateItem(item)
    }
  }

  async function addAllFromTemplate() {
    const missing = checklist?.filter((row) => !row.done) ?? []
    await Promise.all(missing.map((row) => addFromTemplateItem(row.item)))
  }

  // Ungroups every current member before removing the session itself, so
  // deleting a session never leaves an entry pointing at a row the UI can no
  // longer show — the timeline's dangling-session fallback is a safety net,
  // not how this is meant to work.
  async function deleteSession() {
    if (!session) return
    if (!confirm(`Delete "${session.name ?? 'this session'}"? Its entries are kept, just ungrouped.`)) {
      return
    }
    const now = new Date().toISOString()
    await Promise.all([
      ...memberExercises.map((entry) =>
        local.put('exercise_entries', { ...entry, session_id: null, updated_at: now }),
      ),
      ...memberDdr.map((entry) =>
        local.put('ddr_entries', { ...entry, session_id: null, updated_at: now }),
      ),
      local.remove('workout_sessions', session.id),
    ])
    router.push('/')
  }

  if (loading) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="page">
        <h1 className="title">Session not found</h1>
        <div className="empty">This session doesn&rsquo;t exist, or was removed.</div>
        <Link href="/" className="btn btn-block">
          Back
        </Link>
      </main>
    )
  }

  return (
    <main className="page">
      <h1 className="title">{session.name ?? 'Workout session'}</h1>

      {editing ? (
        <form onSubmit={save} className="card stack">
          <div className="field">
            <label className="label" htmlFor="session-name">
              Name
            </label>
            <input
              id="session-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Leg day"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="session-notes">
              Notes
            </label>
            <textarea
              id="session-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional"
              style={{ paddingTop: 10, paddingBottom: 10, minHeight: 66 }}
            />
          </div>
          <div className="spread">
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save
            </button>
          </div>
        </form>
      ) : (
        <div className="card stack">
          <div className="muted mono">
            {formatWhen(session.started_at)}
            {session.ended_at ? ` – ${formatWhen(session.ended_at)}` : ' · In progress'}
          </div>
          {session.notes && <div className="muted">{session.notes}</div>}
          <div className="row">
            <button type="button" className="btn grow" onClick={startEditing}>
              Edit
            </button>
            <button type="button" className="btn grow" onClick={() => void toggleFinished()}>
              {session.ended_at ? 'Reopen' : 'Finish'}
            </button>
          </div>
          <button
            type="button"
            className="btn btn-danger btn-block"
            onClick={() => void deleteSession()}
          >
            Delete session
          </button>
        </div>
      )}

      {checklist && checklist.length > 0 && (
        <section className="stack">
          <div className="spread">
            <h2 className="subtitle">From {template?.name}</h2>
            <button
              type="button"
              className="btn"
              disabled={checklist.every((row) => row.done)}
              onClick={() => void addAllFromTemplate()}
            >
              Add all
            </button>
          </div>
          <div className="card stack">
            {checklist.map((row, index) => {
              const isCurrent = row === currentItem
              return (
                <label key={index} className={`checkbox${isCurrent ? ' checkbox-current' : ''}`}>
                  <input
                    type="checkbox"
                    checked={row.done}
                    onChange={() => void toggleTemplateItem(row.item, row.done)}
                  />
                  <span className="grow">{row.type?.name ?? 'Unknown exercise'}</span>
                  {isCurrent && <span className="pill">Current</span>}
                </label>
              )
            })}
          </div>
        </section>
      )}

      <section className="stack">
        <h2 className="subtitle">Entries ({memberExercises.length + memberDdr.length})</h2>

        {memberExercises.length + memberDdr.length === 0 && (
          <div className="empty">No entries in this session.</div>
        )}

        {memberExercises.map((entry) => {
          const type = types?.find((t) => t.id === entry.exercise_type_id)
          const detail = formatSetSummary({
            sets: entry.sets,
            reps: entry.reps,
            durationSeconds: entry.duration_seconds,
            weight: entry.weight,
            setDetails: entry.set_details,
          })

          return (
            <article key={entry.id} className="card spread">
              <div className="grow">
                <div className="subtitle">{type?.name ?? 'Unknown exercise'}</div>
                {detail && <div className="muted mono">{detail}</div>}
                <div className="muted mono">{formatWhen(entry.performed_at)}</div>
              </div>
              <button type="button" className="btn" onClick={() => void removeExercise(entry)}>
                Remove
              </button>
            </article>
          )
        })}

        {memberDdr.map((entry) => (
          <article key={entry.id} className="card spread">
            <div className="grow">
              <div className="subtitle">{entry.song_title}</div>
              <div className="muted mono">
                {entry.percentage_score}% · {formatWhen(entry.performed_at)}
              </div>
            </div>
            <ScoreRing scorePct={entry.percentage_score} />
            <button type="button" className="btn" onClick={() => void removeDdr(entry)}>
              Remove
            </button>
          </article>
        ))}
      </section>
    </main>
  )
}
