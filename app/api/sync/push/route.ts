import { pool } from '@/lib/db'
import { SYNC_TABLES, type PushResponse, type SyncTable } from '@/lib/types'
import { validate } from '@/lib/validate'

/* Upsert with last-write-wins.
 *
 * The `WHERE ... < EXCLUDED.updated_at` on the DO UPDATE is what makes this
 * safe to retry: re-pushing a row the server already has newer data for is a
 * no-op rather than a regression. A push that got through but whose response
 * was lost — the common offline case — costs nothing on the retry.
 *
 * server_seq is re-stamped on every write so other devices see the change on
 * their next pull. */
const UPSERTS: Record<SyncTable, string> = {
  exercise_types: `
    INSERT INTO exercise_types
      (id, name, tracks_reps, tracks_duration, tracks_weight, icon, info_url, created_at, updated_at, deleted_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (id) DO UPDATE SET
      name            = EXCLUDED.name,
      tracks_reps     = EXCLUDED.tracks_reps,
      tracks_duration = EXCLUDED.tracks_duration,
      tracks_weight   = EXCLUDED.tracks_weight,
      icon            = EXCLUDED.icon,
      info_url        = EXCLUDED.info_url,
      updated_at      = EXCLUDED.updated_at,
      deleted_at      = EXCLUDED.deleted_at,
      server_seq      = nextval('sync_seq')
    WHERE exercise_types.updated_at < EXCLUDED.updated_at
  `,
  exercise_entries: `
    INSERT INTO exercise_entries
      (id, exercise_type_id, sets, reps, duration_seconds, weight, notes, performed_at,
       session_id, created_at, updated_at, deleted_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (id) DO UPDATE SET
      exercise_type_id = EXCLUDED.exercise_type_id,
      sets             = EXCLUDED.sets,
      reps             = EXCLUDED.reps,
      duration_seconds = EXCLUDED.duration_seconds,
      weight           = EXCLUDED.weight,
      notes            = EXCLUDED.notes,
      performed_at     = EXCLUDED.performed_at,
      session_id       = EXCLUDED.session_id,
      updated_at       = EXCLUDED.updated_at,
      deleted_at       = EXCLUDED.deleted_at,
      server_seq       = nextval('sync_seq')
    WHERE exercise_entries.updated_at < EXCLUDED.updated_at
  `,
  ddr_entries: `
    INSERT INTO ddr_entries
      (id, song_title, artist, difficulty, difficulty_scale, difficulty_type,
       song_length_seconds, percentage_score, photo_path, performed_at, session_id,
       created_at, updated_at, deleted_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
  `,
  workout_templates: `
    INSERT INTO workout_templates
      (id, name, items, created_at, updated_at, deleted_at)
    VALUES ($1, $2, $3::jsonb, $4, $5, $6)
    ON CONFLICT (id) DO UPDATE SET
      name       = EXCLUDED.name,
      items      = EXCLUDED.items,
      updated_at = EXCLUDED.updated_at,
      deleted_at = EXCLUDED.deleted_at,
      server_seq = nextval('sync_seq')
    WHERE workout_templates.updated_at < EXCLUDED.updated_at
  `,
  workout_sessions: `
    INSERT INTO workout_sessions
      (id, name, template_id, started_at, ended_at, notes, created_at, updated_at, deleted_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
  `,
}

function params(table: SyncTable, row: Record<string, unknown>): unknown[] {
  switch (table) {
    case 'exercise_types':
      return [
        row.id, row.name, row.tracks_reps, row.tracks_duration, row.tracks_weight, row.icon,
        row.info_url, row.created_at, row.updated_at, row.deleted_at,
      ]
    case 'exercise_entries':
      return [
        row.id, row.exercise_type_id, row.sets, row.reps, row.duration_seconds, row.weight,
        row.notes, row.performed_at, row.session_id, row.created_at, row.updated_at,
        row.deleted_at,
      ]
    case 'ddr_entries':
      return [
        row.id, row.song_title, row.artist, row.difficulty, row.difficulty_scale,
        row.difficulty_type, row.song_length_seconds, row.percentage_score, row.photo_path,
        row.performed_at, row.session_id, row.created_at, row.updated_at, row.deleted_at,
      ]
    case 'workout_templates':
      // pg does not serialize array/object params for jsonb columns itself.
      return [
        row.id, row.name, JSON.stringify(row.items), row.created_at, row.updated_at,
        row.deleted_at,
      ]
    case 'workout_sessions':
      return [
        row.id, row.name, row.template_id, row.started_at, row.ended_at, row.notes,
        row.created_at, row.updated_at, row.deleted_at,
      ]
  }
}

export async function POST(request: Request) {
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

      for (const raw of rows) {
        const result = validate(table, raw)
        if (!result.ok) {
          const id = typeof raw?.id === 'string' ? raw.id : 'unknown'
          rejected.push({ table, id, reason: result.reason })
          continue
        }

        /* Each row gets a SAVEPOINT. Without one, a single constraint
         * violation aborts the whole transaction and every subsequent
         * statement fails with "current transaction is aborted" — one bad row
         * would take down the entire push. */
        await client.query('SAVEPOINT row')
        try {
          await client.query(UPSERTS[table], params(table, result.value))
          await client.query('RELEASE SAVEPOINT row')
        } catch (error) {
          await client.query('ROLLBACK TO SAVEPOINT row')
          // A constraint the validator can't see from one row alone — most
          // likely an entry whose exercise type hasn't synced yet. Report it so
          // the client stops retrying blindly.
          rejected.push({
            table,
            id: String(result.value.id),
            reason: error instanceof Error ? error.message : 'database rejected row',
          })
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
