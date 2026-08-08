/* Editing your own account: name, picture, and leaving.
 *
 * Unlike entries, none of this is local-first. There is exactly one row per
 * account and no offline story worth building for it -- you cannot rename
 * yourself in a basement gym and have it mean anything until it reaches the
 * server anyway. So these go straight to the API and write the answer into the
 * local identity, which is what the header renders from. */

import { compressImage } from './compress-image'
import * as local from './local-db'
import type { MeResponse, ProfileUpdate } from './types'

async function readError(response: Response, fallback: string): Promise<never> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null
  throw new Error(body?.error ?? fallback)
}

/** Applies a change and returns the account as the server now holds it. */
export async function updateProfile(patch: ProfileUpdate): Promise<MeResponse> {
  const response = await fetch('/api/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!response.ok) await readError(response, 'Could not save that.')

  const user = (await response.json()) as MeResponse
  await local.setIdentity(user)
  return user
}

/** Longest edge of a stored profile picture. It is displayed at 40px in the
 *  header and 64px in the menu, so this is already generous for a 3x screen and
 *  keeps the file far below the upload ceiling. */
const AVATAR_EDGE = 256

/** Crops to a centred square and scales down, so a portrait photo becomes a
 *  face rather than a letterboxed sliver. Done here rather than with CSS
 *  object-fit because the stored file should be the thing that is shown --
 *  otherwise every consumer has to remember to crop it the same way. */
async function squareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const edge = Math.min(bitmap.width, bitmap.height)
    const sx = Math.round((bitmap.width - edge) / 2)
    const sy = Math.round((bitmap.height - edge) / 2)
    const size = Math.min(edge, AVATAR_EDGE)

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not supported.')
    ctx.drawImage(bitmap, sx, sy, edge, edge, 0, 0, size, size)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode picture.'))),
        'image/jpeg',
        0.85,
      )
    })
  } finally {
    bitmap.close()
  }
}

/** Uploads a new profile picture, replacing whatever was there. */
export async function uploadAvatar(file: File): Promise<MeResponse> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Pick an image file.')
  }

  /* HEIC from an iPhone camera roll cannot be decoded by createImageBitmap in
   * most browsers. compressImage hits the same wall for DDR photos and the
   * fallback is the same: let the file through at its original bytes and let the
   * server's type check reject it with something readable. */
  let blob: Blob
  try {
    blob = await squareJpeg(file)
  } catch {
    blob = await compressImage(file)
  }

  const body = new FormData()
  body.append('avatar', blob, 'avatar.jpg')

  const response = await fetch('/api/avatar', { method: 'POST', body })
  if (!response.ok) await readError(response, 'Could not upload that picture.')

  const user = (await response.json()) as MeResponse
  await local.setIdentity(user)
  return user
}

/** Ends the Cloudflare Access session.
 *
 *  Deliberately leaves the local store alone. Wiping here would destroy entries
 *  that have not reached the server -- logging out in a gym with no signal is
 *  exactly when that would hurt -- and it is not needed for safety: the identity
 *  check at the top of every sync already refuses to push one account's queued
 *  rows under another, and clears the store when the next person signs in with
 *  nothing pending. /data has the deliberate "discard and switch" for the rest. */
export function logOut(): void {
  if (process.env.NODE_ENV !== 'production') {
    // No Access in front of localhost, so there is no session to end; drop the
    // stand-in cookie instead. Compiled out of a production build.
    document.cookie = 'dev_user=; Path=/; Max-Age=0; SameSite=Lax'
    window.location.href = '/'
    return
  }

  /* Served by Cloudflare at the edge, not by this app -- it clears the
   * CF_Authorization cookie and sends you back to the Access login. A full
   * navigation rather than a fetch, because the point is to land on their page. */
  window.location.href = '/cdn-cgi/access/logout'
}
