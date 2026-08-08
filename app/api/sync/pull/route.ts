import { requireUser } from '@/lib/auth'
import { query } from '@/lib/db'
import { SYNC_TABLES, emptyPayload, type PullResponse, type SyncTable } from '@/lib/types'

/** Per-table cap on one pull. Generous for one person's own history; the
 *  truncation logic below keeps correctness independent of the number. */
const PAGE_SIZE = 500

/** exercise_types is the one shared table -- a catalog everyone picks from and
 *  adds to -- so it has no user_id to filter on and every account pulls all of
 *  it. Everything else is private. */
const SHARED_TABLES = new Set<SyncTable>(['exercise_types'])

const COLUMNS: Record<SyncTable, string> = {
  exercise_types: `
    id, name, tracks_reps, tracks_duration, tracks_weight, icon, icon_svg, info_url,
    created_at, updated_at, deleted_at, server_seq
  `,
  exercise_entries: `
    id, exercise_type_id, sets, reps, duration_seconds, weight::float8 AS weight, notes,
    performed_at, session_id, created_at, updated_at, deleted_at, server_seq
  `,
  ddr_entries: `
    id, song_title, artist, difficulty, difficulty_scale, difficulty_type,
    song_length_seconds, percentage_score::float8 AS percentage_score, photo_path,
    performed_at, session_id, created_at, updated_at, deleted_at, server_seq
  `,
  workout_templates: `
    id, name, items, created_at, updated_at, deleted_at, server_seq
  `,
  workout_sessions: `
    id, name, template_id, started_at, ended_at, notes,
    created_at, updated_at, deleted_at, server_seq
  `,
}

type SeqRow = Record<string, unknown> & { server_seq: string }

export async function GET(request: Request) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const raw = url.searchParams.get('cursor') ?? '0'

  // bigint, so it stays a string end to end rather than risking a float.
  if (!/^\d+$/.test(raw)) {
    return Response.json({ error: 'cursor must be a non-negative integer' }, { status: 400 })
  }

  try {
    const results = await Promise.all(
      SYNC_TABLES.map(async (table) => {
        // Soft-deleted rows are included on purpose: the tombstone is the only
        // way the other device learns the row is gone.
        const shared = SHARED_TABLES.has(table)
        const rows = await query<SeqRow>(
          `SELECT ${COLUMNS[table]}
             FROM ${table}
            WHERE ${shared ? '' : 'user_id = $2 AND '}server_seq > $1
            ORDER BY server_seq
            LIMIT ${PAGE_SIZE}`,
          shared ? [raw] : [raw, auth.user.id],
        )
        return { table, rows }
      }),
    )

    /* All five tables draw from one sequence, so a single cursor covers them
     * — but only if it never advances past a row that got cut off by a LIMIT.
     * If any table filled its page, clamp the cursor to the lowest such
     * boundary and drop everything above it. Those rows come back on the next
     * pull instead of being stepped over and lost.
     *
     * Filtering by user_id above does not disturb this. The cursor is a position
     * in one global sequence, but what it means is "everything visible to *this*
     * account at or below here has been delivered" — and each query still
     * returns a contiguous, seq-ordered prefix of what this account is owed. A
     * cursor simply steps over the gaps where other people's rows sit.
     *
     * That rests on one property worth stating, because it is invisible in the
     * code and easy to break later: a row's visibility never changes after it is
     * written. Rows do not change owner, and exercise_types is shared from
     * creation. If a "share this session with someone" feature ever makes a row
     * become visible to an account whose cursor is already past it, that row
     * will never be delivered — the pull will step straight over it and nothing
     * will look wrong. Such a feature needs its own delivery path, not this one. */
    const truncated = results.filter((r) => r.rows.length === PAGE_SIZE)

    let cursor = raw
    const payload = emptyPayload()

    if (truncated.length > 0) {
      const boundary = truncated
        .map((r) => BigInt(r.rows[r.rows.length - 1].server_seq))
        .reduce((min, seq) => (seq < min ? seq : min))

      for (const { table, rows } of results) {
        const kept = rows.filter((row) => BigInt(row.server_seq) <= boundary)
        ;(payload[table] as unknown[]) = kept.map(strip)
      }
      cursor = boundary.toString()
    } else {
      let max = BigInt(raw)
      for (const { table, rows } of results) {
        for (const row of rows) {
          const seq = BigInt(row.server_seq)
          if (seq > max) max = seq
        }
        ;(payload[table] as unknown[]) = rows.map(strip)
      }
      cursor = max.toString()
    }

    const response: PullResponse = { ...payload, cursor }
    return Response.json(response)
  } catch (error) {
    console.error('sync pull failed:', error)
    return Response.json({ error: 'pull failed' }, { status: 500 })
  }
}

/** server_seq is a server-side detail; the client tracks position via cursor. */
function strip(row: SeqRow): Record<string, unknown> {
  const { server_seq, ...rest } = row
  void server_seq
  return rest
}
