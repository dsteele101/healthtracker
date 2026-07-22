'use client'

import { useEffect, useState } from 'react'
import { videoEmbedUrl, type LinkPreview as LinkPreviewData } from '@/lib/link-preview'

/** Renders an exercise's info_url as something richer than a bare link:
 *  YouTube/Vimeo embed as a player, anything else as a title/thumbnail card
 *  built from the page's Open Graph tags. */
export function LinkPreview({ url }: { url: string }) {
  const embedUrl = videoEmbedUrl(url)
  const [preview, setPreview] = useState<LinkPreviewData | null>(null)

  useEffect(() => {
    if (embedUrl) return
    let cancelled = false

    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((res) => (res.ok ? (res.json() as Promise<LinkPreviewData>) : null))
      .then((data) => {
        if (!cancelled && data) setPreview(data)
      })
      // A failed preview fetch just leaves the hostname fallback showing —
      // nothing here is essential to using the app.
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [url, embedUrl])

  if (embedUrl) {
    return (
      <div className="link-preview-video">
        <iframe
          src={embedUrl}
          title="Exercise video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    )
  }

  let hostname = url
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    // Already validated before it's stored; this is just belt-and-suspenders.
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="card link-preview-card">
      {preview?.image && (
        // eslint-disable-next-line @next/next/no-img-element -- a link preview thumbnail doesn't need next/image's pipeline.
        <img className="link-preview-thumb" src={preview.image} alt="" />
      )}
      <div className="grow">
        <div className="subtitle">{preview?.title ?? hostname}</div>
        {preview?.description && (
          <div className="muted link-preview-description">{preview.description}</div>
        )}
        <div className="muted mono">{preview?.siteName ?? hostname}</div>
      </div>
    </a>
  )
}
