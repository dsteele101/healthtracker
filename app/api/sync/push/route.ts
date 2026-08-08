import { requireUser } from '@/lib/auth'
import { pool } from '@/lib/db'
import { SYNC_TABLES, type PushResponse, type SyncTable } from '@/lib/types'
import { validate } from '@/lib/validate'

/** exercise_types is shared: one catalog everyone picks from and adds to, with
 *  no owner. Every other table is private and carries user_id. */
const SHARED_TABLES = new Set<SyncTable>(['exercise_types'])

/* Upsert with last-write-wins.
 *
 * The `WHERE ... < EXCLUDED.updated_at` on the DO UPDATE is what makes this
 * safe to retry: re-pushing a row the server already has newer data for is a
 * no-op rather than a regression. A push that got through but whose response
 * was lost — the common offline case — costs nothing on the retry.
 *
 * server_seq is re-stamped on every write so other devices see the change on
 * their next pull.
 *
 * user_id appears in every private table's INSERT list and in none of their
 * DO UPDATE SET lists. Ownership is decided once, when the row first lands, from
 * the identity on the request — there is no sequence of pushes that reassigns
 * it. The `AND <table>.user_id = $2` on the DO UPDATE is a backstop, not the
 * real check; see the ownership preflight in POST for why it cannot be. */
const UPSERTS: Record<SyncTable, string> = {
  exercise_types: `
    INSERT INTO exercise_types
      (id, created_by, name, tracks_reps, tracks_duration, tracks_weight, icon, icon_svg,
       info_url, created_at, updated_at, deleted_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (id) DO UPDATE SET
      name            = EXCLUDED.name,
      tracks_reps     = EXCLUDED.tracks_reps,
      tracks_duration = EXCLUDED.tracks_duration,
      tracks_weight   = EXCLUDED.tracks_weight,
      icon            = EXCLUDED.icon,
      icon_svg        = EXCLUDED.icon_svg,
      info_url        = EXCLUDED.info_url,
      updated_at      = EXCLUDED.updated_at,
      deleted_at      = EXCLUDED.deleted_at,
      server_seq      = nextval('sync_seq')
    WHERE exercise_types.updated_at < EXCLUDED.updated_at
  `,
  exercise_entries: `
    INSERT INTO exercise_entries
      (id, user_id, exercise_type_id, sets, reps, duration_seconds, weight, set_details, notes,
       performed_at, session_id, created_at, updated_at, deleted_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (id) DO UPDATE SET
      exercise_type_id = EXCLUDED.exercise_type_id,
      sets             = EXCLUDED.sets,
      reps             = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      weight           = EXCLUDED.weight,
      set_details      = EXCLUDED.set_details,
      notes            = EXCLUDED.notes,
      performed_at     = EXCLUDED.performed_at,
      session_id       = EXCLUDED.session_id,
      updated_at       = EXCLUDED.updated_at,
      deleted_at       = EXCLUDED.deleted_at,
      server_seq       = nextval('sync_seq')
    WHERE exercise_entries.updated_at < EXCLUDED.updated_at
      AND exercise_entries.user_id = $2
  `,
  ddr_entries: `
    INSERT INTO ddr_entries
      (id, user_id, song_title, artist, difficulty, difficulty_scale, difficulty_type,
       song_length_seconds, percentage_score, photo_path, performed_at, session_id,
       created_at, updated_at, deleted_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    ON CONFLICT (id) DO UPDATE SET
      song_title          = EXCLUDED.song_title,
      artist              = EXCLUDED.artist,
      difficulty          = EXCLUDED.difficulty,
      difficulty_scale    = EXCLUDED.difficulty_scale,
      difficulty_type     = EXCLUDED.difficulty_type,
      song_length_seconds = EXCLUDED.song_length_seconds,
      percentage_score    = EXCLUDED.percentage_score,
      photo_path          = EXCLUDED.photo_path,
      performed_at        = EXCLUDED.performed_at,
      session_id          = EXCLUDED.session_id,
      updated_at          = EXCLUDED.updated_at,
      deleted_at          = EXCLUDED.deleted_at,
      server_seq          = nextval('sync_seq')
    WHERE ddr_entries.updated_at < EXCLUDED.updated_at
      AND ddr_entries.user_id = $2
  `,
  workout_templates: `
    INSERT INTO workout_templates
      (id, user_id, name, items, created_at, updated_at, deleted_at)
    VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
    ON CONFLICT (id) DO UPDATE SET
      name       = EXCLUDED.name,
      items      = EXCLUDED.items,
      updated_at = EXCLUDED.updated_at,
      deleted_at = EXCLUDED.deleted_at,
      server_seq = nextval('sync_seq')
    WHERE workout_templates.updated_at < EXCLUDED.updated_at
      AND workout_templates.user_id = $2
  `,
  workout_sessions: `
    INSERT INTO workout_sessions
      (id, user_id, name, template_id, started_at, ended_at, notes, created_at, updated_at, deleted_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (id) DO UPDATE SET
      name        = EXCLUDED.name,
      template_id = EXCLUDED.template_id,
      started_at  = EXCLUDED.started_at,
      ended_at    = EXCLUDED.ended_at,
      notes       = EXCLUDED.notes,
      updated_at  = EXCLUDED.updated_at,
      deleted_at  = EXCLUDED.deleted_at,
      server_seq  = nextval('sync_seq')
    WHERE workout_sessions.updated_at < EXCLUDED.updated_at
      AND workout_sessions.user_id = $2
  `,
}

/* exercise_types is shared, so anyone may add one or correct its details. The
 * one thing that is not shared is the ability to retire it: a movement other
 * people have logged against should not vanish from their screens because
 * somebody else tidied up. Rows created before this became multi-user have a
 * NULL created_by and belong to the original catalog, which nobody may delete.
 *
 * Editing is still open. This blocks exactly the irreversible-looking action. */
const CAN_DELETE_TYPE = `
  SELECT id FROM exercise_types
   WHERE id = ANY($1::uuid[])
     AND deleted_at IS NULL
     AND (created_by IS NULL OR created_by <> $2)
`

/* `userId` is a separate argument rather than a field read off `row`, and that
 * is the entire mechanism preventing a caller from writing rows into somebody
 * else's account. `row` here is the validator's output — lib/validate.ts builds
 * a fresh object literal out of named fields, so a `user_id` sent by the client
 * never reaches this function to be read. Keeping it out of the row type
 * (lib/types.ts) means the compiler will not let that change by accident. */
function params(table: SyncTable, row: Record<string, unknown>, userId: string): unknown[] {
  switch (table) {
    case 'exercise_types':
      return [
        row.id, userId, row.name, row.tracks_reps, row.tracks_duration, row.tracks_weight,
        row.icon, row.icon_svg, row.info_url, row.created_at, row.updated_at, row.deleted_at,
      ]
    case 'exercise_entries':
      // JSON.stringify(null) is the string "null", which through ::jsonb
      // becomes a JSON null rather than SQL NULL -- guard it explicitly so
      // the exclusivity CHECK and every `IS NULL` reader stay correct.
      return [
        row.id, userId, row.exercise_type_id, row.sets, row.reps, row.duration_seconds,
        row.weight, row.set_details === null ? null : JSON.stringify(row.set_details),
        row.notes, row.performed_at, row.session_id, row.created_at,
        row.updated_at, row.deleted_at,
      ]
    case 'ddr_entries':
      return [
        row.id, userId, row.song_title, row.artist, row.difficulty, row.difficulty_scale,
        row.difficulty_type, row.song_length_seconds, row.percentage_score, row.photo_path,
        row.performed_at, row.session_id, row.created_at, row.updated_at, row.deleted_at,
      ]
    case 'workout_templates':
      // pg does not serialize array/object params for jsonb columns itself.
      return [
        row.id, userId, row.name, JSON.stringify(row.items), row.created_at, row.updated_at,
        row.deleted_at,
      ]
    case 'workout_sessions':
      return [
        row.id, userId, row.name, row.template_id, row.started_at, row.ended_at, row.notes,
        row.created_at, row.updated_at, row.deleted_at,
      ]
  }
}

/* Turn the constraint violations a person can actually cause into something
 * worth reading. These land in rejected_reason and are shown on the row itself,
 * so "duplicate key value violates unique constraint exercise_types_name_unique"
 * is a dead end for the one person who most needs to act on it.
 *
 * Both cases below became reachable when the app went multi-user: the catalog is
 * shared, so two people adding "Plank" from separate phones now collide where
 * previously it took two of your own devices. Anything unrecognised keeps the
 * raw message, which is still better than swallowing it. */
function explain(error: unknown, table: SyncTable, row: Record<string, unknown>): string {
  const code = (error as { code?: string } | null)?.code

  if (code === '23505' && table === 'exercise_types') {
    return `An exercise called "${row.name}" already exists — rename this one to keep both.`
  }
  if (code === '23503' && (table === 'exercise_entries' || table === 'ddr_entries')) {
    // Composite (session_id, user_id) foreign key, so this is either a session
    // that hasn't synced yet or one belonging to somebody else.
    return 'The workout this belongs to is missing, or belongs to another account.'
  }

  return error instanceof Error ? error.message : 'database rejected row'
}

export async function POST(request: Request) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response
  const userId = auth.user.id

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const rejected: PushResponse['rejected'] = []
  const client = await pool.connect()

  try {
    // One transaction for the whole push: a batch either lands or it doesn't,
    // so a partial failure can't leave an entry referencing a type that never
    // made it. Rejected rows are reported, not rolled back into.
    await client.query('BEGIN')

    for (const table of SYNC_TABLES) {
      const rows = body[table]
      if (rows === undefined) continue
      if (!Array.isArray(rows)) {
        await client.query('ROLLBACK')
        return Response.json({ error: `${table} must be an array` }, { status: 400 })
      }

      const valid: Record<string, unknown>[] = []
      for (const raw of rows) {
        const result = validate(table, raw)
        if (result.ok) {
          valid.push(result.value)
        } else {
          const id = typeof raw?.id === 'string' ? raw.id : 'unknown'
          rejected.push({ table, id, reason: result.reason })
        }
      }
      if (valid.length === 0) continue

      const ids = valid.map((row) => String(row.id))

      /* Ownership is checked here, before any write, rather than being left to
       * the `AND <table>.user_id = $2` guard on the upsert.
       *
       * That guard alone would make an attempt to overwrite someone else's row
       * affect zero rows — silently. And zero rows is exactly what a legitimate
       * stale push produces too, the ordinary case of a retry arriving after
       * newer data. The two are indistinguishable afterwards, so the client
       * would mark a write that never happened as synced and drop it from the
       * outbox. Reading first is the only way to tell them apart.
       *
       * On `client`, not `query`, so this shares the push's transaction and
       * snapshot. The guard on the upsert stays as a backstop for the narrow
       * race between this SELECT and the INSERT: it fails closed, and the row
       * comes back on the next push to be rejected properly. */
      const owners = new Map<string, string>()
      if (!SHARED_TABLES.has(table)) {
        const existing = await client.query<{ id: string; user_id: string }>(
          `SELECT id, user_id FROM ${table} WHERE id = ANY($1::uuid[])`,
          [ids],
        )
        for (const row of existing.rows) owners.set(row.id, row.user_id)
      }

      /* Deleting from the shared catalog is the one thing an account may not do
       * to a row it did not create. See CAN_DELETE_TYPE. */
      const undeletable = new Set<string>()
      if (table === 'exercise_types') {
        const deleting = valid.filter((row) => row.deleted_at != null).map((row) => String(row.id))
        if (deleting.length > 0) {
          const blocked = await client.query<{ id: string }>(CAN_DELETE_TYPE, [deleting, userId])
          for (const row of blocked.rows) undeletable.add(row.id)
        }
      }

      for (const row of valid) {
        const id = String(row.id)

        const owner = owners.get(id)
        if (owner !== undefined && owner !== userId) {
          rejected.push({ table, id, reason: 'that row belongs to another account' })
          continue
        }
        if (undeletable.has(id)) {
          rejected.push({
            table,
            id,
            reason: 'that exercise was added by someone else, so it can\'t be deleted here',
          })
          continue
        }

        /* Each row gets a SAVEPOINT. Without one, a single constraint
         * violation aborts the whole transaction and every subsequent
         * statement fails with "current transaction is aborted" — one bad row
         * would take down the entire push. */
        await client.query('SAVEPOINT row')
        try {
          await client.query(UPSERTS[table], params(table, row, userId))
          await client.query('RELEASE SAVEPOINT row')
        } catch (error) {
          await client.query('ROLLBACK TO SAVEPOINT row')
          // A constraint the validator can't see from one row alone — most
          // likely an entry whose exercise type hasn't synced yet. Report it so
          // the client stops retrying blindly.
          rejected.push({ table, id, reason: explain(error, table, row) })
        }
      }
    }

    const { rows } = await client.query<{ cursor: string }>(
      "SELECT last_value::text AS cursor FROM sync_seq",
    )
    await client.query('COMMIT')

    const response: PushResponse = { cursor: rows[0]?.cursor ?? '0', rejected }
    return Response.json(response)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('sync push failed:', error)
    return Response.json({ error: 'push failed' }, { status: 500 })
  } finally {
    client.release()
  }
}
