'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as local from '@/lib/local-db'
import {
  formatDuration,
  formatSetSummary,
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
  type SetDetail,
  type SyncTable,
} from '@/lib/types'
import { DEFAULT_EXERCISE_ICON } from '@/lib/exercise-icons'
import { DdrArrowIcon } from './components/ddr-arrow-icon'
import { ExerciseIcon } from './components/exercise-icon'
import { ScoreRing } from './components/score-ring'
import { SetDetailRows } from './components/set-detail-rows'

type EntryTable = Extract<SyncTable, 'exercise_entries' | 'ddr_entries'>

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
   *  glyph, so these are only ever set for the exercise_entries branch. */
  icon: string | null
  /** A generated drawing, when the type has one instead of a preset. */
  iconSvg: string | null
  /** The underlying record, for editing — the fields above are a read-only
   *  projection and don't carry enough to repopulate an edit form. */
  raw: local.Local<DdrEntry> | local.Local<ExerciseEntry>
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
function DdrEntryRow({ item, band }: { item: TimelineItem; band: 'a' | 'b' }) {
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
        <button
          type="button"
          className="btn btn-danger btn-block"
          onClick={() => {
            if (confirm('Delete this entry?')) {
              void local.remove('ddr_entries', entry.id)
            }
          }}
        >
          Delete
        </button>
      </form>
    )
  }

  return (
    <article
      className={`entry-row entry-row-${band} entry-row-tappable`}
      role="button"
      tabIndex={0}
      aria-label={`Edit ${item.heading}`}
      onClick={startEditing}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          startEditing()
        }
      }}
    >
      {item.photoPath ? (
        <a
          href={`/api/photos/${item.photoPath}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
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
        <ScoreRing scorePct={entry.percentage_score} />
        {item.pending && <span className="pill">Unsaved</span>}
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
  band,
}: {
  item: TimelineItem
  type: local.Local<ExerciseType> | undefined
  band: 'a' | 'b'
}) {
  const entry = item.raw as local.Local<ExerciseEntry>
  const [editing, setEditing] = useState(false)
  const [sets, setSets] = useState(String(entry.sets))
  const [reps, setReps] = useState(entry.reps !== null ? String(entry.reps) : '')
  const [duration, setDuration] = useState(lengthToInput(entry.duration_seconds))
  const [weight, setWeight] = useState(entry.weight !== null ? String(entry.weight) : '')
  const [varyBySet, setVaryBySet] = useState(!!entry.set_details)
  const [setDetails, setSetDetails] = useState<SetDetail[]>(entry.set_details ?? [])
  const [notes, setNotes] = useState(entry.notes ?? '')
  const [performedAt, setPerformedAt] = useState(toDatetimeLocal(entry.performed_at))
  const [error, setError] = useState<string | null>(null)

  function startEditing() {
    setSets(String(entry.sets))
    setReps(entry.reps !== null ? String(entry.reps) : '')
    setDuration(lengthToInput(entry.duration_seconds))
    setWeight(entry.weight !== null ? String(entry.weight) : '')
    setVaryBySet(!!entry.set_details)
    setSetDetails(entry.set_details ?? [])
    setNotes(entry.notes ?? '')
    setPerformedAt(toDatetimeLocal(entry.performed_at))
    setError(null)
    setEditing(true)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!type) return setError('This exercise no longer exists.')

    const setsValue = Number(sets)
    if (varyBySet) {
      if (setDetails.length < 1) return setError('Add at least one set.')
    } else if (!Number.isInteger(setsValue) || setsValue < 1) {
      return setError('Sets must be a whole number, at least 1.')
    }

    let repsValue: number | null = null
    if (!varyBySet && type.tracks_reps && reps.trim()) {
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

    const hasReps = varyBySet ? setDetails.some((set) => set.reps !== null) : repsValue !== null
    if (!hasReps && durationValue === null && !notes.trim()) {
      return setError('Add reps, a time, or a note.')
    }

    let weightValue: number | null = null
    if (!varyBySet && type.tracks_weight && weight.trim()) {
      const parsed = Number(weight)
      if (!Number.isFinite(parsed) || parsed < 0) {
        return setError('Weight must be a positive number.')
      }
      weightValue = Math.round(parsed * 100) / 100
    }

    if (!performedAt) return setError('When is required.')

    await local.put('exercise_entries', {
      ...entry,
      sets: varyBySet ? setDetails.length : setsValue,
      reps: repsValue,
      duration_seconds: durationValue,
      weight: weightValue,
      set_details: varyBySet ? setDetails : null,
      notes: notes.trim() || null,
      performed_at: fromDatetimeLocal(performedAt),
      updated_at: new Date().toISOString(),
    })
    setEditing(false)
  }

  if (editing) {
    return (
      <form onSubmit={save} className="card stack">
        {!varyBySet && (
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
        )}

        {(type?.tracks_reps || type?.tracks_weight) && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={varyBySet}
              onChange={(e) => {
                const checked = e.target.checked
                setVaryBySet(checked)
                if (checked && setDetails.length === 0) {
                  const count = Math.max(1, Number(sets) || 1)
                  setSetDetails(Array.from({ length: count }, () => ({ reps: null, weight: null })))
                }
                setError(null)
              }}
            />
            Vary reps/weight by set
          </label>
        )}

        {!varyBySet && type?.tracks_reps && (
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

        {varyBySet && (
          <SetDetailRows
            sets={setDetails}
            onChange={(next) => {
              setSetDetails(next)
              setError(null)
            }}
            showReps={type?.tracks_reps}
            showWeight={type?.tracks_weight}
          />
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

        {!varyBySet && type?.tracks_weight && (
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
        <button
          type="button"
          className="btn btn-danger btn-block"
          onClick={() => {
            if (confirm('Delete this entry?')) {
              void local.remove('exercise_entries', entry.id)
            }
          }}
        >
          Delete
        </button>
      </form>
    )
  }

  return (
    <article
      className={`entry-row entry-row-${band} entry-row-tappable`}
      role="button"
      tabIndex={0}
      aria-label={`Edit ${item.heading}`}
      onClick={startEditing}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          startEditing()
        }
      }}
    >
      {item.exerciseTypeId ? (
        <Link
          href={`/exercise/${item.exerciseTypeId}`}
          className="type-icon"
          aria-label={`View ${item.heading}`}
          onClick={(e) => e.stopPropagation()}
        >
          <ExerciseIcon icon={item.icon ?? DEFAULT_EXERCISE_ICON} iconSvg={item.iconSvg} />
        </Link>
      ) : (
        <span className="type-icon" aria-hidden="true">
          <ExerciseIcon icon={item.icon ?? DEFAULT_EXERCISE_ICON} iconSvg={item.iconSvg} />
        </span>
      )}
      <div className="grow">
        {/* Metrics and timestamp on separate lines: joined into one they
            wrap mid-date on a narrow phone, which reads as a mistake. */}
        <div className="subtitle">{item.heading}</div>
        {item.detail && <div className="muted mono">{item.detail}</div>}
        <div className="muted mono">{formatWhen(item.performedAt)}</div>
        {item.note && <div className="muted">{item.note}</div>}
        {item.rejected && <div className="error">Rejected: {item.rejected}</div>}
      </div>

      {item.pending && <span className="pill">Unsaved</span>}
    </article>
  )
}

/** A session's own entry, inside its SessionGroup card — a plain summary
 *  row (icon, name/detail, timestamp) rather than the flat timeline's
 *  editable DdrEntryRow/ExerciseEntryRow. Editing and removing a session's
 *  entries still happens on the session's own detail page; this is a
 *  read-only "what happened" recap, matching the mockup's session rows,
 *  which likewise carry no edit/delete affordance. */
function SessionMemberRow({ item, band }: { item: TimelineItem; band: 'a' | 'b' }) {
  return (
    <div className={`entry-row entry-row-${band}`}>
      {item.table === 'ddr_entries' ? (
        item.photoPath ? (
          // eslint-disable-next-line @next/next/no-img-element -- a thumbnail doesn't need next/image's pipeline.
          <img className="thumb thumb-ddr" src={`/api/photos/${item.photoPath}`} alt="" />
        ) : (
          <span className="thumb thumb-ddr thumb-fallback" aria-hidden="true">
            <DdrArrowIcon />
          </span>
        )
      ) : (
        <span className="type-icon" aria-hidden="true">
          <ExerciseIcon icon={item.icon ?? DEFAULT_EXERCISE_ICON} iconSvg={item.iconSvg} />
        </span>
      )}
      <div className="grow">
        <div className="subtitle">{item.heading}</div>
        {item.detail && <div className="muted mono">{item.detail}</div>}
      </div>
      <div className="entry-row-when">{formatWhen(item.performedAt)}</div>
    </div>
  )
}

/** A grouped session's disclosure row.
 *
 *  Deliberately *not* a <details>/<summary>. A closed <details> has its
 *  content hidden by the browser itself — via a `display: none` UA rule on
 *  older engines, via an anonymous `::details-content` box on newer ones —
 *  and neither is something a transition on our own markup can ease. These
 *  are plain elements whose open state lives in React, so the collapse is
 *  an ordinary CSS transition with nothing browser-controlled in the way.
 *  Reduced-motion is handled by the global rule in globals.css rather than
 *  a JS check here, so the animation can never be silently skipped. */
function SessionGroup({
  name,
  earliest,
  count,
  items,
}: {
  name: string
  earliest: string
  count: number
  items: TimelineItem[]
}) {
  const [isOpen, setIsOpen] = useState(true)

  return (
    <div className="session-card">
      <button
        type="button"
        className="session-card-header"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="grow">
          <span className="subtitle">{name}</span>
          <span className="muted mono">
            {formatWhen(earliest)} · {count} entries
          </span>
        </span>
        <span className={`disclosure-chevron${isOpen ? '' : ' is-collapsed'}`} aria-hidden="true">
          ▾
        </span>
      </button>
      <div className={`session-body${isOpen ? ' is-open' : ''}`}>
        {/* The inner wrapper is what actually gets clipped: the grid row
            above animates 0fr→1fr, and this clips its overflow so the
            rows slide out of view instead of spilling past the card. */}
        <div className="session-body-inner">
          {items.map((item, i) => (
            <SessionMemberRow key={`${item.table}:${item.id}`} item={item} band={i % 2 === 0 ? 'a' : 'b'} />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const exercises = useExerciseEntries()
  const ddr = useDdrEntries()
  const types = useExerciseTypes()
  const sessions = useWorkoutSessions()
  const activeSession = useActiveSession()

  const loading = exercises === undefined || ddr === undefined
  const sessionHref = activeSession ? `/sessions/${activeSession.id}` : '/sessions/start'

  const sessionById = useMemo(
    () => new Map((sessions ?? []).map((session) => [session.id, session])),
    [sessions],
  )

  const [logPickerOpen, setLogPickerOpen] = useState(false)

  const itemKey = (item: TimelineItem) => `${item.table}:${item.id}`

  const items = useMemo<TimelineItem[]>(() => {
    const typeOf = (id: string) => types?.find((t) => t.id === id)

    const fromExercise: TimelineItem[] = (exercises ?? []).map((entry) => ({
      id: entry.id,
      table: 'exercise_entries',
      exerciseTypeId: entry.exercise_type_id,
      heading: typeOf(entry.exercise_type_id)?.name ?? 'Unknown exercise',
      detail: formatSetSummary({
        sets: entry.sets,
        reps: entry.reps,
        durationSeconds: entry.duration_seconds,
        weight: entry.weight,
        setDetails: entry.set_details,
      }),
      note: entry.notes,
      performedAt: entry.performed_at,
      sessionId: entry.session_id,
      pending: entry.pending === 1,
      rejected: entry.rejected_reason,
      photoPath: null,
      icon: typeOf(entry.exercise_type_id)?.icon ?? null,
      iconSvg: typeOf(entry.exercise_type_id)?.icon_svg ?? null,
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
      iconSvg: null,
      raw: entry,
    }))

    return [...fromExercise, ...fromDdr].sort((a, b) =>
      b.performedAt.localeCompare(a.performedAt),
    )
  }, [exercises, ddr, types])

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const visibleItems = items.slice(0, visibleCount)
  const hasMore = visibleCount < items.length

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

  // Clusters *consecutive* items sharing a session so grouping never fights
  // pagination above it. A session member that lands elsewhere in the visible
  // page still renders as a normal row with a link back to its session
  // instead of being forced into a group.
  //
  // Flat (non-grouped) rows are further clustered into "run"s of consecutive
  // items — the mockup's timeline is one continuous banded list, not a stack
  // of gap-separated cards, so a run renders as a single flush block (zero
  // gap between its own rows) while still getting normal spacing from its
  // neighboring blocks (session cards, other runs) via the outer .stack.
  const renderRows = useMemo(() => {
    const rows: (
      | { kind: 'run'; entries: { item: TimelineItem; band: 'a' | 'b' }[] }
      | { kind: 'group'; sessionId: string; items: TimelineItem[] }
    )[] = []

    // Session groups render as their own bordered card and don't take a
    // turn in this alternation — it's only for rows in the flat list.
    let flatIndex = 0
    let run: { item: TimelineItem; band: 'a' | 'b' }[] = []
    const flushRun = () => {
      if (run.length > 0) {
        rows.push({ kind: 'run', entries: run })
        run = []
      }
    }

    let i = 0
    while (i < visibleItems.length) {
      const item = visibleItems[i]
      if (item.sessionId) {
        let j = i + 1
        while (j < visibleItems.length && visibleItems[j].sessionId === item.sessionId) j += 1
        if (j - i >= 2) {
          flushRun()
          rows.push({ kind: 'group', sessionId: item.sessionId, items: visibleItems.slice(i, j) })
          i = j
          continue
        }
      }
      run.push({ item, band: flatIndex % 2 === 0 ? 'a' : 'b' })
      flatIndex += 1
      i += 1
    }
    flushRun()

    return rows
  }, [visibleItems])

  function renderEntry(item: TimelineItem, band: 'a' | 'b') {
    const key = itemKey(item)
    return item.table === 'ddr_entries' ? (
      <DdrEntryRow key={key} item={item} band={band} />
    ) : (
      <ExerciseEntryRow key={key} item={item} type={types?.find((t) => t.id === item.exerciseTypeId)} band={band} />
    )
  }

  return (
    <main className="page">
      {/* The mockup's Home screen has no visible page title — the nav bar's
          theme-labeled brand serves that role. Kept as a screen-reader-only
          heading so the page still has one in the accessibility tree. */}
      <h1 className="visually-hidden">Home</h1>

      <div className="row">
        <div className="log-picker-wrap grow">
          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            aria-haspopup="menu"
            aria-expanded={logPickerOpen}
            onClick={() => setLogPickerOpen((open) => !open)}
          >
            + Log
          </button>
          {logPickerOpen && (
            <>
              <div className="log-picker-backdrop" onClick={() => setLogPickerOpen(false)} />
              <div className="log-picker-menu" role="menu">
                <Link href="/log/ddr" className="log-picker-option" role="menuitem">
                  DDR
                </Link>
                <Link href="/log/exercise" className="log-picker-option" role="menuitem">
                  Exercise
                </Link>
              </div>
            </>
          )}
        </div>
        <Link href="/routines" className="btn btn-lg grow">
          + Routine
        </Link>
        <Link href={sessionHref} className="btn btn-lg grow">
          {activeSession ? 'Resume' : 'Start Exercise'}
        </Link>
      </div>

      <section className="stack">
        {loading && <p className="muted">Loading…</p>}

        {!loading && items.length === 0 && <div className="empty">Nothing logged yet.</div>}

        {renderRows.map((row, rowIndex) => {
          if (row.kind === 'run') {
            return (
              <div key={`run-${rowIndex}`} className="entry-run">
                {row.entries.map(({ item, band }) =>
                  // A session member that landed elsewhere in the visible
                  // page (a date filter, pagination) still renders normally,
                  // just with a link back to its session instead of being
                  // forced into a group.
                  item.sessionId ? (
                    <div key={itemKey(item)}>
                      <Link href={`/sessions/${item.sessionId}`} className="muted entry-run-parent-of">
                        Part of: {sessionById.get(item.sessionId)?.name ?? 'a session'}
                      </Link>
                      {renderEntry(item, band)}
                    </div>
                  ) : (
                    renderEntry(item, band)
                  ),
                )}
              </div>
            )
          }

          const times = row.items.map((item) => item.performedAt)
          const earliest = times.reduce((a, b) => (a < b ? a : b))
          const session = sessionById.get(row.sessionId)

          return (
            <SessionGroup
              key={`group-${row.sessionId}`}
              name={session?.name ?? 'Workout session'}
              earliest={earliest}
              count={row.items.length}
              items={row.items}
            />
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
