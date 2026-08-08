import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { requireUser } from '@/lib/auth'
import { query } from '@/lib/db'

const PHOTO_DIR = process.env.PHOTO_DIR ?? path.join(process.cwd(), 'data', 'photos')

// Matches exactly what /api/photos writes: a UUID entry id plus extension.
// Anchored and character-restricted so this can't be walked outside PHOTO_DIR.
const FILENAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/i

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const { filename } = await params
  if (!FILENAME_RE.test(filename)) {
    return new Response('Not found', { status: 404 })
  }

  /* Photos live in one flat directory, so being signed in is not enough — every
   * account can name every file. The entry the photo belongs to is its access
   * control list.
   *
   * Checked against the id in the URL, never against ddr_entries.photo_path.
   * photo_path is a client-supplied string on a row the caller owns, so a lookup
   * keyed on it would be satisfied by simply pointing your own entry at someone
   * else's file. The id in the URL is the one part of this a caller cannot
   * reassign to themselves.
   *
   * deleted_at is not considered: soft-deleted rows come back if a tombstone
   * loses a last-write-wins race, and the bytes are on disk either way.
   *
   * 404 rather than 403 — a distinct "forbidden" would confirm which entry ids
   * exist on other accounts. */
  const owned = await query(
    'SELECT 1 FROM ddr_entries WHERE id = $1 AND user_id = $2',
    [filename.slice(0, -'.jpg'.length), auth.user.id],
  )
  if (owned.length === 0) {
    return new Response('Not found', { status: 404 })
  }

  try {
    const data = await readFile(path.join(PHOTO_DIR, filename))
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': 'image/jpeg',
        // The filename is content-addressed by entry id and never reused for
        // different bytes in normal use, so a long cache is safe.
        //
        // `private` is load-bearing now, not a nicety: Cloudflare sits in front
        // of this and the response varies by account for a URL that does not.
        // A shared cache here would serve one person's photo to another.
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
