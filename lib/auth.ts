/* Who is calling.
 *
 * Cloudflare Access is still the only thing standing between the internet and
 * this app -- nothing unauthenticated reaches the tunnel. What changed is that
 * the app now reads the identity Access already established, instead of
 * assuming there is exactly one person on the other end.
 *
 * Access signs a JWT and sends it on every proxied request. Verifying it, rather
 * than trusting the plaintext Cf-Access-Authenticated-User-Email header sitting
 * next to it, is the whole point: cloudflared forwards client headers verbatim,
 * so anything that reaches this process by another route -- a curl at
 * 127.0.0.1:3000, a second tunnel, a misconfigured ingress -- can set that
 * header to whatever it likes. Only the signature is evidence.
 *
 * Every failure mode here returns a response instead of a user. There is no path
 * through this file that produces an identity without either a verified
 * signature or a development build. */

import { createRemoteJWKSet, errors, jwtVerify } from 'jose'
import { query } from './db'

export interface AuthUser {
  id: string
  email: string
  display_name: string | null
}

/* A result rather than a thrown exception, so that forgetting to handle the
 * failure case is a type error at the call site instead of an unguarded throw
 * that some outer catch turns into a 500 -- or worse, into a fallthrough. */
export type AuthResult = { ok: true; user: AuthUser } | { ok: false; response: Response }

function deny(status: number, error: string): { ok: false; response: Response } {
  return { ok: false, response: Response.json({ error }, { status }) }
}

/** Access sets both; the header is the normal path, the cookie covers requests
 *  the header didn't survive (some proxy configurations strip unknown headers). */
const ASSERTION_HEADER = 'cf-access-jwt-assertion'
const ASSERTION_COOKIE = 'CF_Authorization'

function cookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() !== name) continue
    return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return undefined
}

/* Built once and kept, because the whole value of createRemoteJWKSet is the
 * state it holds: a TTL cache of Cloudflare's signing keys, an automatic
 * re-fetch when a token arrives with an unrecognised `kid` (which is how key
 * rotation, roughly every six weeks, is meant to be absorbed), and a cooldown
 * on that re-fetch. The cooldown is not an optimisation -- without it, a caller
 * sending random `kid` values turns this app into a request amplifier pointed
 * at Cloudflare. */
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined
let jwksTeamDomain: string | undefined

function keys(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks || jwksTeamDomain !== teamDomain) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`), {
      cacheMaxAge: 10 * 60 * 1000,
      cooldownDuration: 30 * 1000,
    })
    jwksTeamDomain = teamDomain
  }
  return jwks
}

/** Cloudflare's application token carries email/sub/aud/iss/exp and no name
 *  claim, so the local part of the address is the only display name available
 *  without asking. It is never shown to anyone but its owner. */
function nameFromEmail(email: string): string {
  return email.slice(0, email.indexOf('@'))
}

/** Roughly how stale last_seen_at is allowed to get before it's worth a write.
 *  Only used to keep an idle tab from issuing an UPDATE every five minutes. */
const LAST_SEEN_INTERVAL_MS = 60 * 60 * 1000

interface UserRow extends Record<string, unknown> {
  id: string
  email: string
  display_name: string | null
  last_seen_at: Date
}

/* First request from a newly-authorized email creates the account. Access
 * already decided this person is allowed in; there is nothing further to
 * approve, and an "awaiting activation" state would only be a second list to
 * keep in sync with the Access policy. */
async function provision(email: string): Promise<AuthUser> {
  const found = await query<UserRow>(
    'SELECT id, email, display_name, last_seen_at FROM users WHERE lower(email) = lower($1)',
    [email],
  )

  if (found.length > 0) {
    const user = found[0]
    if (Date.now() - user.last_seen_at.getTime() > LAST_SEEN_INTERVAL_MS) {
      await query('UPDATE users SET last_seen_at = now() WHERE id = $1', [user.id])
    }
    return { id: user.id, email: user.email, display_name: user.display_name }
  }

  /* ON CONFLICT DO NOTHING and then re-read, rather than DO UPDATE ... RETURNING:
   * a DO UPDATE whose WHERE clause fails returns no row at all, which would turn
   * two devices signing in at once into a failed login rather than a no-op. */
  await query(
    `INSERT INTO users (email, display_name) VALUES ($1, $2)
     ON CONFLICT (lower(email)) DO NOTHING`,
    [email, nameFromEmail(email)],
  )

  const created = await query<UserRow>(
    'SELECT id, email, display_name, last_seen_at FROM users WHERE lower(email) = lower($1)',
    [email],
  )
  const user = created[0]
  return { id: user.id, email: user.email, display_name: user.display_name }
}

/** Identity for a request, or the response to return instead. */
export async function requireUser(request: Request): Promise<AuthResult> {
  /* The only branch that yields a user without a signature, and it does not
   * exist in a production build: process.env.NODE_ENV is inlined at compile
   * time, so this collapses to `if (false)` and is eliminated. That is
   * deliberately the sole gate -- a runtime opt-in like ALLOW_DEV_AUTH would be
   * one stray line in a .env file away from disabling authentication on the
   * real deployment, and nothing would look wrong until it was. */
  if (process.env.NODE_ENV !== 'production') {
    const email = cookie(request, 'dev_user') ?? process.env.DEV_USER_EMAIL
    if (email) return { ok: true, user: await provision(email) }
  }

  /* Read lazily rather than at module load. lib/db.ts documents the same
   * reasoning: this module gets imported during `next build`, where neither the
   * environment nor the network is necessarily there yet. */
  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN
  const aud = process.env.CF_ACCESS_AUD
  if (!teamDomain || !aud) {
    /* Fail closed, and loudly. Misconfiguration must never read as "no identity
     * required" -- 503 rather than 401 because the caller did nothing wrong and
     * retrying after this is fixed is the correct behaviour. */
    console.error('CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD must both be set')
    return deny(503, 'authentication is not configured')
  }

  const token = request.headers.get(ASSERTION_HEADER) ?? cookie(request, ASSERTION_COOKIE)
  if (!token) return deny(401, 'not signed in')

  let email: unknown
  try {
    const { payload } = await jwtVerify(token, keys(teamDomain), {
      issuer: `https://${teamDomain}`,
      audience: aud,
      // Pinned here rather than taken from the token's own header, which is the
      // difference between verifying a signature and asking the token whether
      // it would like to be verified.
      algorithms: ['RS256'],
      clockTolerance: 30,
    })
    email = payload.email
  } catch (error) {
    /* A JOSE error means the token itself did not hold up -- bad signature,
     * wrong audience, expired, unknown key. That is a 401.
     *
     * Anything else means we could not reach Cloudflare to fetch the signing
     * keys, and a JWKSTimeout is the same thing with a nicer name. Those are
     * our problem, not the caller's, and must be a 503: the sync engine leaves
     * rows queued on a 503 but would report "sign in again" on a 401, sending
     * someone off to fix an account that is perfectly fine. */
    if (error instanceof errors.JOSEError && !(error instanceof errors.JWKSTimeout)) {
      return deny(401, 'not signed in')
    }
    console.error('Access token verification unavailable:', error)
    return deny(503, 'authentication is unavailable')
  }

  if (typeof email !== 'string' || email.trim() === '') {
    console.error('Access token carried no email claim')
    return deny(401, 'not signed in')
  }

  return { ok: true, user: await provision(email.trim()) }
}
