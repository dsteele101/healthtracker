/* Validation for rows arriving at the sync endpoint.
 *
 * Single-user app, but the client is a browser store that survives schema
 * changes and partial writes. A malformed row should be reported back and
 * quarantined, not written or silently dropped. */

import type { DdrEntry, ExerciseEntry, ExerciseType, SyncTable } from './types'

export type Validated<T> = { ok: true; value: T } | { ok: false; reason: string }

type Row = Record<string, unknown>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function uuid(row: Row, field: string): string {
  const value = row[field]
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new Error(`${field} must be a UUID`)
  }
  return value
}

function iso(row: Row, field: string): string {
  const value = row[field]
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be an ISO timestamp`)
  }
  return new Date(value).toISOString()
}

function isoOrNull(row: Row, field: string): string | null {
  if (row[field] == null) return null
  return iso(row, field)
}

function text(row: Row, field: string, max: number): string {
  const value = row[field]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} is required`)
  }
  if (value.length > max) throw new Error(`${field} exceeds ${max} characters`)
  return value.trim()
}

function textOrNull(row: Row, field: string, max: number): string | null {
  if (row[field] == null || row[field] === '') return null
  return text(row, field, max)
}

function bool(row: Row, field: string): boolean {
  const value = row[field]
  if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`)
  return value
}

function intOrNull(row: Row, field: string, min: number, max: number): number | null {
  if (row[field] == null) return null
  const value = row[field]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${field} must be a whole number`)
  }
  if (value < min || value > max) throw new Error(`${field} must be between ${min} and ${max}`)
  return value
}

function int(row: Row, field: string, min: number, max: number): number {
  if (row[field] == null) throw new Error(`${field} is required`)
  return intOrNull(row, field, min, max) as number
}

function numberOrNull(row: Row, field: string, min: number, max: number): number | null {
  if (row[field] == null) return null
  const value = row[field]
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${field} must be a number`)
  }
  if (value < min || value > max) throw new Error(`${field} must be between ${min} and ${max}`)
  return Math.round(value * 100) / 100
}

function uuidOrNull(row: Row, field: string): string | null {
  if (row[field] == null) return null
  return uuid(row, field)
}

function wrap<T>(fn: () => T): Validated<T> {
  try {
    return { ok: true, value: fn() }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'invalid row' }
  }
}

function validateExerciseType(row: Row): Validated<ExerciseType> {
  return wrap(() => ({
    id: uuid(row, 'id'),
    name: text(row, 'name', 120),
    tracks_reps: bool(row, 'tracks_reps'),
    tracks_duration: bool(row, 'tracks_duration'),
    // Generous for multi-codepoint emoji (skin tone modifiers, ZWJ sequences)
    // without allowing an actual icon-length string in.
    icon: textOrNull(row, 'icon', 16),
    created_at: iso(row, 'created_at'),
    updated_at: iso(row, 'updated_at'),
    deleted_at: isoOrNull(row, 'deleted_at'),
  }))
}

function validateExerciseEntry(row: Row): Validated<ExerciseEntry> {
  return wrap(() => {
    const reps = intOrNull(row, 'reps', 0, 100_000)
    const duration = intOrNull(row, 'duration_seconds', 0, 86_400)
    // A log line recording neither a count nor a time isn't a workout, it's an
    // empty row — reject rather than store something meaningless.
    if (reps === null && duration === null && !row.notes) {
      throw new Error('entry needs reps, a duration, or a note')
    }
    return {
      id: uuid(row, 'id'),
      exercise_type_id: uuid(row, 'exercise_type_id'),
      sets: int(row, 'sets', 1, 1000),
      reps,
      duration_seconds: duration,
      weight: numberOrNull(row, 'weight', 0, 10_000),
      notes: textOrNull(row, 'notes', 2000),
      performed_at: iso(row, 'performed_at'),
      session_id: uuidOrNull(row, 'session_id'),
      created_at: iso(row, 'created_at'),
      updated_at: iso(row, 'updated_at'),
      deleted_at: isoOrNull(row, 'deleted_at'),
    }
  })
}

function validateDdrEntry(row: Row): Validated<DdrEntry> {
  return wrap(() => {
    const scale = row.difficulty_scale
    if (scale !== 'old' && scale !== 'new') {
      throw new Error("difficulty_scale must be 'old' or 'new'")
    }
    // The two scales have different ceilings: 1-10 before DDR X, 1-20 after.
    // Checking against the active scale catches a mis-set toggle at entry time,
    // which the column's 1-20 check constraint alone would let through.
    const maxDifficulty = scale === 'old' ? 10 : 20
    const difficulty = int(row, 'difficulty', 1, maxDifficulty)

    const score = row.percentage_score
    if (typeof score !== 'number' || Number.isNaN(score) || score < 0 || score > 100) {
      throw new Error('percentage_score must be between 0 and 100')
    }

    return {
      id: uuid(row, 'id'),
      song_title: text(row, 'song_title', 300),
      difficulty,
      difficulty_scale: scale,
      song_length_seconds: intOrNull(row, 'song_length_seconds', 1, 3600),
      // Two decimals is what the results screen shows and what the column holds.
      percentage_score: Math.round(score * 100) / 100,
      photo_path: textOrNull(row, 'photo_path', 500),
      performed_at: iso(row, 'performed_at'),
      session_id: uuidOrNull(row, 'session_id'),
      created_at: iso(row, 'created_at'),
      updated_at: iso(row, 'updated_at'),
      deleted_at: isoOrNull(row, 'deleted_at'),
    }
  })
}

const VALIDATORS = {
  exercise_types: validateExerciseType,
  exercise_entries: validateExerciseEntry,
  ddr_entries: validateDdrEntry,
} as const

export function validate(table: SyncTable, row: unknown): Validated<Row> {
  if (typeof row !== 'object' || row === null) {
    return { ok: false, reason: 'row must be an object' }
  }
  return VALIDATORS[table](row as Row) as Validated<Row>
}
