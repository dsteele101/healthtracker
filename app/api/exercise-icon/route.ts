import { requireUser } from '@/lib/auth'
import { generateIconSvg, isIconGenerationConfigured } from '@/lib/icon-generator'

/** Same ceiling exercise_types.name is validated at, so a name that can be
 *  saved can also be drawn. */
const MAX_NAME_LENGTH = 120

/* Both handlers are gated even though neither touches a user's rows: the model
 * bills per call against a key in this app's environment, so an unauthenticated
 * POST here spends someone's money. Same reasoning as /api/ocr. */

/** Whether the button should be offered at all, so it isn't shown only to fail
 *  after the user presses it. */
export async function GET(request: Request) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  return Response.json({ available: isIconGenerationConfigured() })
}

export async function POST(request: Request) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  if (!isIconGenerationConfigured()) {
    // Not a server error: this is the documented "no credential configured"
    // path, and the form falls back to the preset grid.
    return Response.json(
      { error: 'Icon generation is not configured on the server.', code: 'not_configured' },
      { status: 503 },
    )
  }

  let body: { name?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (name === '') {
    return Response.json({ error: 'Name the exercise first.' }, { status: 400 })
  }
  if (name.length > MAX_NAME_LENGTH) {
    return Response.json(
      { error: `Name exceeds ${MAX_NAME_LENGTH} characters.` },
      { status: 400 },
    )
  }

  try {
    /* Sanitized inside generateIconSvg, so what comes back is already storable
     * — the client puts it straight into the row it is editing. */
    return Response.json({ svg: await generateIconSvg(name) })
  } catch (error) {
    console.error('icon generation failed:', error)
    return Response.json(
      { error: 'Could not draw an icon for that.', code: 'generation_failed' },
      { status: 502 },
    )
  }
}
