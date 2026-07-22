import { configuredProviderName, getProvider, isClientSideProvider } from '@/lib/ocr'

/** Refuse anything larger than a phone photo. */
const MAX_BYTES = 12 * 1024 * 1024

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])

/** Reports what photo import can do right now, so the form knows whether to
 *  offer the camera at all rather than failing after the user takes a photo. */
export async function GET() {
  const name = configuredProviderName()
  return Response.json({
    provider: name,
    clientSide: isClientSideProvider(name),
    available: isClientSideProvider(name) || getProvider() !== null,
  })
}

export async function POST(request: Request) {
  const provider = getProvider()
  if (!provider) {
    // Not a server error: this is the documented "no credential configured"
    // path, and the client falls back to manual entry.
    return Response.json(
      { error: 'Photo import is not configured on the server.', code: 'not_configured' },
      { status: 503 },
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ error: 'Expected multipart form data.' }, { status: 400 })
  }

  const file = form.get('image')
  if (!(file instanceof File)) {
    return Response.json({ error: 'No image supplied.' }, { status: 400 })
  }
  if (file.size === 0) {
    return Response.json({ error: 'Image is empty.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `Image is too large (max ${MAX_BYTES / 1024 / 1024} MB).` },
      { status: 413 },
    )
  }
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    return Response.json({ error: `Unsupported image type: ${file.type}` }, { status: 415 })
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await provider.extract(buffer, file.type || 'image/jpeg')
    /* Raw text is returned rather than parsed here: the fuzzy-match corpus is
     * the set of songs already logged, and that lives in the browser's local
     * store. Parsing on the client is what lets the match improve as more
     * entries accumulate, without the server holding any of it. */
    return Response.json(result)
  } catch (error) {
    console.error('OCR extraction failed:', error)
    return Response.json(
      { error: 'Could not read that image.', code: 'extraction_failed' },
      { status: 502 },
    )
  }
}
