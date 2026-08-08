import { requireUser } from '@/lib/auth'
import type { MeResponse } from '@/lib/types'

/* Who the server thinks is calling.
 *
 * The client needs this for one thing that matters and one that's cosmetic. The
 * cosmetic one is showing an address on the Data screen. The one that matters is
 * that IndexedDB is a single fixed database name on the device: if a different
 * account signs in on the same browser, the local store has to be cleared before
 * anything is pushed, or one person's queued rows land under another's identity
 * and become theirs. lib/sync.ts checks this against the id it recorded locally
 * before every push. */
export async function GET(request: Request) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const response: MeResponse = {
    id: auth.user.id,
    email: auth.user.email,
    display_name: auth.user.display_name,
  }
  return Response.json(response)
}
