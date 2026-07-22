/** Shared between the API route (fetches it) and the exercise detail page
 *  (renders it). */
export interface LinkPreview {
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
  hostname: string
}

function youtubeEmbedUrl(parsed: URL): string | null {
  const host = parsed.hostname.replace(/^www\./, '')
  let id: string | null = null

  if (host === 'youtu.be') {
    id = parsed.pathname.slice(1)
  } else if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (parsed.pathname === '/watch') id = parsed.searchParams.get('v')
    else if (parsed.pathname.startsWith('/embed/')) id = parsed.pathname.slice('/embed/'.length)
    else if (parsed.pathname.startsWith('/shorts/')) id = parsed.pathname.slice('/shorts/'.length)
  }

  id = id?.split(/[/?&]/)[0] || null
  // -nocookie avoids setting tracking cookies until the viewer presses play.
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
}

function vimeoEmbedUrl(parsed: URL): string | null {
  if (parsed.hostname.replace(/^www\./, '') !== 'vimeo.com') return null
  const id = parsed.pathname.split('/').find(Boolean)
  return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null
}

/** A provider this app can embed directly as a player, skipping the
 *  server-side metadata fetch entirely. Null for anything else. */
export function videoEmbedUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  return youtubeEmbedUrl(parsed) ?? vimeoEmbedUrl(parsed)
}
