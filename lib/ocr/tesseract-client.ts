'use client'

import type { ExtractionResult } from './types'

/* Tesseract runs in the browser, not on the server, because it needs no
 * credential — which also makes it the only provider that can work with no
 * network at all.
 *
 * Accuracy on DDR's stylized title fonts is poor. That is survivable here only
 * because the parse layer fuzzy-matches against songs already logged; the
 * numbers, which render in clean fonts, are what Tesseract actually gets right.
 *
 * Assets are served from this app's own origin when `npm run setup:tesseract`
 * has staged them into public/tesseract/. Left to its defaults, tesseract.js
 * pulls its worker, WASM core, and training data from cdn.jsdelivr.net at
 * runtime — which for a self-hosted app behind Access means
 * phoning out to a third party and breaking offline use. Local assets are
 * preferred; the CDN remains the fallback so nothing hard-fails if the setup
 * step was skipped. */

const LOCAL_BASE = '/tesseract'

let workerPromise: Promise<import('tesseract.js').Worker> | null = null
let localAssets: boolean | null = null

/** One probe per page load, for whether the assets were staged locally. */
async function hasLocalAssets(): Promise<boolean> {
  if (localAssets !== null) return localAssets
  try {
    const response = await fetch(`${LOCAL_BASE}/eng.traineddata.gz`, { method: 'HEAD' })
    localAssets = response.ok
  } catch {
    localAssets = false
  }
  return localAssets
}

/** One worker for the page's lifetime: recreating it re-initialises the WASM
 *  runtime, which is the slow part. */
async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js')
      const local = await hasLocalAssets()

      return createWorker(
        'eng',
        undefined,
        local
          ? {
              workerPath: `${LOCAL_BASE}/worker.min.js`,
              corePath: LOCAL_BASE,
              langPath: LOCAL_BASE,
            }
          : undefined,
      )
    })().catch((error) => {
      // Don't cache a failed init, or every later attempt reuses the failure.
      workerPromise = null
      throw error
    })
  }
  return workerPromise
}

/** Whether OCR will run without touching the network. */
export async function isFullyLocal(): Promise<boolean> {
  return hasLocalAssets()
}

export async function extractWithTesseract(file: File): Promise<ExtractionResult> {
  const worker = await getWorker()
  const { data } = await worker.recognize(file)

  return {
    raw_text: data.text ?? '',
    // Tesseract reports 0-100 per-block confidence; the parse layer decides
    // what the text is actually worth.
    confidence: (data.confidence ?? 0) / 100,
    provider: 'tesseract',
  }
}

/** Frees the WASM worker. */
export async function terminateTesseract(): Promise<void> {
  if (!workerPromise) return
  const pending = workerPromise
  workerPromise = null
  try {
    const worker = await pending
    await worker.terminate()
  } catch {
    // Already gone, or never started.
  }
}
