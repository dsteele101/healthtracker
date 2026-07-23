'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import * as local from './local-db'
import { startAutoSync, pendingCount, sync, type SyncOutcome } from './sync'
import type {
  DdrEntry,
  DdrSong,
  ExerciseEntry,
  ExerciseType,
  SyncTable,
  WorkoutSession,
  WorkoutTemplate,
} from './types'

/** Re-renders whenever anything in the local store changes. */
function useStoreVersion(): number {
  return useSyncExternalStore(
    local.subscribe,
    local.getVersion,
    // The store lives in IndexedDB, which does not exist during SSR. A stable
    // server snapshot keeps hydration quiet; real data arrives on mount.
    () => 0,
  )
}

/** Loads a table, re-reading on every local change. */
function useTable<T extends { deleted_at: string | null }>(
  table: SyncTable,
): local.Local<T>[] | undefined {
  const version = useStoreVersion()
  const [rows, setRows] = useState<local.Local<T>[]>()

  useEffect(() => {
    let cancelled = false
    local
      .all<T>(table)
      .then((result) => {
        if (!cancelled) setRows(result)
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
    return () => {
      cancelled = true
    }
  }, [table, version])

  return rows
}

/** Exercise types, newest-used first. `undefined` while loading. */
export function useExerciseTypes(): local.Local<ExerciseType>[] | undefined {
  const rows = useTable<ExerciseType>('exercise_types')
  return rows?.sort((a, b) => a.name.localeCompare(b.name))
}

export function useExerciseEntries(): local.Local<ExerciseEntry>[] | undefined {
  const rows = useTable<ExerciseEntry>('exercise_entries')
  return rows?.sort((a, b) => b.performed_at.localeCompare(a.performed_at))
}

export function useDdrEntries(): local.Local<DdrEntry>[] | undefined {
  const rows = useTable<DdrEntry>('ddr_entries')
  return rows?.sort((a, b) => b.performed_at.localeCompare(a.performed_at))
}

/** Workout templates (routines), alphabetical -- mirrors useExerciseTypes(). */
export function useWorkoutTemplates(): local.Local<WorkoutTemplate>[] | undefined {
  const rows = useTable<WorkoutTemplate>('workout_templates')
  return rows?.sort((a, b) => a.name.localeCompare(b.name))
}

/** Workout sessions, most recently started first — so the active one (if any)
 *  leads and "recent sessions" reads naturally on a picker. */
export function useWorkoutSessions(): local.Local<WorkoutSession>[] | undefined {
  const rows = useTable<WorkoutSession>('workout_sessions')
  return rows?.sort((a, b) => b.started_at.localeCompare(a.started_at))
}

/** The session in progress right now, if any -- derived from the data rather
 *  than a separate client-only flag, so it's already synced and can never
 *  drift from the row it describes. `ended_at === null` is the only signal:
 *  see 010_workout_sessions.sql. Most-recently-started wins if more than one
 *  device left a session open at once. */
export function useActiveSession(): local.Local<WorkoutSession> | undefined {
  const sessions = useWorkoutSessions()
  return sessions?.find((session) => session.ended_at === null)
}

/**
 * Song titles seen before, most recently played first. Feeds the entry form's
 * suggestions and photo-import fuzzy matching.
 *
 * Built from the DDR entries themselves, not just the local `ddr_songs` store.
 * That store never syncs, so on a fresh device — a new phone, or after clearing
 * browser data — it would be empty and photo import would have nothing to match
 * against until enough songs had been re-entered by hand. Entries do sync, so
 * deriving from them means the corpus arrives with the data.
 *
 * The `ddr_songs` store is still merged in, because an imported backup can
 * carry titles whose entries were later deleted.
 */
export function useSongs(): DdrSong[] {
  const version = useStoreVersion()
  const [rows, setRows] = useState<DdrSong[]>([])

  useEffect(() => {
    let cancelled = false

    Promise.all([local.songs(), local.all<DdrEntry>('ddr_entries')])
      .then(([stored, entries]) => {
        if (cancelled) return

        // Keyed case-insensitively so "max 300" and "MAX 300" don't both show.
        const byKey = new Map<string, DdrSong>()

        for (const song of stored) {
          byKey.set(song.title.toLowerCase(), song)
        }

        for (const entry of entries) {
          const key = entry.song_title.toLowerCase()
          const existing = byKey.get(key)
          if (!existing) {
            byKey.set(key, {
              id: entry.id,
              title: entry.song_title,
              last_seen_at: entry.performed_at,
              created_at: entry.created_at,
            })
          } else if (entry.performed_at > existing.last_seen_at) {
            byKey.set(key, { ...existing, last_seen_at: entry.performed_at })
          }
        }

        setRows(
          [...byKey.values()].sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at)),
        )
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })

    return () => {
      cancelled = true
    }
  }, [version])

  return rows
}

export interface SyncState {
  outcome: SyncOutcome | null
  queued: number
  syncing: boolean
  syncNow: () => void
}

/** Drives the sync indicator and the manual retry button. */
export function useSync(): SyncState {
  const version = useStoreVersion()
  const [outcome, setOutcome] = useState<SyncOutcome | null>(null)
  const [queued, setQueued] = useState(0)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => startAutoSync(setOutcome), [])

  useEffect(() => {
    let cancelled = false
    pendingCount().then((n) => {
      if (!cancelled) setQueued(n)
    })
    return () => {
      cancelled = true
    }
  }, [version, outcome])

  const syncNow = useCallback(() => {
    setSyncing(true)
    void sync()
      .then(setOutcome)
      .finally(() => setSyncing(false))
  }, [])

  return { outcome, queued, syncing, syncNow }
}
