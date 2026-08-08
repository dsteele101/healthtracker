import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { requireUser } from '@/lib/auth'
import { AVATAR_DIR, AVATAR_FILENAME_RE } from '@/lib/avatar-storage'
import { query } from '@/lib/db'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const { filename } = await params
  if (!AVATAR_FILENAME_RE.test(filename)) {
    return new Response('Not found', { status: 404 })
  }

  /* Being signed in is not enough: avatars sit in one flat directory, so any
   * account could name any file. The rule is that a filename has to be the one
   * currently recorded against *some* account -- checked against the column, not
   * against the URL, because the filename is server-assigned on upload and is
   * the only thing tying a file to a profile.
   *
   * Deliberately not restricted to the caller's own picture. Nothing shows other
   * people's avatars today, but exercise_types.created_by already records who
   * added what, and the moment any of that surfaces this route would otherwise
   * have to be reopened -- with the ownership check being the thing that gets
   * loosened under time pressure. Avatars are a name and a face for accounts
   * that already share a catalog, so this is not the place to hold a line.
   *
   * A file that no longer belongs to anyone -- replaced, or cleared in favour of
   * an emoji -- stops being served here even if its bytes outlive the unlink. */
  const owned = await query(
    'SELECT 1 FROM users WHERE avatar_path = $1',
    [filename],
  )
  if (owned.length === 0) {
    return new Response('Not found', { status: 404 })
  }

  try {
    const data = await readFile(path.join(AVATAR_DIR, filename))
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': 'image/jpeg',
        /* The filename is regenerated on every upload, so these bytes never
         * change under this URL and a long cache is safe. `private` because
         * Cloudflare is in the path and this is behind Access -- a shared cache
         * has no business holding it, even though the content is not secret. */
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
