/* Client sync engine: push local changes, pull remote ones, never lose a row.
 *
 * The guiding rule is that anything short of an explicit success leaves the
 * queue untouched. Logging happens in a gym with no signal and behind a
 * Cloudflare Access session that expires; both look like failure here, and both
 * have to be safe. */

import * as local from './local-db'
import {
  SYNC_TABLES,
  emptyPayload,
  type MeResponse,
  type PullResponse,
  type PushResponse,
} from './types'

export type SyncOutcome =
  | { status: 'synced'; pushed: number; pulled: number; rejected: number }
  | { status: 'offline' }
  | { status: 'unreachable' }
  | { status: 'auth-required' }
  /** A different account is signed in than the one this device's rows belong
   *  to, and there is unsynced work that switching would destroy. */
  | { status: 'identity-mismatch'; email: string }
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

/** Signed out, from the app's own gate rather than a redirect at the edge. */
function isUnauthorized(response: Response): boolean {
  return response.status === 401 || response.status === 403
}

/* Who the server says is calling. Kept separate from the sync payload because
 * its answer decides whether pushing is safe at all. */
async function identify(): Promise<{ ok: true; user: MeResponse } | { ok: false; outcome: SyncOutcome }> {
  let response: Response
  try {
    response = await fetch('/api/me', FETCH_OPTIONS)
  } catch {
    return { ok: false, outcome: classifyThrow() }
  }

  if (isAuthRedirect(response) || isUnauthorized(response)) {
    return { ok: false, outcome: { status: 'auth-required' } }
  }
  if (!response.ok) {
    return { ok: false, outcome: { status: 'error', message: `identity failed: ${response.status}` } }
  }
  if (!isApiResponse(response)) return { ok: false, outcome: { status: 'auth-required' } }

  return { ok: true, user: (await response.json()) as MeResponse }
}

/* Confirms this device's rows belong to whoever is signed in, before a single
 * one of them is sent anywhere.
 *
 * IndexedDB is one database per browser, not one per account, so a browser that
 * two people have both signed into holds one store. Pushing without checking
 * would file the first person's queued rows under the second person's identity —
 * the server stamps ownership from the request, so they would simply become the
 * second person's data, with nothing to undo it.
 *
 * This lives at the top of run() rather than in a boot effect on purpose.
 * startAutoSync() fires a sync immediately, and a check racing it that loses has
 * already lost the data.
 *
 * Three cases, and the ordering of the guards is the whole point:
 *
 *   - Cannot reach the server, or not signed in: return, change nothing. An
 *     unreachable server is not evidence about identity, and wiping on it would
 *     turn a flaky connection into data loss.
 *   - No identity recorded yet: adopt it. Normal on a first run, and after
 *     wipe(), which clears meta along with everything else.
 *   - Recorded identity disagrees: the device belongs to someone else. Clear it
 *     — but never over the top of unsynced work. Rows that exist nowhere but
 *     this device are exactly what a backup is for, so refuse and say so
 *     instead, and let /data offer an export first. */
async function reconcileIdentity(): Promise<SyncOutcome | undefined> {
  const me = await identify()
  if (!me.ok) return me.outcome

  const identity = me.user
  const stored = await local.getIdentity()

  if (stored === undefined) {
    await local.setIdentity(identity)
    return undefined
  }
  if (stored.id === me.user.id) {
    /* Same account. Refresh the cached copy so a name or picture changed on
     * another device shows up here, and so does an address changed at the
     * identity provider. */
    if (
      stored.email !== identity.email ||
      stored.display_name !== identity.display_name ||
      stored.avatar_emoji !== identity.avatar_emoji ||
      stored.avatar_path !== identity.avatar_path
    ) {
      await local.setIdentity(identity)
    }
    return undefined
  }

  if ((await pendingCount()) > 0) {
    return { status: 'identity-mismatch', email: me.user.email }
  }

  await local.wipe()
  // Order matters: wipe() drops meta too, so both of these are writes into a
  // fresh database rather than overwrites.
  await local.setIdentity(identity)
  await local.setCursor('0')
  return undefined
}

let inFlight: Promise<SyncOutcome> | undefined

/* How the last attempt went, shared by everything that displays it.
 *
 * Module state rather than per-component state because more than one component
 * shows this at once -- the badge on every screen, and the account card on
 * /data. Two copies drift: resolving something on one leaves the other still
 * reporting the problem, which is worse than not showing it at all. Same
 * subscribe/snapshot shape as the local store, for the same reason. */
let lastOutcome: SyncOutcome | null = null
const outcomeListeners = new Set<() => void>()

export function subscribeOutcome(listener: () => void): () => void {
  outcomeListeners.add(listener)
  return () => outcomeListeners.delete(listener)
}

export function getOutcome(): SyncOutcome | null {
  return lastOutcome
}

function record(outcome: SyncOutcome): SyncOutcome {
  lastOutcome = outcome
  for (const listener of outcomeListeners) listener()
  return outcome
}

/** Push then pull. Concurrent calls share one run rather than racing. */
export function sync(): Promise<SyncOutcome> {
  inFlight ??= run()
    .then(record)
    .finally(() => {
      inFlight = undefined
    })
  return inFlight
}

async function run(): Promise<SyncOutcome> {
  let pushed = 0
  let rejected = 0

  // --- identity --------------------------------------------------------------
  // Before anything leaves the device.
  const mismatch = await reconcileIdentity()
  if (mismatch) return mismatch

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

    if (isAuthRedirect(response) || isUnauthorized(response)) return { status: 'auth-required' }
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

  if (isAuthRedirect(response) || isUnauthorized(response)) return { status: 'auth-required' }
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

    /* 409 is the one failure worth acting on rather than retrying: the server
     * has no entry with this id on this account, and never will. That happens
     * when the entry itself was rejected during push — rejections ride along in
     * a 200 response body, so the photo loop still runs for a row that did not
     * land. The entry is already flagged in the UI; leaving its photo queued
     * would retry it every five minutes forever. */
    if (photoResponse.status === 409) {
      await local.clearPhoto(photo.entry_id)
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

/** Hand this device over to whoever is signed in now, discarding what is here.
 *
 *  The deliberate way out of an 'identity-mismatch', for someone who has taken
 *  an export first or does not want what is queued. Everything reconcileIdentity
 *  refuses to do on its own, done on purpose. */
export async function discardAndAdopt(): Promise<SyncOutcome> {
  await local.wipe()
  // Goes through sync(), so the result is recorded and every component showing
  // the mismatch stops showing it.
  return sync()
}

/** Number of rows waiting to reach the server. */
export async function pendingCount(): Promise<number> {
  const outbox = await local.pending()
  return SYNC_TABLES.reduce((n, t) => n + outbox[t].length, 0)
}

/* One loop, however many components ask for it.
 *
 * Every screen mounts the sync badge, and /data mounts an account card as well.
 * Without this, each would install its own timer, listeners and store
 * subscription, and a page with two of them would sync twice as often for no
 * benefit. Results reach everyone through subscribeOutcome regardless. */
let autoSyncUsers = 0
let stopAutoSync: (() => void) | undefined

/** Syncs after local edits, on reconnect, on tab focus, and on a slow timer. */
export function startAutoSync(): () => void {
  autoSyncUsers += 1
  if (autoSyncUsers === 1) stopAutoSync = beginAutoSync()

  let released = false
  return () => {
    if (released) return
    released = true
    autoSyncUsers -= 1
    if (autoSyncUsers === 0) {
      stopAutoSync?.()
      stopAutoSync = undefined
    }
  }
}

function beginAutoSync(): () => void {
  let stopped = false

  const attempt = () => {
    if (stopped) return
    void sync()
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
