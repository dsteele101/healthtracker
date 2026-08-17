'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { formatDay, formatDuration } from '@/lib/format'
import { useDdrEntries, useExerciseEntries, useExerciseTypes, useSongs } from '@/lib/use-store'
import type { DdrEntry, ExerciseEntry } from '@/lib/types'
import { Dropdown } from '../components/dropdown'
import { MetricSection } from '../components/metric-section'
import { StreakGrid, type StreakDay } from '../components/streak-grid'
import type { Point } from '../components/trend-chart'
import { VolumeBarChart } from '../components/volume-bar-chart'

// Mirrors log/exercise's remembered-type key, so Analytics opens on whatever
// exercise was last logged rather than defaulting to the alphabetically first.
const LAST_TYPE_KEY = 'tracker:last-exercise-type'

type Range = '30' | '90' | 'all'
const RANGE_DAYS: Record<Exclude<Range, 'all'>, number> = { '30': 30, '90': 90 }
const RANGES: Range[] = ['30', '90', 'all']

function readRememberedType(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(LAST_TYPE_KEY)
}

function useCutoff(range: Range): string | null {
  return useMemo(() => {
    if (range === 'all') return null
    const d = new Date()
    d.setDate(d.getDate() - RANGE_DAYS[range])
    return d.toISOString()
  }, [range])
}

function RangePicker({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  return (
    <div className="seg" role="group" aria-label="Time range">
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          className={`seg-btn ${range === r ? 'seg-btn-active' : ''}`}
          onClick={() => onChange(r)}
        >
          {r === 'all' ? 'All' : `${r}D`}
        </button>
      ))}
    </div>
  )
}

type Section = 'exercise' | 'ddr'

const STREAK_WEEKS = 12

/** Local-calendar-day key, so a day's activity groups correctly across a
 *  timezone boundary (mirrors aggregateByDay's key below). */
function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** Most recent STREAK_WEEKS full calendar weeks (Sun-Sat), each day tagged
 *  with its combined exercise + DDR count. Reflects all activity regardless
 *  of the Exercise/DDR section toggle, since a streak is about showing up at
 *  all. The window always ends on the Saturday of today's week so the grid
 *  is a whole number of columns -- days after today in that final column are
 *  marked `future` and rendered as blank spacers rather than fabricated
 *  zero-activity cells. */
function useConsistencyStreak(): StreakDay[] {
  const exerciseEntries = useExerciseEntries()
  const ddrEntries = useDdrEntries()

  return useMemo(() => {
    const counts = new Map<string, number>()
    const bump = (iso: string) => {
      const key = dayKey(iso)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    for (const e of exerciseEntries ?? []) bump(e.performed_at)
    for (const e of ddrEntries ?? []) bump(e.performed_at)

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const end = new Date(today)
    end.setDate(end.getDate() + (6 - end.getDay()))
    const start = new Date(end)
    start.setDate(start.getDate() - (STREAK_WEEKS * 7 - 1))

    const days: StreakDay[] = []
    for (let i = 0; i < STREAK_WEEKS * 7; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      days.push({
        date: key,
        iso: d.toISOString(),
        count: counts.get(key) ?? 0,
        future: d.getTime() > today.getTime(),
      })
    }
    return days
  }, [exerciseEntries, ddrEntries])
}

export default function StatsPage() {
  const [section, setSection] = useState<Section>('exercise')
  const [range, setRange] = useState<Range>('all')
  const streak = useConsistencyStreak()

  return (
    <main className="page">
      <h1 className="title">Analytics</h1>

      <section className="card stack">
        <h2 className="subtitle">Consistency</h2>
        <StreakGrid days={streak} />
      </section>

      <div className="seg" role="group" aria-label="Analytics section">
        {(['exercise', 'ddr'] as Section[]).map((s) => (
          <button
            key={s}
            type="button"
            className={`seg-btn ${section === s ? 'seg-btn-active' : ''}`}
            onClick={() => setSection(s)}
          >
            {s === 'exercise' ? 'Exercises' : 'DDR'}
          </button>
        ))}
      </div>

      {section === 'exercise' ? (
        <ExercisePanel range={range} onRangeChange={setRange} />
      ) : (
        <DdrPanel range={range} onRangeChange={setRange} />
      )}
    </main>
  )
}

function ExercisePanel({
  range,
  onRangeChange,
}: {
  range: Range
  onRangeChange: (r: Range) => void
}) {
  const types = useExerciseTypes()
  const entries = useExerciseEntries()

  const [remembered] = useState(readRememberedType)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const fallbackId =
    remembered && types?.some((t) => t.id === remembered) ? remembered : types?.[0]?.id
  const typeId = selectedId ?? fallbackId ?? ''
  const selected = types?.find((t) => t.id === typeId)

  const cutoff = useCutoff(range)

  const scoped = useMemo(() => {
    if (!entries || !selected) return [] as ExerciseEntry[]
    return entries
      .filter((e) => e.exercise_type_id === selected.id)
      .filter((e) => !cutoff || e.performed_at >= cutoff)
      .slice()
      .sort((a, b) => a.performed_at.localeCompare(b.performed_at))
  }, [entries, selected, cutoff])

  const repsPoints = useMemo<Point[]>(
    () =>
      scoped
        .map((e) => ({
          at: e.performed_at,
          // No single reps value for a varied entry, so chart the total
          // across its sets instead -- the standard "volume" reading, and
          // it's just `reps` again in the uniform case.
          value:
            e.reps ?? e.set_details?.reduce((sum, set) => sum + (set.reps ?? 0), 0) ?? null,
        }))
        .filter((p): p is Point => p.value !== null && p.value > 0),
    [scoped],
  )
  const durationPoints = useMemo<Point[]>(
    () =>
      scoped
        .filter((e) => e.duration_seconds !== null)
        .map((e) => ({ at: e.performed_at, value: e.duration_seconds! })),
    [scoped],
  )

  const loading = types === undefined || entries === undefined

  if (loading) return <p className="muted">Loading…</p>

  if (types?.length === 0) {
    return (
      <div className="empty">
        No exercises defined yet.
        <div style={{ marginTop: 16 }}>
          <Link href="/types" className="btn btn-primary">
            Add your first exercise
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <Dropdown
        id="stats-type"
        label="Exercise"
        value={typeId}
        options={(types ?? []).map((type) => ({ value: type.id, label: type.name }))}
        onChange={setSelectedId}
        searchPlaceholder="Search exercises…"
      />

      <RangePicker range={range} onChange={onRangeChange} />

      {selected?.tracks_reps && (
        <>
          <MetricSection title="Reps" points={repsPoints} formatValue={(v) => `${v}`} />
          {repsPoints.length > 0 && (
            <section className="card stack">
              <h2 className="subtitle">Volume</h2>
              <VolumeBarChart points={repsPoints} formatValue={(v) => `${v}`} />
            </section>
          )}
        </>
      )}
      {selected?.tracks_duration && (
        <MetricSection title="Time" points={durationPoints} formatValue={formatDuration} />
      )}
    </>
  )
}

type DdrScope = 'overall' | 'song'

interface DayAgg {
  at: string
  songs: number
  steps: number
  scoreSum: number
}

/** Buckets entries by local calendar day. The synthetic `at` timestamp is
 *  noon on that day, so date formatting downstream never lands on a
 *  neighboring day across a timezone boundary. */
function aggregateByDay(entries: DdrEntry[]) {
  const byDay = new Map<string, DayAgg>()

  for (const entry of entries) {
    const d = new Date(entry.performed_at)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const existing = byDay.get(key)

    if (existing) {
      existing.songs += 1
      existing.steps += entry.difficulty
      existing.scoreSum += entry.percentage_score
    } else {
      byDay.set(key, {
        at: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).toISOString(),
        songs: 1,
        steps: entry.difficulty,
        scoreSum: entry.percentage_score,
      })
    }
  }

  const days = [...byDay.values()].sort((a, b) => a.at.localeCompare(b.at))

  return {
    songs: days.map((d): Point => ({ at: d.at, value: d.songs })),
    // Sums raw difficulty regardless of scale ('old' 1-10 vs 'new' 1-20) — a
    // day mixing both isn't normalized, just added, since there's no official
    // conversion between the two.
    steps: days.map((d): Point => ({ at: d.at, value: d.steps })),
    score: days.map((d): Point => ({
      at: d.at,
      value: Math.round((d.scoreSum / d.songs) * 100) / 100,
    })),
  }
}

function DdrPanel({ range, onRangeChange }: { range: Range; onRangeChange: (r: Range) => void }) {
  const entries = useDdrEntries()
  const songs = useSongs()

  const [scope, setScope] = useState<DdrScope>('overall')
  const [selectedSongKey, setSelectedSongKey] = useState<string | null>(null)

  const songKey = selectedSongKey ?? songs[0]?.title.toLowerCase() ?? ''

  const cutoff = useCutoff(range)

  const scoped = useMemo(() => {
    if (!entries) return [] as DdrEntry[]
    return entries
      .filter((e) => !cutoff || e.performed_at >= cutoff)
      .filter((e) => scope === 'overall' || e.song_title.toLowerCase() === songKey)
  }, [entries, cutoff, scope, songKey])

  const {
    songs: songsPerDay,
    steps: stepsPerDay,
    score: scorePerDay,
  } = useMemo(() => aggregateByDay(scoped), [scoped])

  const loading = entries === undefined

  if (loading) return <p className="muted">Loading…</p>

  if (songs.length === 0) {
    return (
      <div className="empty">
        No DDR sessions logged yet.
        <div style={{ marginTop: 16 }}>
          <Link href="/log/ddr" className="btn btn-primary">
            Log your first session
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="seg" role="group" aria-label="DDR scope">
        {(['overall', 'song'] as DdrScope[]).map((s) => (
          <button
            key={s}
            type="button"
            className={`seg-btn ${scope === s ? 'seg-btn-active' : ''}`}
            onClick={() => setScope(s)}
          >
            {s === 'overall' ? 'Overall' : 'By song'}
          </button>
        ))}
      </div>

      {scope === 'song' && (
        <Dropdown
          id="stats-song"
          label="Song"
          value={songKey}
          options={songs.map((song) => ({ value: song.title.toLowerCase(), label: song.title }))}
          onChange={setSelectedSongKey}
          searchPlaceholder="Search songs…"
        />
      )}

      <RangePicker range={range} onChange={onRangeChange} />

      <MetricSection
        title={scope === 'overall' ? 'Songs' : 'Plays'}
        points={songsPerDay}
        formatValue={(v) => `${v}`}
        formatDate={formatDay}
        pointNoun="day"
      />
      <MetricSection
        title="Steps"
        points={stepsPerDay}
        formatValue={(v) => `${v}`}
        formatDate={formatDay}
        pointNoun="day"
        hint="Sum of each song's difficulty rating (feet) for the day."
      />
      <MetricSection
        title="Score"
        points={scorePerDay}
        formatValue={(v) => `${v}%`}
        formatDate={formatDay}
        pointNoun="day"
        hint="Average score across that day's plays."
      />
    </>
  )
}
