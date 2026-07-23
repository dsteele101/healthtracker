'use client'

import { useEffect, useState } from 'react'
import * as local from '@/lib/local-db'
import { pendingCount, sync } from '@/lib/sync'
import type { DdrEntry, ExerciseEntry, ExerciseType } from '@/lib/types'

interface Result {
  label: string
  ok: boolean
  detail?: string
}

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString()

function makeType(overrides: Partial<ExerciseType> = {}): ExerciseType {
  const id = crypto.randomUUID()
  return {
    id,
    name: `Type ${id.slice(0, 8)}`,
    tracks_reps: true,
    tracks_duration: false,
    tracks_weight: false,
    icon: null,
    info_url: null,
    created_at: iso(),
    updated_at: iso(),
    deleted_at: null,
    ...overrides,
  }
}

function makeEntry(typeId: string, overrides: Partial<ExerciseEntry> = {}): ExerciseEntry {
  return {
    id: crypto.randomUUID(),
    exercise_type_id: typeId,
    sets: 1,
    reps: 10,
    duration_seconds: null,
    weight: null,
    notes: null,
    performed_at: iso(),
    session_id: null,
    created_at: iso(),
    updated_at: iso(),
    deleted_at: null,
    ...overrides,
  }
}

function makeDdr(overrides: Partial<DdrEntry> = {}): DdrEntry {
  return {
    id: crypto.randomUUID(),
    song_title: 'Butterfly',
    artist: null,
    difficulty: 8,
    difficulty_scale: 'old',
    difficulty_type: null,
    song_length_seconds: 100,
    percentage_score: 91.5,
    photo_path: null,
    performed_at: iso(),
    session_id: null,
    created_at: iso(),
    updated_at: iso(),
    deleted_at: null,
    ...overrides,
  }
}

async function runTests(): Promise<Result[]> {
  const results: Result[] = []
  const check = (label: string, ok: boolean, detail?: string) =>
    results.push({ label, ok, detail })

  // Fresh store every run so results don't depend on previous runs.
  await local.wipe()

  // --- local writes ---------------------------------------------------------
  const type = makeType()
  await local.put('exercise_types', type)

  const stored = await local.get<ExerciseType>('exercise_types', type.id)
  check('put() stores the row', stored?.id === type.id)
  check('put() marks it pending', stored?.pending === 1, `pending=${stored?.pending}`)

  const outbox = await local.pending()
  check('pending() finds the row', outbox.exercise_types.length === 1)
  check(
    'pending() strips local bookkeeping before the wire',
    outbox.exercise_types[0] !== undefined &&
      !('pending' in outbox.exercise_types[0]),
  )

  await local.markSynced('exercise_types', [type.id])
  const afterSync = await local.get<ExerciseType>('exercise_types', type.id)
  check('markSynced() clears pending', afterSync?.pending === 0)
  check('outbox is empty afterwards', (await pendingCount()) === 0)

  // --- last-write-wins on merge --------------------------------------------
  await local.mergeFromServer({
    exercise_types: [{ ...type, name: 'NEWER FROM SERVER', updated_at: iso(60_000) }],
    exercise_entries: [],
    ddr_entries: [],
  })
  const merged = await local.get<ExerciseType>('exercise_types', type.id)
  check('newer server row wins', merged?.name === 'NEWER FROM SERVER', merged?.name)

  await local.mergeFromServer({
    exercise_types: [{ ...type, name: 'STALE FROM SERVER', updated_at: iso(-60_000) }],
    exercise_entries: [],
    ddr_entries: [],
  })
  const notClobbered = await local.get<ExerciseType>('exercise_types', type.id)
  check('older server row loses', notClobbered?.name === 'NEWER FROM SERVER', notClobbered?.name)

  // The case that loses data if it's wrong: an edit made offline must survive a
  // pull that happens before it has been pushed.
  await local.put('exercise_types', { ...type, name: 'LOCAL EDIT', updated_at: iso() })
  await local.mergeFromServer({
    exercise_types: [{ ...type, name: 'SERVER WINS?', updated_at: iso(120_000) }],
    exercise_entries: [],
    ddr_entries: [],
  })
  const localWins = await local.get<ExerciseType>('exercise_types', type.id)
  check(
    'unpushed local edit survives a pull',
    localWins?.name === 'LOCAL EDIT',
    localWins?.name,
  )
  check('and stays queued', localWins?.pending === 1)

  // --- tombstones -----------------------------------------------------------
  await local.markSynced('exercise_types', [type.id])
  const entry = makeEntry(type.id)
  await local.put('exercise_entries', entry)
  await local.markSynced('exercise_entries', [entry.id])

  await local.remove('exercise_entries', entry.id)
  const removed = await local.get<ExerciseEntry>('exercise_entries', entry.id)
  check('remove() soft-deletes rather than dropping', removed !== undefined)
  check('tombstone has deleted_at', removed?.deleted_at != null)
  check('tombstone is queued for push', removed?.pending === 1)

  const visible = await local.all<ExerciseEntry>('exercise_entries')
  check('all() hides tombstones from the UI', !visible.some((e) => e.id === entry.id))

  const outboxWithTombstone = await local.pending()
  check(
    'tombstone still goes out on the next push',
    outboxWithTombstone.exercise_entries.some((e) => e.id === entry.id),
  )

  // --- rejection handling ---------------------------------------------------
  await local.markRejected('exercise_entries', entry.id, 'test reason')
  const rejected = await local.get<ExerciseEntry>('exercise_entries', entry.id)
  check('rejected row records the reason', rejected?.rejected_reason === 'test reason')
  check(
    'rejected row leaves the queue so it cannot wedge it',
    rejected?.pending === 0,
    `pending=${rejected?.pending}`,
  )

  // --- song corpus ----------------------------------------------------------
  await local.rememberSong('MAX 300')
  await local.rememberSong('MAX 300')
  await local.rememberSong('  MAX 300  ')
  await local.rememberSong('Butterfly')
  const songs = await local.songs()
  check(
    'song corpus dedupes and trims',
    songs.length === 2,
    songs.map((s) => `"${s.title}"`).join(', '),
  )
  await local.rememberSong('   ')
  check('blank song title ignored', (await local.songs()).length === 2)

  // --- cursor ---------------------------------------------------------------
  check('cursor starts at 0', (await local.getCursor()) === '0')
  await local.setCursor('42')
  check('cursor persists', (await local.getCursor()) === '42')
  await local.setCursor('0')

  // --- full round trip against the real server ------------------------------
  const freshType = makeType({ name: `Roundtrip ${crypto.randomUUID().slice(0, 8)}` })
  await local.put('exercise_types', freshType)
  await local.put('ddr_entries', makeDdr({ song_title: 'ROUNDTRIP SONG' }))

  const outcome = await sync()
  check(
    'sync() reports success',
    outcome.status === 'synced',
    JSON.stringify(outcome),
  )
  check('sync() drains the outbox', (await pendingCount()) === 0)
  check(
    'cursor advanced after sync',
    (await local.getCursor()) !== '0',
    await local.getCursor(),
  )

  // A second device would see this row; simulate by wiping locally and pulling.
  await local.wipe()
  const second = await sync()
  check('re-sync from empty store succeeds', second.status === 'synced')
  const pulledTypes = await local.all<ExerciseType>('exercise_types')
  check(
    'row written by the first device arrives on the second',
    pulledTypes.some((t) => t.id === freshType.id),
    `${pulledTypes.length} types pulled`,
  )
  const pulledDdr = await local.all<DdrEntry>('ddr_entries')
  check(
    'ddr entries arrive too',
    pulledDdr.some((d) => d.song_title === 'ROUNDTRIP SONG'),
    `${pulledDdr.length} ddr rows pulled`,
  )
  check(
    'pulled rows are not marked pending',
    pulledDdr.every((d) => d.pending === 0),
  )

  return results
}

export function SyncTestHarness() {
  const [results, setResults] = useState<Result[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Handles for driving failure paths (server down, expired Access session)
    // from the console, which the scripted run above can't reach on its own.
    Object.assign(window, { __local: local, __sync: { sync, pendingCount } })

    runTests()
      .then(setResults)
      .catch((e) => setError(e instanceof Error ? `${e.message}\n${e.stack}` : String(e)))
  }, [])

  const passed = results?.filter((r) => r.ok).length ?? 0
  const failed = results?.filter((r) => !r.ok).length ?? 0

  return (
    <main style={{ padding: 24, fontFamily: 'ui-monospace, monospace', maxWidth: 760 }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: 16 }}>Sync harness</h1>

      {error && (
        <pre id="harness-error" style={{ color: 'var(--danger)', whiteSpace: 'pre-wrap' }}>
          {error}
        </pre>
      )}

      {!results && !error && <p>running…</p>}

      {results && (
        <>
          <p id="harness-summary" style={{ marginBottom: 12 }}>
            {passed} passed, {failed} failed
          </p>
          <ul style={{ listStyle: 'none', display: 'grid', gap: 4 }}>
            {results.map((r, i) => (
              <li key={i} style={{ color: r.ok ? 'var(--ok)' : 'var(--danger)' }}>
                {r.ok ? 'ok  ' : 'FAIL'} {r.label}
                {r.detail && !r.ok ? ` — ${r.detail}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
