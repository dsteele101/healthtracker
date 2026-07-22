'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import * as local from '@/lib/local-db'
import { formatDuration, formatWhen } from '@/lib/format'
import { useExerciseEntries, useExerciseTypes } from '@/lib/use-store'
import { DEFAULT_EXERCISE_ICON } from '@/lib/exercise-icons'
import { SyncBadge } from '../../components/sync-badge'

export default function ExerciseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const types = useExerciseTypes()
  const entries = useExerciseEntries()

  const loading = types === undefined || entries === undefined
  const type = types?.find((t) => t.id === id)
  const history = entries
    ?.filter((entry) => entry.exercise_type_id === id)
    .sort((a, b) => b.performed_at.localeCompare(a.performed_at))

  if (loading) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    )
  }

  if (!type) {
    return (
      <main className="page">
        <h1 className="title">Exercise not found</h1>
        <div className="empty">
          This exercise doesn&rsquo;t exist, or was removed. Past entries for it are still kept
          on the timeline.
        </div>
        <Link href="/" className="btn btn-block">
          Back
        </Link>
      </main>
    )
  }

  return (
    <main className="page">
      <header className="spread">
        <h1 className="title">{type.name}</h1>
        <SyncBadge />
      </header>

      <div className="card stack">
        <div className="row">
          <span className="type-icon" aria-hidden="true">
            {type.icon ?? DEFAULT_EXERCISE_ICON}
          </span>
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
          </div>
        </div>

        {type.info_url && (
          <a
            href={type.info_url}
            target="_blank"
            rel="noreferrer"
            className="btn btn-block"
            style={{ borderColor: 'var(--accent)' }}
          >
            More info ↗
          </a>
        )}

        <Link href="/log/exercise" className="btn btn-primary btn-block">
          Log {type.name}
        </Link>
      </div>

      <section className="stack">
        <h2 className="subtitle">History</h2>

        {history?.length === 0 && (
          <div className="empty">No entries logged for this exercise yet.</div>
        )}

        {history?.map((entry) => {
          const detail = [
            entry.sets != null && `${entry.sets} ${entry.sets === 1 ? 'set' : 'sets'}`,
            entry.reps !== null && `${entry.reps} reps`,
            entry.duration_seconds !== null && formatDuration(entry.duration_seconds),
            entry.weight !== null && `${entry.weight} lb`,
          ]
            .filter(Boolean)
            .join(' · ')

          return (
            <article key={entry.id} className="card spread">
              <div className="grow">
                {detail && <div className="muted mono">{detail}</div>}
                <div className="muted mono">{formatWhen(entry.performed_at)}</div>
                {entry.notes && <div className="muted">{entry.notes}</div>}
                {entry.rejected_reason && (
                  <div className="error">Rejected: {entry.rejected_reason}</div>
                )}
              </div>

              <div className="row">
                {entry.pending === 1 && <span className="pill">Unsaved</span>}
                <button
                  type="button"
                  className="btn btn-danger"
                  aria-label={`Delete entry from ${formatWhen(entry.performed_at)}`}
                  onClick={() => {
                    if (confirm('Delete this entry?')) {
                      void local.remove('exercise_entries', entry.id)
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </article>
          )
        })}
      </section>

      <Link href="/" className="btn btn-block">
        Back
      </Link>
    </main>
  )
}
