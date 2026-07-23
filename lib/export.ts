/* Export and re-import.
 *
 * Both run entirely against IndexedDB, so they work with the server down or no
 * network at all — which matters, because the JSON export is the disaster
 * recovery path for a self-hosted database. */

import * as local from './local-db'
import { formatDuration } from './format'
import type {
  DdrEntry,
  DdrSong,
  ExerciseEntry,
  ExerciseType,
  WorkoutSession,
  WorkoutTemplate,
} from './types'

export const EXPORT_FORMAT = 'healthtracker-export'
export const EXPORT_VERSION = 1

export interface ExportFile {
  format: typeof EXPORT_FORMAT
  version: number
  exported_at: string
  exercise_types: ExerciseType[]
  workout_templates: WorkoutTemplate[]
  workout_sessions: WorkoutSession[]
  exercise_entries: ExerciseEntry[]
  ddr_entries: DdrEntry[]
  ddr_songs: DdrSong[]
}

/** Drops the local-only sync bookkeeping so the file is portable. */
function clean<T extends object>(rows: (T & { pending?: unknown })[]): T[] {
  return rows.map((row) => {
    const { pending, rejected_reason, ...rest } = row as T & {
      pending?: unknown
      rejected_reason?: unknown
    }
    void pending
    void rejected_reason
    return rest as T
  })
}

export async function buildExport(): Promise<ExportFile> {
  /* Tombstones are included deliberately. Without them, restoring onto a device
   * that still holds a deleted row would silently bring it back — the restore
   * has no way to say "this was removed" and the surviving copy wins on the
   * next sync. A backup that resurrects deleted data isn't a backup. */
  const [types, templates, sessions, exercises, ddr, songs] = await Promise.all([
    local.allIncludingDeleted<ExerciseType>('exercise_types'),
    local.allIncludingDeleted<WorkoutTemplate>('workout_templates'),
    local.allIncludingDeleted<WorkoutSession>('workout_sessions'),
    local.allIncludingDeleted<ExerciseEntry>('exercise_entries'),
    local.allIncludingDeleted<DdrEntry>('ddr_entries'),
    local.songs(),
  ])

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    exercise_types: clean(types),
    workout_templates: clean(templates),
    workout_sessions: clean(sessions),
    exercise_entries: clean(exercises),
    ddr_entries: clean(ddr),
    ddr_songs: songs,
  }
}

// --- CSV ---------------------------------------------------------------------

/** RFC 4180 quoting: wrap when the value contains a delimiter, quote, or
 *  newline, and double any embedded quotes. Notes are free text, so all three
 *  are reachable. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** Byte-order mark. Written as an escape, not a literal character: a literal
 *  BOM is invisible in the source and gets silently stripped by editors and
 *  formatters. Without it Excel reads the file as latin-1 and mangles accents
 *  and Japanese song titles, of which DDR has plenty. */
const BOM = '\uFEFF'

function csvRows(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','))
  return BOM + lines.join('\r\n') + '\r\n'
}

export async function buildExerciseCsv(): Promise<string> {
  const [entries, types] = await Promise.all([
    local.all<ExerciseEntry>('exercise_entries'),
    local.all<ExerciseType>('exercise_types'),
  ])

  // Deleted types are still resolvable so historical entries keep their name.
  const allTypes = await local.allIncludingDeleted<ExerciseType>('exercise_types')
  const nameOf = (id: string) =>
    allTypes.find((t) => t.id === id)?.name ?? types.find((t) => t.id === id)?.name ?? ''

  const sorted = [...entries].sort((a, b) => a.performed_at.localeCompare(b.performed_at))

  return csvRows(
    ['performed_at', 'exercise', 'sets', 'reps', 'duration_seconds', 'duration', 'weight', 'notes'],
    sorted.map((e) => [
      e.performed_at,
      nameOf(e.exercise_type_id),
      e.sets,
      e.reps,
      e.duration_seconds,
      // Both the raw seconds and a readable form: one sorts and sums in a
      // spreadsheet, the other is legible at a glance.
      e.duration_seconds === null ? '' : formatDuration(e.duration_seconds),
      e.weight,
      e.notes,
    ]),
  )
}

export async function buildDdrCsv(): Promise<string> {
  const entries = await local.all<DdrEntry>('ddr_entries')
  const sorted = [...entries].sort((a, b) => a.performed_at.localeCompare(b.performed_at))

  return csvRows(
    [
      'performed_at',
      'song_title',
      'artist',
      'difficulty',
      'difficulty_scale',
      'difficulty_type',
      'percentage_score',
      'song_length_seconds',
      'song_length',
    ],
    sorted.map((d) => [
      d.performed_at,
      d.song_title,
      d.artist,
      d.difficulty,
      d.difficulty_scale,
      d.difficulty_type,
      d.percentage_score,
      d.song_length_seconds,
      d.song_length_seconds === null ? '' : formatDuration(d.song_length_seconds),
    ]),
  )
}

// --- download ----------------------------------------------------------------

export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function timestampedName(base: string, extension: string): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  return `${base}-${stamp}.${extension}`
}

// --- import ------------------------------------------------------------------

export interface ImportResult {
  imported: number
  skipped: number
  songs: number
}

/** Parses and merges an export file. Rows are written through the normal local
 *  path, so they queue for sync and last-write-wins still applies — importing
 *  a stale backup can't roll back newer data on the server. */
export async function importExport(text: string): Promise<ImportResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('That file is not a Health Tracker export.')
  }

  const file = parsed as Partial<ExportFile>
  if (file.format !== EXPORT_FORMAT) {
    throw new Error('That file is not a Health Tracker export.')
  }
  if (typeof file.version !== 'number' || file.version > EXPORT_VERSION) {
    throw new Error(
      `That export is version ${file.version}, newer than this app understands (${EXPORT_VERSION}).`,
    )
  }

  let imported = 0
  let skipped = 0

  const tables = [
    ['exercise_types', file.exercise_types],
    ['workout_templates', file.workout_templates],
    ['workout_sessions', file.workout_sessions],
    ['exercise_entries', file.exercise_entries],
    ['ddr_entries', file.ddr_entries],
  ] as const

  for (const [table, rows] of tables) {
    if (!Array.isArray(rows)) continue
    for (const row of rows) {
      // Shape check only — the sync endpoint does full validation, and a row
      // rejected there surfaces on the entry rather than being lost here.
      if (
        typeof row !== 'object' ||
        row === null ||
        typeof (row as { id?: unknown }).id !== 'string' ||
        typeof (row as { updated_at?: unknown }).updated_at !== 'string'
      ) {
        skipped += 1
        continue
      }
      await local.put(table, row as { id: string })
      imported += 1
    }
  }

  let songs = 0
  if (Array.isArray(file.ddr_songs)) {
    for (const song of file.ddr_songs) {
      if (song && typeof song.title === 'string') {
        await local.rememberSong(song.title)
        songs += 1
      }
    }
  }

  return { imported, skipped, songs }
}
