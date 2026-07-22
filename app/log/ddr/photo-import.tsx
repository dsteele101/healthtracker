'use client'

import { useEffect, useRef, useState } from 'react'
import { compressImage } from '@/lib/compress-image'
import { parseDdrText, type DdrFields, type ExtractionResult } from '@/lib/ocr'
import type { DifficultyScale } from '@/lib/types'

interface Props {
  corpus: string[]
  scale: DifficultyScale
  onFields: (fields: DdrFields, note: string) => void
  /** Compressed copy of whatever was captured, for storage — independent of
   *  whether OCR manages to read it. */
  onPhoto: (blob: Blob) => void
}

interface Availability {
  provider: string
  clientSide: boolean
  available: boolean
}

/** Tesseract's first run initialises a WASM runtime and loads training data,
 *  which takes long enough to look like a hang without a label saying so. */
function readingLabel(availability: Availability | null): string {
  return availability?.clientSide ? 'Reading on device…' : 'Reading photo…'
}

/** Camera capture that pre-fills the form from a results screen.
 *
 *  Never saves anything on its own — it fills fields and hands back a note
 *  about what it read, so a bad OCR guess is always visible before it lands. */
export function PhotoImport({ corpus, scale, onFields, onPhoto }: Props) {
  const cameraInput = useRef<HTMLInputElement>(null)
  const libraryInput = useRef<HTMLInputElement>(null)
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Ask up front whether import is usable, so the button isn't offered only to
  // fail after the user has taken a photo.
  useEffect(() => {
    let cancelled = false
    fetch('/api/ocr')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setAvailability(data)
      })
      .catch(() => {
        if (!cancelled) setAvailability(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setBusy(true)
    setError(null)

    // Independent of the read below: a wrong OCR guess doesn't mean a wrong
    // photo, so this isn't gated on `applyResult` succeeding. Best-effort —
    // an unsupported format (e.g. HEIC in a browser without decode support)
    // just means this entry saves without a photo, not that import fails.
    compressImage(file).then(onPhoto).catch(() => {})

    try {
      const result = availability?.clientSide
        ? await extractLocally(file)
        : await extractOnServer(file)

      applyResult(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Photo import failed.')
    } finally {
      setBusy(false)
    }
  }

  /** Tesseract: runs in a worker in this tab, never touches the server. */
  async function extractLocally(file: File): Promise<ExtractionResult> {
    const { extractWithTesseract } = await import('@/lib/ocr/tesseract-client')
    return extractWithTesseract(file)
  }

  async function extractOnServer(file: File): Promise<ExtractionResult> {
    const body = new FormData()
    body.append('image', file)

    const response = await fetch('/api/ocr', { method: 'POST', body, redirect: 'manual' })

    /* An expired Cloudflare Access session answers with a redirect to its login
     * origin. With redirect: 'manual' that arrives as an opaqueredirect (status
     * 0); the 3xx check is belt-and-braces for any proxy that passes the status
     * through instead. Either way the useful message is "sign in again", not
     * "could not read that image". */
    if (
      response.type === 'opaqueredirect' ||
      response.redirected ||
      (response.status >= 300 && response.status < 400)
    ) {
      throw new Error('Session expired. Reload the page and sign in again.')
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload.error ?? `Could not read that image (${response.status}).`)
    }

    return (await response.json()) as ExtractionResult
  }

  /** Both provider shapes converge here: structured results are used as-is,
   *  text-only ones go through the parse layer that does corpus matching. */
  function applyResult(result: ExtractionResult) {
    if (result.fields && Object.keys(result.fields).length > 0) {
      onFields(result.fields, `Read by ${result.provider}. Check the values before saving.`)
      return
    }

    if (!result.raw_text?.trim()) {
      throw new Error('No text found in that photo. Try a straighter, brighter shot.')
    }

    const parsed = parseDdrText(result.raw_text, { corpus, scale })

    if (Object.keys(parsed.fields).length === 0) {
      throw new Error(
        corpus.length === 0
          ? 'Nothing recognised. Log a few songs by hand first — matching improves as your history grows.'
          : 'Nothing recognised in that photo. Try a straighter, brighter shot.',
      )
    }

    const notes: string[] = []
    if (parsed.songMatch) {
      // Showing the raw read makes a wrong match obvious at a glance.
      notes.push(
        `Matched "${parsed.songMatch.matchedLine}" to ${parsed.songMatch.title}` +
          ` (${Math.round(parsed.songMatch.confidence * 100)}%)`,
      )
    }
    if (parsed.missing.length > 0) {
      notes.push(`Could not read: ${parsed.missing.join(', ').replaceAll('_', ' ')}`)
    }

    onFields(parsed.fields, notes.join(' · ') || 'Check the values before saving.')
  }

  // Nothing configured: stay silent rather than advertising a dead button.
  if (availability && !availability.available) return null

  const disabled = busy || availability === null

  return (
    <div className="field">
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        // Opens the camera directly on a phone instead of the photo library.
        capture="environment"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
      <input
        ref={libraryInput}
        type="file"
        accept="image/*"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
      <div className="row">
        <button
          type="button"
          className="btn grow"
          onClick={() => cameraInput.current?.click()}
          disabled={disabled}
        >
          {busy ? readingLabel(availability) : 'Take photo'}
        </button>
        <button
          type="button"
          className="btn grow"
          onClick={() => libraryInput.current?.click()}
          disabled={disabled}
        >
          Choose photo
        </button>
      </div>
      {availability?.clientSide && (
        <p className="hint">
          Reads on this device, without sending the photo anywhere.
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
