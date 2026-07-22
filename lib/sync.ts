/* Client sync engine: push local changes, pull remote ones, never lose a row.
 *
 * The guiding rule is that anything short of an explicit success leaves the
 * queue untouched. Logging happens in a gym with no signal and behind a
 * Cloudflare Access session that expires; both look like failure here, and both
 * have to be safe. */

import * as local from './local-db'
import { SYNC_TABLES, emptyPayload, type PullResponse, type PushResponse } from './types'

export type SyncOutcome =
  | { status: 'synced'; pushed: number; pulled: number; rejected: number }
  | { status: 'offline' }
  | { status: 'unreachable' }
  | { status: 'auth-required' }
  | { status: 'error'; message: string }

export type SyncStatus = SyncOutcome['status'] | 'syncing' | 'idle'

/* Requests go out with redirect: 'manual' specifically so an expired Cloudflare
 * Access session is distinguishable from a dead server.
 *
 * With the default redirect: 'follow', Access's 302 to its own login origin is
 * chased by the browser, fails CORS, and surfaces as a bare TypeError — exactly
 * what an unreachable server produces. Both would keep rows queued correctly,
 * but the UI could only guess, and telling someone to sign in again when the
 * box is simply down sends them off to fix the wrong thing.
 *
 * 'manual' stops the browser at the redirect and hands back an opaqueredirect
 * response, which is unambiguous. */
const FETCH_OPTIONS: RequestInit = { redirect: 'manual' }

/** Redirected away from our API — Access wants a fresh login. */
function isAuthRedirect(response: Response): boolean {
  return response.type === 'opaqueredirect' || response.redirected
}

/** True when this is our JSON API and not an interstitial HTML page. */
function isApiResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type') ?? ''
  return contentType.includes('application/json')
}

/** A thrown fetch now means the server could not be reached at all. */
function classifyThrow(): SyncOutcome {
  return navigator.onLine ? { status: 'unreachable' } : { status: 'offline' }
}

let inFlight: Promise<SyncOutcome> | undefined

/** Push then pull. Concurrent calls share one run rather than racing. */
export function sync(): Promise<SyncOutcome> {
  inFlight ??= run().finally(() => {
    inFlight = undefined
  })
  return inFlight
}

async function run(): Promise<SyncOutcome> {
  let pushed = 0
  let rejected = 0

  // --- push ------------------------------------------------------------------
  const outbox = await local.pending()
  const outboxCount = SYNC_TABLES.reduce((n, t) => n + outbox[t].length, 0)

  if (outboxCount > 0) {
    let response: Response
    try {
      response = await fetch('/api/sync/push', {
        ...FETCH_OPTIONS,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(outbox),
      })
    } catch {
      return classifyThrow()
    }

    if (isAuthRedirect(response)) return { status: 'auth-required' }
    if (!response.ok) {
      return { status: 'error', message: `push failed: ${response.status}` }
    }
    if (!isApiResponse(response)) return { status: 'auth-required' }

    const result = (await response.json()) as PushResponse

    const rejectedIds = new Set(result.rejected.map((r) => `${r.table}:${r.id}`))
    for (const { table, id, reason } of result.rejected) {
      await local.markRejected(table, id, reason)
      rejected += 1
    }

    for (const table of SYNC_TABLES) {
      const accepted = outbox[table]
        .map((row) => row.id)
        .filter((id) => !rejectedIds.has(`${table}:${id}`))
      await local.markSynced(table, accepted)
      pushed += accepted.length
    }
  }

  // --- pull ------------------------------------------------------------------
  const cursor = await local.getCursor()

  let response: Response
  try {
    response = await fetch(`/api/sync/pull?cursor=${encodeURIComponent(cursor)}`, FETCH_OPTIONS)
  } catch {
    return classifyThrow()
  }

  if (isAuthRedirect(response)) return { status: 'auth-required' }
  if (!response.ok) {
    return { status: 'error', message: `pull failed: ${response.status}` }
  }
  if (!isApiResponse(response)) return { status: 'auth-required' }

  const result = (await response.json()) as PullResponse
  const pulled = SYNC_TABLES.reduce((n, t) => n + result[t].length, 0)

  await local.mergeFromServer(result)
  // Advanced only after the merge commits, so a crash mid-merge re-pulls the
  // same rows rather than skipping them.
  await local.setCursor(result.cursor)

  // --- photos ------------------------------------------------------------------
  // Only reached once push and pull have both succeeded, so connectivity and
  // auth are already confirmed good for this round. A photo that fails here
  // (offline mid-batch, one bad upload) just stays queued for the next attempt
  // — same "nothing short of success clears the queue" rule as everything else.
  for (const photo of await local.pendingPhotos()) {
    const body = new FormData()
    body.append('photo', photo.blob, `${photo.entry_id}.jpg`)
    body.append('entry_id', photo.entry_id)

    let photoResponse: Response
    try {
      photoResponse = await fetch('/api/photos', { ...FETCH_OPTIONS, method: 'POST', body })
    } catch {
      continue
    }
    if (!photoResponse.ok || isAuthRedirect(photoResponse) || !isApiResponse(photoResponse)) {
      continue
    }

    const { path } = (await photoResponse.json()) as { path: string }
    await local.attachPhoto(photo.entry_id, path)
    await local.clearPhoto(photo.entry_id)
  }

  return { status: 'synced', pushed, pulled, rejected }
}

/** Full re-pull, e.g. after restoring an export. */
export async function resync(): Promise<SyncOutcome> {
  await local.setCursor('0')
  return sync()
}

/** Number of rows waiting to reach the server. */
export async function pendingCount(): Promise<number> {
  const outbox = await local.pending()
  return SYNC_TABLES.reduce((n, t) => n + outbox[t].length, 0)
}

/** Syncs after local edits, on reconnect, on tab focus, and on a slow timer. */
export function startAutoSync(onOutcome?: (outcome: SyncOutcome) => void): () => void {
  let stopped = false

  const attempt = () => {
    if (stopped) return
    void sync().then((outcome) => {
      if (!stopped) onOutcome?.(outcome)
    })
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') attempt()
  }

  /* Push shortly after a local write, rather than waiting for the next focus
   * change or timer tick. Without this, editing or deleting something while
   * staying on the same screen leaves it queued for up to five minutes.
   *
   * Debounced so a burst of writes produces one push, and gated on there
   * actually being pending work — sync() itself writes to the store when it
   * clears flags and merges pulled rows, and reacting to those writes
   * unconditionally would loop forever. */
  let debounce: number | undefined
  const onLocalChange = () => {
    if (stopped) return
    window.clearTimeout(debounce)
    debounce = window.setTimeout(() => {
      void pendingCount().then((n) => {
        if (n > 0) attempt()
      })
    }, 1000)
  }

  const unsubscribe = local.subscribe(onLocalChange)
  window.addEventListener('online', attempt)
  document.addEventListener('visibilitychange', onVisible)
  // Backstop for a session left open: catches edits made on another device
  // without needing a focus change.
  const timer = window.setInterval(attempt, 5 * 60 * 1000)

  attempt()

  return () => {
    stopped = true
    unsubscribe()
    window.clearTimeout(debounce)
    window.removeEventListener('online', attempt)
    document.removeEventListener('visibilitychange', onVisible)
    window.clearInterval(timer)
  }
}

export { emptyPayload }
