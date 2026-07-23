'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as local from '@/lib/local-db'
import {
  formatDuration,
  formatWhen,
  fromDatetimeLocal,
  parseDuration,
  toDatetimeLocal,
} from '@/lib/format'
import {
  useActiveSession,
  useDdrEntries,
  useExerciseEntries,
  useExerciseTypes,
  useWorkoutSessions,
} from '@/lib/use-store'
import {
  MAX_DIFFICULTY,
  type DdrEntry,
  type DifficultyScale,
  type ExerciseEntry,
  type ExerciseType,
  type SyncTable,
  type WorkoutSession,
} from '@/lib/types'
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
  sessionId: string | null
  pending: boolean
  rejected?: string
  photoPath: string | null
  /** Exercise types carry their own icon; DDR falls back to a fixed arrow
   *  glyph, so this is only ever set for the exercise_entries branch. */
  icon: string | null
  /** The underlying record, for editing — the fields above are a read-only
   *  projection and don't carry enough to repopulate an edit form. */
  raw: local.Local<DdrEntry> | local.Local<ExerciseEntry>
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

/** Seconds to the m:ss (or h:mm:ss) text the length input expects. */
function lengthToInput(seconds: number | null): string {
  return seconds === null ? '' : formatDuration(seconds)
}

/** Edits a saved DDR entry in place. Read view matches the original
 *  timeline card; edit view mirrors the fields and validation in
 *  app/log/ddr/page.tsx, since this is the same record shape. */
function DdrEntryRow({
  item,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: {
  item: TimelineItem
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}) {
  const entry = item.raw as local.Local<DdrEntry>
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(entry.song_title)
  const [artist, setArtist] = useState(entry.artist ?? '')
  const [scale, setScale] = useState<DifficultyScale>(entry.difficulty_scale)
  const [difficulty, setDifficulty] = useState(String(entry.difficulty))
  const [difficultyType, setDifficultyType] = useState(entry.difficulty_type ?? '')
  const [score, setScore] = useState(String(entry.percentage_score))
  const [length, setLength] = useState(lengthToInput(entry.song_length_seconds))
  const [performedAt, setPerformedAt] = useState(toDatetimeLocal(entry.performed_at))
  const [error, setError] = useState<string | null>(null)

  function startEditing() {
    setTitle(entry.song_title)
    setArtist(entry.artist ?? '')
    setScale(entry.difficulty_scale)
    setDifficulty(String(entry.difficulty))
    setDifficultyType(entry.difficulty_type ?? '')
    setScore(String(entry.percentage_score))
    setLength(lengthToInput(entry.song_length_seconds))
    setPerformedAt(toDatetimeLocal(entry.performed_at))
    setError(null)
    setEditing(true)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()

    const songTitle = title.trim()
    if (!songTitle) return setError('Song title is required.')

    const max = MAX_DIFFICULTY[scale]
    const difficultyValue = Number(difficulty)
    if (
      !difficulty.trim() ||
      !Number.isInteger(difficultyValue) ||
      difficultyValue < 1 ||
      difficultyValue > max
    ) {
      return setError(`Difficulty must be a whole number from 1 to ${max} on the ${scale} scale.`)
    }

    const scoreValue = Number(score)
    if (!score.trim() || Number.isNaN(scoreValue) || scoreValue < 0 || scoreValue > 100) {
      return setError('Score must be between 0 and 100.')
    }

    let lengthValue: number | null = null
    if (length.trim()) {
      const parsed = parseDuration(length)
      if (parsed === null || parsed <= 0) {
        return setError('Song length should look like 105 or 1:45.')
      }
      lengthValue = parsed
    }

    if (!performedAt) return setError('When is required.')

    await local.put('ddr_entries', {
      ...entry,
      song_title: songTitle,
      artist: artist.trim() || null,
      difficulty: difficultyValue,
      difficulty_scale: scale,
      difficulty_type: difficultyType.trim() || null,
      percentage_score: Math.round(scoreValue * 100) / 100,
      song_length_seconds: lengthValue,
      performed_at: fromDatetimeLocal(performedAt),
      updated_at: new Date().toISOString(),
    })
    setEditing(false)
  }

  if (editing) {
    return (
      <form onSubmit={save} className="card stack">
        <div className="field">
          <label className="label" htmlFor={`song-${entry.id}`}>
            Song
          </label>
          <input
            id={`song-${entry.id}`}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setError(null)
            }}
            autoComplete="off"
          />
        </div>

        <div className="field">
          <label className="label" htmlFor={`artist-${entry.id}`}>
            Artist
          </label>
          <input
            id={`artist-${entry.id}`}
            value={artist}
            onChange={(e) => {
              setArtist(e.target.value)
              setError(null)
            }}
            placeholder="Optional"
            autoComplete="off"
          />
        </div>

        <div className="field">
          <span className="label">Difficulty scale</span>
          <div className="row">
            {(['old', 'new'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`btn grow ${scale === option ? 'btn-primary' : ''}`}
                aria-pressed={scale === option}
                onClick={() => {
                  setScale(option)
                  setError(null)
                }}
              >
                {option === 'old' ? 'Old (1–10)' : 'New (1–20)'}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor={`difficulty-type-${entry.id}`}>
            Difficulty type
          </label>
          <input
            id={`difficulty-type-${entry.id}`}
            value={difficultyType}
            onChange={(e) => {
              setDifficultyType(e.target.value)
              setError(null)
            }}
            placeholder="Expert"
            autoComplete="off"
          />
        </div>

        <div className="row">
          <div className="field grow">
            <label className="label" htmlFor={`difficulty-${entry.id}`}>
              Difficulty
            </label>
            <input
              id={`difficulty-${entry.id}`}
              inputMode="numeric"
              value={difficulty}
              onChange={(e) => {
                setDifficulty(e.target.value)
                setError(null)
              }}
              autoComplete="off"
            />
          </div>

          <div className="field grow">
            <label className="label" htmlFor={`score-${entry.id}`}>
              Score %
            </label>
            <input
              id={`score-${entry.id}`}
              inputMode="decimal"
              value={score}
              onChange={(e) => {
                setScore(e.target.value)
                setError(null)
              }}
              autoComplete="off"
            />
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor={`length-${entry.id}`}>
            Song length
          </label>
          <input
            id={`length-${entry.id}`}
            value={length}
            onChange={(e) => {
              setLength(e.target.value)
              setError(null)
            }}
            placeholder="1:45"
            autoComplete="off"
          />
        </div>

        <div className="field">
          <label className="label" htmlFor={`when-${entry.id}`}>
            When
          </label>
          <input
            id={`when-${entry.id}`}
            type="datetime-local"
            value={performedAt}
            onChange={(e) => setPerformedAt(e.target.value)}
          />
        </div>

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
    <article className="card spread">
      {item.photoPath ? (
        <a href={`/api/photos/${item.photoPath}`} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- a
              thumbnail doesn't need next/image's pipeline. */}
          <img className="thumb thumb-ddr" src={`/api/photos/${item.photoPath}`} alt="" />
        </a>
      ) : (
        <span className="thumb thumb-ddr thumb-fallback" aria-hidden="true">
          <DdrArrowIcon />
        </span>
      )}
      <div className="grow">
        <div className="subtitle">{item.heading}</div>
        {item.detail && <div className="muted mono">{item.detail}</div>}
        <div className="muted mono">{formatWhen(item.performedAt)}</div>
        {item.rejected && <div className="error">Rejected: {item.rejected}</div>}
      </div>

      <div className="row">
        {selectMode ? (
          <label className="checkbox" aria-label={`Select ${item.heading}`}>
            <input type="checkbox" checked={selected} onChange={onToggleSelect} />
          </label>
        ) : (
          <>
            {item.pending && <span className="pill">Unsaved</span>}
            <button type="button" className="btn" aria-label={`Edit ${item.heading}`} onClick={startEditing}>
              Edit
            </button>
            <button
              type="button"
              className="btn btn-danger"
              aria-label={`Delete ${item.heading}`}
              onClick={() => {
                if (confirm('Delete this entry?')) {
                  void local.remove('ddr_entries', entry.id)
                }
              }}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </article>
  )
}

/** Edits a saved exercise entry in place. Which fields the edit form shows
 *  depends on the linked ExerciseType's tracks_reps/tracks_duration/
 *  tracks_weight flags, mirroring app/log/exercise/page.tsx. */
function ExerciseEntryRow({
  item,
  type,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: {
  item: TimelineItem
  type: local.Local<ExerciseType> | undefined
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}) {
  const entry = item.raw as local.Local<ExerciseEntry>
  const [editing, setEditing] = useState(false)
  const [sets, setSets] = useState(String(entry.sets))
  const [reps, setReps] = useState(entry.reps !== null ? String(entry.reps) : '')
  const [duration, setDuration] = useState(lengthToInput(entry.duration_seconds))
  const [weight, setWeight] = useState(entry.weight !== null ? String(entry.weight) : '')
  const [notes, setNotes] = useState(entry.notes ?? '')
  const [performedAt, setPerformedAt] = useState(toDatetimeLocal(entry.performed_at))
  const [error, setError] = useState<string | null>(null)

  function startEditing() {
    setSets(String(entry.sets))
    setReps(entry.reps !== null ? String(entry.reps) : '')
    setDuration(lengthToInput(entry.duration_seconds))
    setWeight(entry.weight !== null ? String(entry.weight) : '')
    setNotes(entry.notes ?? '')
    setPerformedAt(toDatetimeLocal(entry.performed_at))
    setError(null)
    setEditing(true)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!type) return setError('This exercise no longer exists.')

    const setsValue = Number(sets)
    if (!Number.isInteger(setsValue) || setsValue < 1) {
      return setError('Sets must be a whole number, at least 1.')
    }

    let repsValue: number | null = null
    if (type.tracks_reps && reps.trim()) {
      const parsed = Number(reps)
      if (!Number.isInteger(parsed) || parsed < 0) {
        return setError('Reps must be a whole number.')
      }
      repsValue = parsed
    }

    let durationValue: number | null = null
    if (type.tracks_duration && duration.trim()) {
      const parsed = parseDuration(duration)
      if (parsed === null) return setError('Time should look like 90, 1:30, or 1:02:03.')
      durationValue = parsed
    }

    if (repsValue === null && durationValue === null && !notes.trim()) {
      return setError('Add reps, a time, or a note.')
    }

    let weightValue: number | null = null
    if (type.tracks_weight && weight.trim()) {
      const parsed = Number(weight)
      if (!Number.isFinite(parsed) || parsed < 0) {
        return setError('Weight must be a positive number.')
      }
      weightValue = Math.round(parsed * 100) / 100
    }

    if (!performedAt) return setError('When is required.')

    await local.put('exercise_entries', {
      ...entry,
      sets: setsValue,
      reps: repsValue,
      duration_seconds: durationValue,
      weight: weightValue,
      notes: notes.trim() || null,
      performed_at: fromDatetimeLocal(performedAt),
      updated_at: new Date().toISOString(),
    })
    setEditing(false)
  }

  if (editing) {
    return (
      <form onSubmit={save} className="card stack">
        <div className="field">
          <label className="label" htmlFor={`sets-${entry.id}`}>
            Sets
          </label>
          <input
            id={`sets-${entry.id}`}
            inputMode="numeric"
            value={sets}
            onChange={(e) => {
              setSets(e.target.value)
              setError(null)
            }}
            autoComplete="off"
          />
        </div>

        {type?.tracks_reps && (
          <div className="field">
            <label className="label" htmlFor={`reps-${entry.id}`}>
              Reps
            </label>
            <input
              id={`reps-${entry.id}`}
              inputMode="numeric"
              value={reps}
              onChange={(e) => {
                setReps(e.target.value)
                setError(null)
              }}
              autoComplete="off"
            />
          </div>
        )}

        {type?.tracks_duration && (
          <div className="field">
            <label className="label" htmlFor={`duration-${entry.id}`}>
              Time
            </label>
            <input
              id={`duration-${entry.id}`}
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

        {type?.tracks_weight && (
          <div className="field">
            <label className="label" htmlFor={`weight-${entry.id}`}>
              Weight
            </label>
            <input
              id={`weight-${entry.id}`}
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
        )}

        <div className="field">
          <label className="label" htmlFor={`when-${entry.id}`}>
            When
          </label>
          <input
            id={`when-${entry.id}`}
            type="datetime-local"
            value={performedAt}
            onChange={(e) => setPerformedAt(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor={`notes-${entry.id}`}>
            Notes
          </label>
          <textarea
            id={`notes-${entry.id}`}
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
    <article className="card spread">
      <span className="type-icon" aria-hidden="true">
        {item.icon ?? DEFAULT_EXERCISE_ICON}
      </span>
      {item.exerciseTypeId ? (
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
        {selectMode ? (
          <label className="checkbox" aria-label={`Select ${item.heading}`}>
            <input type="checkbox" checked={selected} onChange={onToggleSelect} />
          </label>
        ) : (
          <>
            {item.pending && <span className="pill">Unsaved</span>}
            <button type="button" className="btn" aria-label={`Edit ${item.heading}`} onClick={startEditing}>
              Edit
            </button>
            <button
              type="button"
              className="btn btn-danger"
              aria-label={`Delete ${item.heading}`}
              onClick={() => {
                if (confirm('Delete this entry?')) {
                  void local.remove('exercise_entries', entry.id)
                }
              }}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </article>
  )
}

export default function Home() {
  const exercises = useExerciseEntries()
  const ddr = useDdrEntries()
  const types = useExerciseTypes()
  const sessions = useWorkoutSessions()
  const activeSession = useActiveSession()

  const loading = exercises === undefined || ddr === undefined

  const sessionById = useMemo(
    () => new Map((sessions ?? []).map((session) => [session.id, session])),
    [sessions],
  )

  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<KindFilter>('all')
  const [exerciseTypeId, setExerciseTypeId] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sort, setSort] = useState<SortOrder>('date-desc')

  const [selectMode, setSelectMode] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [groupingOpen, setGroupingOpen] = useState(false)
  const [groupChoice, setGroupChoice] = useState('new')
  const [newSessionName, setNewSessionName] = useState('')

  const itemKey = (item: TimelineItem) => `${item.table}:${item.id}`

  function toggleSelected(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedKeys(new Set())
    setGroupingOpen(false)
    setGroupChoice('new')
    setNewSessionName('')
  }

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
      sessionId: entry.session_id,
      pending: entry.pending === 1,
      rejected: entry.rejected_reason,
      photoPath: null,
      icon: typeOf(entry.exercise_type_id)?.icon ?? null,
      raw: entry,
    }))

    const fromDdr: TimelineItem[] = (ddr ?? []).map((entry) => ({
      id: entry.id,
      table: 'ddr_entries',
      exerciseTypeId: null,
      heading: entry.artist ? `${entry.song_title} — ${entry.artist}` : entry.song_title,
      detail: [
        // The scale is shown alongside the rating because a bare "16" means
        // different things on the 1-10 and 1-20 scales.
        `${entry.difficulty_type ? `${entry.difficulty_type} ` : ''}Lv ${entry.difficulty} (${entry.difficulty_scale})`,
        `${entry.percentage_score}%`,
        entry.song_length_seconds !== null && formatDuration(entry.song_length_seconds),
      ]
        .filter(Boolean)
        .join(' · '),
      note: null,
      performedAt: entry.performed_at,
      sessionId: entry.session_id,
      pending: entry.pending === 1,
      rejected: entry.rejected_reason,
      photoPath: entry.photo_path,
      icon: null,
      raw: entry,
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

  // Clusters *consecutive* items sharing a session so grouping never fights
  // the sort/pagination above it. A session member that lands elsewhere in
  // the list (e.g. under a name sort, or split across a date filter) still
  // renders as a normal card with a link back to its session instead.
  const renderRows = useMemo(() => {
    const rows: (
      | { kind: 'item'; item: TimelineItem }
      | { kind: 'group'; sessionId: string; items: TimelineItem[] }
    )[] = []

    let i = 0
    while (i < visibleItems.length) {
      const item = visibleItems[i]
      if (item.sessionId) {
        let j = i + 1
        while (j < visibleItems.length && visibleItems[j].sessionId === item.sessionId) j += 1
        if (j - i >= 2) {
          rows.push({ kind: 'group', sessionId: item.sessionId, items: visibleItems.slice(i, j) })
          i = j
          continue
        }
      }
      rows.push({ kind: 'item', item })
      i += 1
    }

    return rows
  }, [visibleItems])

  const openSessions = sessions?.filter((s) => s.deleted_at === null) ?? []

  async function confirmGrouping() {
    const selected = items.filter((item) => selectedKeys.has(itemKey(item)))
    if (selected.length === 0) return

    const now = new Date().toISOString()
    let sessionId: string

    if (groupChoice === 'new') {
      const performedAts = [...selected.map((item) => item.performedAt)].sort()
      const session: WorkoutSession = {
        id: crypto.randomUUID(),
        name: newSessionName.trim() || null,
        template_id: null,
        started_at: performedAts[0],
        ended_at: performedAts[performedAts.length - 1],
        notes: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      }
      await local.put('workout_sessions', session)
      sessionId = session.id
    } else {
      sessionId = groupChoice
    }

    await Promise.all(
      selected.map((item) =>
        local.put(item.table, { ...item.raw, session_id: sessionId, updated_at: now }),
      ),
    )

    exitSelectMode()
  }

  function renderEntry(item: TimelineItem) {
    const key = itemKey(item)
    return item.table === 'ddr_entries' ? (
      <DdrEntryRow
        key={key}
        item={item}
        selectMode={selectMode}
        selected={selectedKeys.has(key)}
        onToggleSelect={() => toggleSelected(key)}
      />
    ) : (
      <ExerciseEntryRow
        key={key}
        item={item}
        type={types?.find((t) => t.id === item.exerciseTypeId)}
        selectMode={selectMode}
        selected={selectedKeys.has(key)}
        onToggleSelect={() => toggleSelected(key)}
      />
    )
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
          <Link
            href={activeSession ? `/sessions/${activeSession.id}` : '/sessions/start'}
            className="btn btn-block"
          >
            {activeSession ? 'Continue workout' : 'Start workout'}
          </Link>
        </div>
        <div className="row">
          <Link href="/types" className="btn grow">
            Manage exercises
          </Link>
          <Link href="/routines" className="btn grow">
            Routines
          </Link>
        </div>
        <div className="row">
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
        <div className="spread">
          <h2 className="subtitle">Recent</h2>
          {!loading && items.length > 0 && (
            <button
              type="button"
              className="btn"
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            >
              {selectMode ? 'Cancel' : 'Select'}
            </button>
          )}
        </div>

        {selectMode && (
          <div className="card stack">
            <div className="spread">
              <span className="muted">{selectedKeys.size} selected</span>
              <button
                type="button"
                className="btn btn-primary"
                disabled={selectedKeys.size === 0}
                onClick={() => setGroupingOpen(true)}
              >
                Group into session
              </button>
            </div>

            {groupingOpen && (
              <div className="stack">
                <div className="field">
                  <label className="label" htmlFor="group-choice">
                    Session
                  </label>
                  <select
                    id="group-choice"
                    value={groupChoice}
                    onChange={(e) => setGroupChoice(e.target.value)}
                  >
                    <option value="new">New session…</option>
                    {openSessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {session.name ?? formatWhen(session.started_at)}
                      </option>
                    ))}
                  </select>
                </div>

                {groupChoice === 'new' && (
                  <div className="field">
                    <label className="label" htmlFor="new-session-name">
                      Name
                    </label>
                    <input
                      id="new-session-name"
                      value={newSessionName}
                      onChange={(e) => setNewSessionName(e.target.value)}
                      placeholder="Leg day (optional)"
                      autoComplete="off"
                    />
                  </div>
                )}

                <div className="spread">
                  <button type="button" className="btn" onClick={() => setGroupingOpen(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={selectedKeys.size === 0}
                    onClick={() => void confirmGrouping()}
                  >
                    Group {selectedKeys.size} {selectedKeys.size === 1 ? 'entry' : 'entries'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

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

        {renderRows.map((row) => {
          if (row.kind === 'item') {
            const item = row.item
            if (!item.sessionId) return renderEntry(item)
            // A session member that didn't land next to its mates (a name
            // sort, a date filter) still renders normally, just with a link
            // back to the session instead of being forced into a group.
            return (
              <div key={itemKey(item)} className="stack" style={{ gap: 4 }}>
                <Link
                  href={`/sessions/${item.sessionId}`}
                  className="muted"
                  style={{ fontSize: '0.8rem', marginLeft: 4 }}
                >
                  Part of: {sessionById.get(item.sessionId)?.name ?? 'a session'}
                </Link>
                {renderEntry(item)}
              </div>
            )
          }

          const times = row.items.map((item) => item.performedAt)
          const earliest = times.reduce((a, b) => (a < b ? a : b))
          const session = sessionById.get(row.sessionId)

          return (
            <details key={`group-${row.sessionId}`} className="card" open>
              <summary className="spread session-summary">
                <div className="grow">
                  <div className="subtitle">{session?.name ?? 'Workout session'}</div>
                  <div className="muted mono">
                    {formatWhen(earliest)} · {row.items.length} entries
                  </div>
                </div>
                <Link
                  href={`/sessions/${row.sessionId}`}
                  className="btn"
                  onClick={(e) => e.stopPropagation()}
                >
                  Session
                </Link>
              </summary>
              <div className="stack" style={{ marginTop: 12 }}>
                {row.items.map((item) => renderEntry(item))}
              </div>
            </details>
          )
        })}

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
