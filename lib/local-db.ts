/* IndexedDB store. Every write lands here first and renders from here, so the
 * UI never waits on the network and a dead server is invisible while logging.
 *
 * Hand-rolled rather than wrapped in a sync library: three tables, one user,
 * last-write-wins. The whole contract fits on a screen, which matters more than
 * generality for the piece most likely to lose data if it misbehaves. */

import {
  emptyPayload,
  SYNC_TABLES,
  type DdrSong,
  type Iso,
  type SyncPayload,
  type SyncTable,
} from './types'

const DB_NAME = 'healthtracker'
const DB_VERSION = 3

/** Local-only bookkeeping added to each stored row. */
export interface LocalMeta {
  /* 1 = has local changes the server hasn't acknowledged. Numeric because
   * IndexedDB cannot index booleans — they aren't valid keys. */
  pending: 0 | 1
  /** Set when the server rejects a row, so the UI can surface it. */
  rejected_reason?: string
}

export type Local<T> = T & LocalMeta

const META_STORE = 'meta'
const SONGS_STORE = 'ddr_songs'
const PHOTOS_STORE = 'pending_photos'

/** Tables whose rows carry a `performed_at` field worth indexing. Everything
 *  else (exercise_types, workout_templates, workout_sessions) doesn't have
 *  one -- workout_sessions has started_at instead. */
const PERFORMED_AT_TABLES = new Set<SyncTable>(['exercise_entries', 'ddr_entries'])

/** A compressed photo waiting to reach the server, keyed by the entry it
 *  belongs to — one photo per DDR entry, so a retried upload replaces rather
 *  than accumulates. */
export interface PendingPhoto {
  entry_id: string
  blob: Blob
  content_type: string
  created_at: Iso
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      for (const table of SYNC_TABLES) {
        if (db.objectStoreNames.contains(table)) continue
        const store = db.createObjectStore(table, { keyPath: 'id' })
        store.createIndex('pending', 'pending')
        if (PERFORMED_AT_TABLES.has(table)) {
          store.createIndex('performed_at', 'performed_at')
        }
      }

      if (!db.objectStoreNames.contains(SONGS_STORE)) {
        const songs = db.createObjectStore(SONGS_STORE, { keyPath: 'id' })
        songs.createIndex('title', 'title', { unique: true })
      }

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' })
      }

      if (!db.objectStoreNames.contains(PHOTOS_STORE)) {
        db.createObjectStore(PHOTOS_STORE, { keyPath: 'entry_id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    // A version bump can't proceed while another tab still holds the old
    // version open. Without this, neither onsuccess nor onerror ever fires —
    // every caller awaiting db() would hang indefinitely instead of failing.
    request.onblocked = () => {
      reject(new Error('Database upgrade blocked by another open tab. Close other tabs and reload.'))
    }
  })
}

let dbPromise: Promise<IDBDatabase> | undefined

function db(): Promise<IDBDatabase> {
  dbPromise ??= open()
  return dbPromise
}

// --- change notification -----------------------------------------------------

/* Every mutation bumps this so React views re-read. A version counter rather
 * than per-store events: the data is small enough that re-reading everything is
 * cheaper than tracking what actually changed. */
const listeners = new Set<() => void>()
let version = 0

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getVersion(): number {
  return version
}

function notify(): void {
  version += 1
  for (const listener of listeners) listener()
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

// --- reads -------------------------------------------------------------------

export async function all<T extends { deleted_at: Iso | null }>(
  table: SyncTable,
): Promise<Local<T>[]> {
  const conn = await db()
  const tx = conn.transaction(table, 'readonly')
  const rows = await promisify<Local<T>[]>(tx.objectStore(table).getAll())
  // Soft-deleted rows stay in the store so the tombstone can still be pushed,
  // but they are never handed to the UI.
  return rows.filter((row) => !row.deleted_at)
}

/** Every row including tombstones. For export: a backup that omits deletions
 *  would resurrect them on restore. Not for UI use — call `all` there. */
export async function allIncludingDeleted<T>(table: SyncTable): Promise<Local<T>[]> {
  const conn = await db()
  const tx = conn.transaction(table, 'readonly')
  return promisify<Local<T>[]>(tx.objectStore(table).getAll())
}

export async function get<T>(table: SyncTable, id: string): Promise<Local<T> | undefined> {
  const conn = await db()
  const tx = conn.transaction(table, 'readonly')
  return promisify<Local<T> | undefined>(tx.objectStore(table).get(id))
}

// --- writes ------------------------------------------------------------------

/** Writes a row locally and marks it for the next push. */
export async function put<T extends { id: string }>(table: SyncTable, row: T): Promise<void> {
  const conn = await db()
  const tx = conn.transaction(table, 'readwrite')
  const local: Local<T> = { ...row, pending: 1 }
  // Clearing any previous rejection: this is a fresh attempt.
  delete (local as Local<T> & { rejected_reason?: string }).rejected_reason
  tx.objectStore(table).put(local)
  await done(tx)
  notify()
}

/** Soft-deletes so the removal survives the trip to the other device. */
export async function remove(table: SyncTable, id: string): Promise<void> {
  const conn = await db()
  const tx = conn.transaction(table, 'readwrite')
  const store = tx.objectStore(table)
  const row = await promisify<Record<string, unknown> | undefined>(store.get(id))
  if (row) {
    const now = new Date().toISOString()
    store.put({ ...row, deleted_at: now, updated_at: now, pending: 1 })
  }
  await done(tx)

  // A photo still queued for an entry that's being removed has nowhere to
  // land — drop it rather than uploading it after the fact.
  if (table === 'ddr_entries') await clearPhoto(id)

  notify()
}

// --- sync support ------------------------------------------------------------

/** Rows with unacknowledged local changes, in push order. */
export async function pending(): Promise<SyncPayload> {
  const conn = await db()
  const payload = emptyPayload()
  const tx = conn.transaction([...SYNC_TABLES], 'readonly')

  await Promise.all(
    SYNC_TABLES.map(async (table) => {
      const index = tx.objectStore(table).index('pending')
      const rows = await promisify<Record<string, unknown>[]>(index.getAll(IDBKeyRange.only(1)))
      // Strip local bookkeeping before it goes over the wire.
      const clean = rows.map((row) => {
        const { pending, rejected_reason, ...rest } = row
        void pending
        void rejected_reason
        return rest
      })
      ;(payload[table] as unknown[]) = clean
    }),
  )

  return payload
}

/** Clears the pending flag for rows the server accepted. */
export async function markSynced(table: SyncTable, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const conn = await db()
  const tx = conn.transaction(table, 'readwrite')
  const store = tx.objectStore(table)

  for (const id of ids) {
    const row = await promisify<Record<string, unknown> | undefined>(store.get(id))
    // Only clear if nothing changed it in the meantime — otherwise an edit made
    // while the push was in flight would be silently dropped from the queue.
    if (row && row.pending === 1) {
      store.put({ ...row, pending: 0 })
    }
  }

  await done(tx)
  notify()
}

/** Flags a row the server refused, leaving it local and visible. */
export async function markRejected(
  table: SyncTable,
  id: string,
  reason: string,
): Promise<void> {
  const conn = await db()
  const tx = conn.transaction(table, 'readwrite')
  const store = tx.objectStore(table)
  const row = await promisify<Record<string, unknown> | undefined>(store.get(id))
  if (row) {
    // pending stays 0 so a permanently invalid row doesn't wedge the queue,
    // retrying forever behind every subsequent write.
    store.put({ ...row, pending: 0, rejected_reason: reason })
  }
  await done(tx)
  notify()
}

/** Merges rows pulled from the server, last-write-wins on updated_at. */
export async function mergeFromServer(payload: SyncPayload): Promise<void> {
  const conn = await db()
  const tx = conn.transaction([...SYNC_TABLES], 'readwrite')

  for (const table of SYNC_TABLES) {
    const store = tx.objectStore(table)
    for (const incoming of payload[table] as { id: string; updated_at: string }[]) {
      const existing = await promisify<
        (Record<string, unknown> & { updated_at?: string; pending?: 0 | 1 }) | undefined
      >(store.get(incoming.id))

      // A local edit that hasn't been pushed yet outranks whatever the server
      // has — the server simply hasn't heard about it. It wins or loses on
      // updated_at during the next push, not here.
      if (existing?.pending === 1) continue

      if (!existing || (existing.updated_at ?? '') <= incoming.updated_at) {
        store.put({ ...incoming, pending: 0 })
      }
    }
  }

  await done(tx)
  notify()
}

// --- cursor ------------------------------------------------------------------

export async function getCursor(): Promise<string> {
  const conn = await db()
  const tx = conn.transaction(META_STORE, 'readonly')
  const row = await promisify<{ key: string; value: string } | undefined>(
    tx.objectStore(META_STORE).get('cursor'),
  )
  return row?.value ?? '0'
}

export async function setCursor(cursor: string): Promise<void> {
  const conn = await db()
  const tx = conn.transaction(META_STORE, 'readwrite')
  tx.objectStore(META_STORE).put({ key: 'cursor', value: cursor })
  await done(tx)
}

// --- ddr song corpus ---------------------------------------------------------

export async function songs(): Promise<DdrSong[]> {
  const conn = await db()
  const tx = conn.transaction(SONGS_STORE, 'readonly')
  return promisify<DdrSong[]>(tx.objectStore(SONGS_STORE).getAll())
}

/** Records a title so photo import can fuzzy-match against it later. */
export async function rememberSong(title: string): Promise<void> {
  const trimmed = title.trim()
  if (!trimmed) return

  const conn = await db()
  const tx = conn.transaction(SONGS_STORE, 'readwrite')
  const store = tx.objectStore(SONGS_STORE)
  const now = new Date().toISOString()

  const existing = await promisify<DdrSong | undefined>(
    store.index('title').get(trimmed),
  )

  if (existing) {
    store.put({ ...existing, last_seen_at: now })
  } else {
    store.put({ id: crypto.randomUUID(), title: trimmed, last_seen_at: now, created_at: now })
  }

  await done(tx)
  notify()
}

// --- photo upload queue -------------------------------------------------------

/** Stages a compressed photo for upload, replacing any earlier attempt for the
 *  same entry. Separate from the synced tables: it holds a Blob, which is
 *  local-only and never goes over the sync wire itself. */
export async function queuePhoto(
  entryId: string,
  blob: Blob,
  contentType: string,
): Promise<void> {
  const conn = await db()
  const tx = conn.transaction(PHOTOS_STORE, 'readwrite')
  tx.objectStore(PHOTOS_STORE).put({
    entry_id: entryId,
    blob,
    content_type: contentType,
    created_at: new Date().toISOString(),
  } satisfies PendingPhoto)
  await done(tx)
  notify()
}

export async function pendingPhotos(): Promise<PendingPhoto[]> {
  const conn = await db()
  const tx = conn.transaction(PHOTOS_STORE, 'readonly')
  return promisify<PendingPhoto[]>(tx.objectStore(PHOTOS_STORE).getAll())
}

export async function clearPhoto(entryId: string): Promise<void> {
  const conn = await db()
  const tx = conn.transaction(PHOTOS_STORE, 'readwrite')
  tx.objectStore(PHOTOS_STORE).delete(entryId)
  await done(tx)
  notify()
}

/** Records where an uploaded photo landed and re-queues the entry for push, so
 *  the path reaches the server on the next sync round. */
export async function attachPhoto(entryId: string, photoPath: string): Promise<void> {
  const conn = await db()
  const tx = conn.transaction('ddr_entries', 'readwrite')
  const store = tx.objectStore('ddr_entries')
  const row = await promisify<Record<string, unknown> | undefined>(store.get(entryId))
  if (row) {
    store.put({
      ...row,
      photo_path: photoPath,
      updated_at: new Date().toISOString(),
      pending: 1,
    })
  }
  await done(tx)
  notify()
}

/** Test/reset hook. */
export async function wipe(): Promise<void> {
  // The open connection has to be closed first. deleteDatabase against a live
  // connection fires onblocked and never completes, which hangs the caller.
  if (dbPromise) {
    const conn = await dbPromise.catch(() => undefined)
    conn?.close()
  }
  dbPromise = undefined

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    // Another tab still holds it open. Resolving keeps the caller moving;
    // the delete completes once that tab lets go.
    request.onblocked = () => resolve()
  })
}
