import { unlink } from 'node:fs/promises'
import path from 'node:path'

import { requireUser, USER_COLUMNS, type AuthUser } from '@/lib/auth'
import { AVATAR_DIR } from '@/lib/avatar-storage'
import { query } from '@/lib/db'
import type { MeResponse, ProfileUpdate } from '@/lib/types'

function toResponse(user: AuthUser): MeResponse {
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    avatar_emoji: user.avatar_emoji,
    avatar_path: user.avatar_path,
  }
}

/* Who the server thinks is calling.
 *
 * The client needs this for one thing that matters and one that's cosmetic. The
 * cosmetic one is showing a name and picture. The one that matters is that
 * IndexedDB is a single fixed database name on the device: if a different
 * account signs in on the same browser, the local store has to be cleared before
 * anything is pushed, or one person's queued rows land under another's identity
 * and become theirs. lib/sync.ts checks this against the id it recorded locally
 * before every push. */
export async function GET(request: Request) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  return Response.json(toResponse(auth.user))
}

/** Editable profile: the display name, and an emoji avatar. Uploading a picture
 *  goes to POST /api/avatar instead, since that one needs multipart. */
export async function PATCH(request: Request) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  let body: ProfileUpdate
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const sets: string[] = []
  const params: unknown[] = [auth.user.id]

  if ('display_name' in body) {
    const raw = body.display_name
    if (raw !== null && typeof raw !== 'string') {
      return Response.json({ error: 'display_name must be text or null' }, { status: 400 })
    }
    const name = raw === null ? null : raw.trim()
    if (name !== null && name.length > 60) {
      return Response.json({ error: 'display_name is too long (max 60).' }, { status: 400 })
    }
    /* Empty is stored as NULL rather than "": both mean "no name chosen", and
     * one of them would render as a blank space where a name should be. The
     * client falls back to the local part of the email. */
    sets.push(`display_name = $${params.push(name || null)}`)
  }

  let orphaned: string | null = null

  if ('avatar_emoji' in body) {
    const raw = body.avatar_emoji
    if (raw !== null && typeof raw !== 'string') {
      return Response.json({ error: 'avatar_emoji must be text or null' }, { status: 400 })
    }
    // Generous for multi-codepoint emoji (skin tone modifiers, ZWJ sequences)
    // without allowing a whole string in — same bound as exercise_types.icon.
    const emoji = raw === null ? null : raw.trim()
    if (emoji !== null && (emoji.length === 0 || emoji.length > 16)) {
      return Response.json({ error: 'avatar_emoji must be a single emoji.' }, { status: 400 })
    }

    /* Picking an emoji retires an uploaded picture: the check constraint added
     * in migration 012 refuses to hold both, and leaving the file on disk would
     * mean a "deleted" picture that is still served to anyone who kept the URL. */
    sets.push(`avatar_emoji = $${params.push(emoji)}`)
    sets.push('avatar_path = NULL')
    orphaned = auth.user.avatar_path
  }

  if (sets.length === 0) {
    return Response.json({ error: 'nothing to update' }, { status: 400 })
  }

  const rows = await query<Record<string, unknown> & AuthUser>(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    params,
  )

  /* After the row is committed, so a failed delete leaves an unreferenced file
   * rather than a profile pointing at one that is gone. Unreferenced costs disk;
   * a dangling reference shows a broken image. */
  if (orphaned) {
    await unlink(path.join(AVATAR_DIR, orphaned)).catch(() => {})
  }

  return Response.json(toResponse(rows[0]))
}
