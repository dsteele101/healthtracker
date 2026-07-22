import type { LinkPreview } from '@/lib/link-preview'

/* Fetches a linked page server-side and scrapes its Open Graph tags for a
 * title/description/thumbnail. Server-side because the client can't read
 * cross-origin response bodies for arbitrary sites (no CORS header), and this
 * runs once per link edit rather than per view, so hand-rolled regex parsing
 * beats pulling in an HTML parser for a handful of <meta> tags. */

const MAX_BYTES = 200_000
const FETCH_TIMEOUT_MS = 6000

// The link is typed in by this app's own single user, but still: don't let it
// point the server at its own network.
const LOCAL_HOSTNAME_RE =
  /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|::1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/i

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .trim()
}

/** Matches a <meta> tag by property/name in either attribute order. */
function extractMeta(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const attr of ['property', 'name']) {
    const forward = new RegExp(`<meta[^>]*${attr}=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i')
    const backward = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${escaped}["']`, 'i')
    const match = html.match(forward) ?? html.match(backward)
    if (match?.[1]) return decodeEntities(match[1])
  }
  return null
}

function extractTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return match?.[1] ? decodeEntities(match[1]) : null
}

/** Reads up to `maxBytes` of the body — plenty for a <head>, and a hard cap
 *  against a malicious or enormous response. */
async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''

  const chunks: Uint8Array[] = []
  let total = 0
  while (total < maxBytes) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.byteLength
  }
  await reader.cancel().catch(() => {})

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8')
}

function empty(hostname: string): LinkPreview {
  return { title: null, description: null, image: null, siteName: null, hostname }
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('url')
  if (!raw) return Response.json({ error: 'url is required' }, { status: 400 })

  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return Response.json({ error: 'invalid url' }, { status: 400 })
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return Response.json({ error: 'url must be http(s)' }, { status: 400 })
  }
  if (LOCAL_HOSTNAME_RE.test(target.hostname)) {
    return Response.json({ error: 'url must not target a local address' }, { status: 400 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; healthtracker-link-preview/1.0)' },
    })

    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok || !contentType.includes('text/html')) {
      return Response.json(empty(target.hostname))
    }

    const html = await readCapped(response, MAX_BYTES)
    const image = extractMeta(html, 'og:image')

    const preview: LinkPreview = {
      title: extractMeta(html, 'og:title') ?? extractTitleTag(html),
      description: extractMeta(html, 'og:description') ?? extractMeta(html, 'description'),
      // Resolved against the post-redirect URL, since a relative og:image is
      // relative to wherever the page actually ended up.
      image: image ? new URL(image, response.url).toString() : null,
      siteName: extractMeta(html, 'og:site_name'),
      hostname: target.hostname,
    }

    return Response.json(preview)
  } catch {
    // Unreachable, timed out, or malformed — the client falls back to
    // showing the bare hostname rather than surfacing a fetch error for what
    // is, from the user's perspective, an optional decoration.
    return Response.json(empty(target.hostname))
  } finally {
    clearTimeout(timeout)
  }
}
