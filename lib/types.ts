/** Shapes shared by the client store, the sync endpoints, and the forms. */

/** ISO 8601 timestamp string. */
export type Iso = string

export type DifficultyScale = 'old' | 'new'

/** Fields every syncable row carries. */
interface Syncable {
  id: string
  created_at: Iso
  /** Set by the client at edit time. Drives last-write-wins. */
  updated_at: Iso
  /** Soft delete, so removals propagate instead of being resurrected. */
  deleted_at: Iso | null
}

export interface ExerciseType extends Syncable {
  name: string
  /** Whether the entry form should ask for reps (a pull-up) ... */
  tracks_reps: boolean
  /** ... or for time (a plank). Both may be true. */
  tracks_duration: boolean
  /** Single emoji shown on the type's entries. Null falls back to a generic icon. */
  icon: string | null
}

export interface ExerciseEntry extends Syncable {
  exercise_type_id: string
  sets: number
  reps: number | null
  duration_seconds: number | null
  notes: string | null
  performed_at: Iso
  session_id: string | null
}

export interface DdrEntry extends Syncable {
  song_title: string
  /** Numeric foot rating; range depends on difficulty_scale. */
  difficulty: number
  /** 'old' = 1-10 scale, 'new' = 1-20 scale. */
  difficulty_scale: DifficultyScale
  song_length_seconds: number | null
  percentage_score: number
  photo_path: string | null
  performed_at: Iso
  session_id: string | null
}

export interface DdrSong {
  id: string
  title: string
  last_seen_at: Iso
  created_at: Iso
}

/** The three tables that participate in sync, keyed by store name. */
export interface SyncPayload {
  exercise_types: ExerciseType[]
  exercise_entries: ExerciseEntry[]
  ddr_entries: DdrEntry[]
}

export type SyncTable = keyof SyncPayload

export const SYNC_TABLES: SyncTable[] = [
  // Order matters on push: entries carry a foreign key to types, so a type has
  // to land before an entry that references it.
  'exercise_types',
  'exercise_entries',
  'ddr_entries',
]

export interface PullResponse extends SyncPayload {
  /** Cursor to pass to the next pull. */
  cursor: string
}

export interface PushResponse {
  /** Highest server_seq written, so the client can skip re-pulling its own writes. */
  cursor: string
  /** Rows the server rejected, with why. Kept local and flagged, never silently dropped. */
  rejected: { table: SyncTable; id: string; reason: string }[]
}

export function emptyPayload(): SyncPayload {
  return { exercise_types: [], exercise_entries: [], ddr_entries: [] }
}
