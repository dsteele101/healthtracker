'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as local from '@/lib/local-db'
import { formatDuration, formatWhen } from '@/lib/format'
import { useDdrEntries, useExerciseEntries, useExerciseTypes } from '@/lib/use-store'
import type { SyncTable } from '@/lib/types'
import { DEFAULT_EXERCISE_ICON } from '@/lib/exercise-icons'
import { SyncBadge } from './components/sync-badge'
import { DdrArrowIcon } from './components/ddr-arrow-icon'

type EntryTable = Extract<SyncTable, 'exercise_entries' | 'ddr_entries'>
type KindFilter = 'all' | EntryTable
type SortOrder = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc'

/** A row in the combined timeline, flattened so both entry kinds render the
 *  same way: what it was, the numbers, when. */
interface TimelineItem {
  id: string
  table: EntryTable
  exerciseTypeId: string | null
  heading: string
  detail: string
  note: string | null
  performedAt: string
  pending: boolean
  rejected?: string
  photoPath: string | null
  /** Exercise types carry their own icon; DDR falls back to a fixed arrow
   *  glyph, so this is only ever set for the exercise_entries branch. */
  icon: string | null
}

const KIND_LABELS: Record<KindFilter, string> = {
  all: 'All',
  exercise_entries: 'Exercise',
  ddr_entries: 'DDR',
}

// How many timeline rows render up front, and how many more each scroll-in
// reveals. The full history still lives in IndexedDB and filters run against
// all of it — this only limits how many cards get mounted at once, so a
// years-long history doesn't turn every home-page visit into a big DOM build.
const PAGE_SIZE = 20

export default function Home() {
  const exercises = useExerciseEntries()
  const ddr = useDdrEntries()
  const types = useExerciseTypes()

  const loading = exercises === undefined || ddr === undefined

  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<KindFilter>('all')
  const [exerciseTypeId, setExerciseTypeId] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sort, setSort] = useState<SortOrder>('date-desc')

  const items = useMemo<TimelineItem[]>(() => {
    const typeOf = (id: string) => types?.find((t) => t.id === id)

    const fromExercise: TimelineItem[] = (exercises ?? []).map((entry) => ({
      id: entry.id,
      table: 'exercise_entries',
      exerciseTypeId: entry.exercise_type_id,
      heading: typeOf(entry.exercise_type_id)?.name ?? 'Unknown exercise',
      detail: [
        entry.sets != null && `${entry.sets} ${entry.sets === 1 ? 'set' : 'sets'}`,
        entry.reps !== null && `${entry.reps} reps`,
        entry.duration_seconds !== null && formatDuration(entry.duration_seconds),
        entry.weight !== null && `${entry.weight} lb`,
      ]
        .filter(Boolean)
        .join(' · '),
      note: entry.notes,
      performedAt: entry.performed_at,
      pending: entry.pending === 1,
      rejected: entry.rejected_reason,
      photoPath: null,
      icon: typeOf(entry.exercise_type_id)?.icon ?? null,
    }))

    const fromDdr: TimelineItem[] = (ddr ?? []).map((entry) => ({
      id: entry.id,
      table: 'ddr_entries',
      exerciseTypeId: null,
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
      icon: null,
    }))

    return [...fromExercise, ...fromDdr].sort((a, b) =>
      b.performedAt.localeCompare(a.performedAt),
    )
  }, [exercises, ddr, types])

  const exerciseTypeFilterActive = kind !== 'ddr_entries' && exerciseTypeId !== 'all'
  const hasActiveFilters =
    query.trim() !== '' ||
    kind !== 'all' ||
    exerciseTypeFilterActive ||
    dateFrom !== '' ||
    dateTo !== ''

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()

    let result = items.filter((item) => {
      if (kind !== 'all' && item.table !== kind) return false

      if (kind !== 'ddr_entries' && exerciseTypeId !== 'all') {
        if (item.table !== 'exercise_entries' || item.exerciseTypeId !== exerciseTypeId) {
          return false
        }
      }

      if (q && !item.heading.toLowerCase().includes(q) && !item.note?.toLowerCase().includes(q)) {
        return false
      }

      // Compare by calendar day, not instant, so "From" and "To" are
      // inclusive of everything logged on those days.
      const day = item.performedAt.slice(0, 10)
      if (dateFrom && day < dateFrom) return false
      if (dateTo && day > dateTo) return false

      return true
    })

    result = [...result].sort((a, b) => {
      switch (sort) {
        case 'date-asc':
          return a.performedAt.localeCompare(b.performedAt)
        case 'name-asc':
          return a.heading.localeCompare(b.heading)
        case 'name-desc':
          return b.heading.localeCompare(a.heading)
        default:
          return b.performedAt.localeCompare(a.performedAt)
      }
    })

    return result
  }, [items, query, kind, exerciseTypeId, dateFrom, dateTo, sort])

  const filterKey = JSON.stringify([query, kind, exerciseTypeId, dateFrom, dateTo, sort])
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)

  // A new search/filter/sort produces a different result set, so pagination
  // starts over rather than showing page 3 of a list the user just changed.
  // Adjusted during render rather than in an effect, per React's guidance on
  // resetting state in response to a prop/derived-value change.
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setVisibleCount(PAGE_SIZE)
  }

  const visibleItems = filteredItems.slice(0, visibleCount)
  const hasMore = visibleCount < filteredItems.length

  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!hasMore) return
    const node = sentinelRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((count) => count + PAGE_SIZE)
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore])

  const resetFilters = () => {
    setQuery('')
    setKind('all')
    setExerciseTypeId('all')
    setDateFrom('')
    setDateTo('')
  }

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
        <div className="row">
          <Link href="/stats" className="btn grow">
            Analytics
          </Link>
        </div>
      </div>

      <section className="stack">
        <h2 className="subtitle">Recent</h2>

        {!loading && items.length > 0 && (
          <div className="card stack">
            <div className="field">
              <label className="label" htmlFor="search">
                Search
              </label>
              <input
                id="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Exercise, song, or note"
                autoComplete="off"
              />
            </div>

            <div className="row">
              {(['all', 'exercise_entries', 'ddr_entries'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`btn grow ${kind === option ? 'btn-primary' : ''}`}
                  aria-pressed={kind === option}
                  onClick={() => setKind(option)}
                >
                  {KIND_LABELS[option]}
                </button>
              ))}
            </div>

            {kind !== 'ddr_entries' && (
              <div className="field">
                <label className="label" htmlFor="exercise-type">
                  Exercise type
                </label>
                <select
                  id="exercise-type"
                  value={exerciseTypeId}
                  onChange={(e) => setExerciseTypeId(e.target.value)}
                >
                  <option value="all">All exercises</option>
                  {types?.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="row">
              <div className="field grow">
                <label className="label" htmlFor="date-from">
                  From
                </label>
                <input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="field grow">
                <label className="label" htmlFor="date-to">
                  To
                </label>
                <input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label className="label" htmlFor="sort">
                Sort by
              </label>
              <select
                id="sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOrder)}
              >
                <option value="date-desc">Newest first</option>
                <option value="date-asc">Oldest first</option>
                <option value="name-asc">Name A&ndash;Z</option>
                <option value="name-desc">Name Z&ndash;A</option>
              </select>
            </div>

            {hasActiveFilters && (
              <button type="button" className="btn btn-block" onClick={resetFilters}>
                Clear filters
              </button>
            )}
          </div>
        )}

        {!loading && items.length > 0 && (
          <p className="muted">
            {hasActiveFilters
              ? `Showing ${filteredItems.length} of ${items.length} entries.`
              : `${items.length} entries on this device.`}
          </p>
        )}

        {loading && <p className="muted">Loading…</p>}

        {!loading && items.length === 0 && (
          <div className="empty">Nothing logged yet.</div>
        )}

        {!loading && items.length > 0 && filteredItems.length === 0 && (
          <div className="empty">No entries match your filters.</div>
        )}

        {visibleItems.map((item) => (
          <article key={item.id} className="card spread">
            {item.table === 'ddr_entries' &&
              (item.photoPath ? (
                <a href={`/api/photos/${item.photoPath}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a
                      thumbnail doesn't need next/image's pipeline. */}
                  <img className="thumb thumb-ddr" src={`/api/photos/${item.photoPath}`} alt="" />
                </a>
              ) : (
                <span className="thumb thumb-ddr thumb-fallback" aria-hidden="true">
                  <DdrArrowIcon />
                </span>
              ))}
            {item.table === 'exercise_entries' && (
              <span className="type-icon" aria-hidden="true">
                {item.icon ?? DEFAULT_EXERCISE_ICON}
              </span>
            )}
            {item.table === 'exercise_entries' && item.exerciseTypeId ? (
              <Link href={`/exercise/${item.exerciseTypeId}`} className="grow">
                <div className="subtitle">{item.heading}</div>
                {/* Metrics and timestamp on separate lines: joined into one they
                    wrap mid-date on a narrow phone, which reads as a mistake. */}
                {item.detail && <div className="muted mono">{item.detail}</div>}
                <div className="muted mono">{formatWhen(item.performedAt)}</div>
                {item.note && <div className="muted">{item.note}</div>}
                {item.rejected && <div className="error">Rejected: {item.rejected}</div>}
              </Link>
            ) : (
              <div className="grow">
                <div className="subtitle">{item.heading}</div>
                {item.detail && <div className="muted mono">{item.detail}</div>}
                <div className="muted mono">{formatWhen(item.performedAt)}</div>
                {item.note && <div className="muted">{item.note}</div>}
                {item.rejected && <div className="error">Rejected: {item.rejected}</div>}
              </div>
            )}

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

        {hasMore && (
          <>
            {/* Invisible trigger for auto-loading the next page on scroll. */}
            <div ref={sentinelRef} aria-hidden="true" />
            <button
              type="button"
              className="btn btn-block"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            >
              Load more
            </button>
          </>
        )}
      </section>
    </main>
  )
}
