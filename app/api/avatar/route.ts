import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { requireUser, USER_COLUMNS, type AuthUser } from '@/lib/auth'
import { AVATAR_DIR } from '@/lib/avatar-storage'
import { query } from '@/lib/db'
import type { MeResponse } from '@/lib/types'

/** The client compresses to a small square before upload, so anything near this
 *  is a sign the compression step was skipped rather than a legitimate picture. */
const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg'])

/** Replaces the signed-in account's profile picture.
 *
 *  There is no id in the request: you can only ever upload your own. That is the
 *  simplest possible ownership rule and it leaves nothing to check. */
export async function POST(request: Request) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ error: 'Expected multipart form data.' }, { status: 400 })
  }

  const file = form.get('avatar')
  if (!(file instanceof File)) {
    return Response.json({ error: 'No picture supplied.' }, { status: 400 })
  }
  if (file.size === 0) {
    return Response.json({ error: 'Picture is empty.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `Picture is too large (max ${MAX_BYTES / 1024 / 1024} MB).` },
      { status: 413 },
    )
  }
  const type = file.type || 'image/jpeg'
  if (!ALLOWED_TYPES.has(type)) {
    return Response.json({ error: `Unsupported picture type: ${type}` }, { status: 415 })
  }

  /* A fresh name each time rather than one derived from the account id, so the
   * URL changes whenever the picture does. Avatars are served with a long
   * immutable cache; reusing the filename would mean a browser, a service
   * worker, or Cloudflare could keep showing the old one indefinitely with no
   * way to tell it otherwise. */
  const filename = `${crypto.randomUUID()}.jpg`

  await mkdir(AVATAR_DIR, { recursive: true })
  await writeFile(path.join(AVATAR_DIR, filename), Buffer.from(await file.arrayBuffer()))

  // Clears avatar_emoji in the same statement: migration 012's check constraint
  // refuses to hold both, and this is the one that just won.
  const rows = await query<Record<string, unknown> & AuthUser>(
    `UPDATE users SET avatar_path = $2, avatar_emoji = NULL
      WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [auth.user.id, filename],
  )

  /* The picture this one replaced. Deleted after the row is committed, so a
   * failed delete leaves an unreferenced file rather than a profile pointing at
   * a file that no longer exists. */
  if (auth.user.avatar_path) {
    await unlink(path.join(AVATAR_DIR, auth.user.avatar_path)).catch(() => {})
  }

  const user = rows[0]
  const response: MeResponse = {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    avatar_emoji: user.avatar_emoji,
    avatar_path: user.avatar_path,
  }
  return Response.json(response)
}
