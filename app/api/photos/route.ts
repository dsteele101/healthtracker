import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { requireUser } from '@/lib/auth'
import { query } from '@/lib/db'

/** Same default pattern as backups/secrets: gitignored, and only meaningful
 *  outside Docker where PHOTO_DIR isn't set for you. */
const PHOTO_DIR = process.env.PHOTO_DIR ?? path.join(process.cwd(), 'data', 'photos')

/** The client only ever produces this — compression happens before upload. */
const ALLOWED_TYPES = new Set(['image/jpeg'])
const MAX_BYTES = 5 * 1024 * 1024

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ error: 'Expected multipart form data.' }, { status: 400 })
  }

  const file = form.get('photo')
  const entryId = form.get('entry_id')

  if (typeof entryId !== 'string' || !UUID_RE.test(entryId)) {
    return Response.json({ error: 'entry_id must be a UUID.' }, { status: 400 })
  }
  if (!(file instanceof File)) {
    return Response.json({ error: 'No photo supplied.' }, { status: 400 })
  }
  if (file.size === 0) {
    return Response.json({ error: 'Photo is empty.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `Photo is too large (max ${MAX_BYTES / 1024 / 1024} MB).` },
      { status: 413 },
    )
  }
  const type = file.type || 'image/jpeg'
  if (!ALLOWED_TYPES.has(type)) {
    return Response.json({ error: `Unsupported photo type: ${type}` }, { status: 415 })
  }

  /* The filename is the entry id, and writes overwrite in place — so without
   * this check any account could replace the photo on anybody else's entry just
   * by naming it. The entry row is the access control list for its own photo.
   *
   * The client only uploads after a push has succeeded, so by the time a photo
   * arrives its entry normally exists. The exception is an entry the server
   * rejected: the client heard 200 (rejections ride along in the push response
   * body) and moves on to photos regardless. That lands here as a 409, which
   * lib/sync.ts treats as final and dequeues, rather than retrying every five
   * minutes for an entry that is never going to exist. */
  const owned = await query(
    'SELECT 1 FROM ddr_entries WHERE id = $1 AND user_id = $2',
    [entryId, auth.user.id],
  )
  if (owned.length === 0) {
    return Response.json({ error: 'No such entry on this account.' }, { status: 409 })
  }

  // Named after the entry it belongs to: one photo per DDR entry, so a retried
  // upload overwrites in place instead of piling up orphans.
  const filename = `${entryId}.jpg`

  await mkdir(PHOTO_DIR, { recursive: true })
  await writeFile(path.join(PHOTO_DIR, filename), Buffer.from(await file.arrayBuffer()))

  return Response.json({ path: filename })
}
