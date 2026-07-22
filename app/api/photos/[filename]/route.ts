import { readFile } from 'node:fs/promises'
import path from 'node:path'

const PHOTO_DIR = process.env.PHOTO_DIR ?? path.join(process.cwd(), 'data', 'photos')

// Matches exactly what /api/photos writes: a UUID entry id plus extension.
// Anchored and character-restricted so this can't be walked outside PHOTO_DIR.
const FILENAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/i

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params
  if (!FILENAME_RE.test(filename)) {
    return new Response('Not found', { status: 404 })
  }

  try {
    const data = await readFile(path.join(PHOTO_DIR, filename))
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': 'image/jpeg',
        // The filename is content-addressed by entry id and never reused for
        // different bytes in normal use, so a long cache is safe.
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
