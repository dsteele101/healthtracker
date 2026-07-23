/** Shapes shared by the client store, the sync endpoints, and the forms. */

/** ISO 8601 timestamp string. */
export type Iso = string

export type DifficultyScale = 'old' | 'new'

/** 1-10 before DDR X, 1-20 after. */
export const MAX_DIFFICULTY: Record<DifficultyScale, number> = { old: 10, new: 20 }

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
  /** ... or for weight (a loaded squat). Independent of reps/duration. */
  tracks_weight: boolean
  /** Single emoji shown on the type's entries. Null falls back to a generic icon. */
  icon: string | null
  /** Optional link to a video or article explaining the exercise, shown on its detail page. */
  info_url: string | null
}

export interface ExerciseEntry extends Syncable {
  exercise_type_id: string
  sets: number
  reps: number | null
  duration_seconds: number | null
  weight: number | null
  notes: string | null
  performed_at: Iso
  session_id: string | null
}

export interface DdrEntry extends Syncable {
  song_title: string
  /** The song's credited artist/composer, as printed on the results screen. */
  artist: string | null
  /** Numeric foot rating; range depends on difficulty_scale. */
  difficulty: number
  /** 'old' = 1-10 scale, 'new' = 1-20 scale. */
  difficulty_scale: DifficultyScale
  /** Difficulty name as printed (Beginner, Hard, Expert, etc.) — free text,
   *  since it varies by game/theme rather than following one fixed set. */
  difficulty_type: string | null
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

/** One planned exercise within a WorkoutTemplate. No identity of its own —
 *  it only ever exists as part of the template's `items` array. */
export interface WorkoutTemplateItem {
  exercise_type_id: string
  target_sets: number | null
  target_reps: number | null
  target_duration_seconds: number | null
  notes: string | null
}

/** A reusable named routine (e.g. "Leg Day") a session can be started from. */
export interface WorkoutTemplate extends Syncable {
  name: string
  items: WorkoutTemplateItem[]
}

/** A grouping of entries logged together, optionally started from a template.
 *  `ended_at === null` means it's still in progress -- the only signal
 *  "active session" needs, so there's no separate status flag anywhere. */
export interface WorkoutSession extends Syncable {
  name: string | null
  template_id: string | null
  started_at: Iso
  ended_at: Iso | null
  notes: string | null
}

/** The five tables that participate in sync, keyed by store name. */
export interface SyncPayload {
  exercise_types: ExerciseType[]
  workout_templates: WorkoutTemplate[]
  workout_sessions: WorkoutSession[]
  exercise_entries: ExerciseEntry[]
  ddr_entries: DdrEntry[]
}

export type SyncTable = keyof SyncPayload

export const SYNC_TABLES: SyncTable[] = [
  // Order matters on push: entries carry a foreign key to types, so a type has
  // to land before an entry that references it. Same reasoning chains
  // templates -> sessions -> entries: a session may reference a template, and
  // an entry may reference a session.
  'exercise_types',
  'workout_templates',
  'workout_sessions',
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
  return {
    exercise_types: [],
    workout_templates: [],
    workout_sessions: [],
    exercise_entries: [],
    ddr_entries: [],
  }
}
