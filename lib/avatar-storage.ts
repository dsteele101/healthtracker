import path from 'node:path'

/** Same default pattern as the DDR photo store: gitignored, and only meaningful
 *  outside Docker where PHOTO_DIR isn't set for you. */
const PHOTO_DIR = process.env.PHOTO_DIR ?? path.join(process.cwd(), 'data', 'photos')

/* Inside the photo volume rather than beside it, so avatars survive
 * `docker compose down` on the same mount that already persists photos, with no
 * second volume to remember. A subdirectory keeps them out of the flat namespace
 * /api/photos/[filename] serves, where every file is expected to be named after
 * a ddr_entries row. */
export const AVATAR_DIR = path.join(PHOTO_DIR, 'avatars')

/** Uploaded avatars only. Anchored and character-restricted so a filename read
 *  back out of the database can't walk outside AVATAR_DIR. */
export const AVATAR_FILENAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/i
