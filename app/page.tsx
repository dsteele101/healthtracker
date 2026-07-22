'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import * as local from '@/lib/local-db'
import { formatDuration, formatWhen } from '@/lib/format'
import { useDdrEntries, useExerciseEntries, useExerciseTypes } from '@/lib/use-store'
import type { SyncTable } from '@/lib/types'
import { SyncBadge } from './components/sync-badge'

/** A row in the combined timeline, flattened so both entry kinds render the
 *  same way: what it was, the numbers, when. */
interface TimelineItem {
  id: string
  table: SyncTable
  heading: string
  detail: string
  note: string | null
  performedAt: string
  pending: boolean
  rejected?: string
  photoPath: string | null
}

export default function Home() {
  const exercises = useExerciseEntries()
  const ddr = useDdrEntries()
  const types = useExerciseTypes()

  const loading = exercises === undefined || ddr === undefined

  const items = useMemo<TimelineItem[]>(() => {
    const typeName = (id: string) =>
      types?.find((t) => t.id === id)?.name ?? 'Unknown exercise'

    const fromExercise: TimelineItem[] = (exercises ?? []).map((entry) => ({
      id: entry.id,
      table: 'exercise_entries',
      heading: typeName(entry.exercise_type_id),
      detail: [
        entry.reps !== null && `${entry.reps} reps`,
        entry.duration_seconds !== null && formatDuration(entry.duration_seconds),
      ]
        .filter(Boolean)
        .join(' · '),
      note: entry.notes,
      performedAt: entry.performed_at,
      pending: entry.pending === 1,
      rejected: entry.rejected_reason,
      photoPath: null,
    }))

    const fromDdr: TimelineItem[] = (ddr ?? []).map((entry) => ({
      id: entry.id,
      table: 'ddr_entries',
      heading: entry.song_title,
      detail: [
        // The scale is shown alongside the rating because a bare "16" means
        // different things on the 1-10 and 1-20 scales.
        `Lv ${entry.difficulty} (${entry.difficulty_scale})`,
        `${entry.percentage_score}%`,
        entry.song_length_seconds !== null && formatDuration(entry.song_length_seconds),
      ]
        .filter(Boolean)
        .join(' · '),
      note: null,
      performedAt: entry.performed_at,
      pending: entry.pending === 1,
      rejected: entry.rejected_reason,
      photoPath: entry.photo_path,
    }))

    return [...fromExercise, ...fromDdr].sort((a, b) =>
      b.performedAt.localeCompare(a.performedAt),
    )
  }, [exercises, ddr, types])

  return (
    <main className="page">
      <header className="spread">
        <h1 className="title">Health Tracker</h1>
        <SyncBadge />
      </header>

      <div className="stack">
        <div className="row">
          <Link href="/log/exercise" className="btn btn-primary btn-lg grow">
            Log exercise
          </Link>
          <Link href="/log/ddr" className="btn btn-primary btn-lg grow">
            Log DDR
          </Link>
        </div>
        <div className="row">
          <Link href="/types" className="btn grow">
            Manage exercises
          </Link>
          <Link href="/data" className="btn grow">
            Export &amp; backup
          </Link>
        </div>
      </div>

      <section className="stack">
        <h2 className="subtitle">Recent</h2>

        {loading && <p className="muted">Loading…</p>}

        {!loading && items.length === 0 && (
          <div className="empty">Nothing logged yet.</div>
        )}

        {items.slice(0, 50).map((item) => (
          <article key={item.id} className="card spread">
            {item.photoPath && (
              <a href={`/api/photos/${item.photoPath}`} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- a
                    48px thumbnail doesn't need next/image's pipeline. */}
                <img className="thumb" src={`/api/photos/${item.photoPath}`} alt="" />
              </a>
            )}
            <div className="grow">
              <div className="subtitle">{item.heading}</div>
              {/* Metrics and timestamp on separate lines: joined into one they
                  wrap mid-date on a narrow phone, which reads as a mistake. */}
              {item.detail && <div className="muted mono">{item.detail}</div>}
              <div className="muted mono">{formatWhen(item.performedAt)}</div>
              {item.note && <div className="muted">{item.note}</div>}
              {item.rejected && <div className="error">Rejected: {item.rejected}</div>}
            </div>

            <div className="row">
              {item.pending && <span className="pill">Unsaved</span>}
              <button
                type="button"
                className="btn btn-danger"
                aria-label={`Delete ${item.heading}`}
                onClick={() => {
                  if (confirm('Delete this entry?')) {
                    void local.remove(item.table, item.id)
                  }
                }}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  )
}
