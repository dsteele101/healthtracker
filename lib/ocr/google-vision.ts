import type { ExtractionResult, OcrProvider } from './types'

const ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate'

/**
 * Google Cloud Vision, via REST with an API key.
 *
 * An API key rather than a service account deliberately: service-account auth
 * needs JWT signing and a mounted credentials file, which is a lot of moving
 * parts for one call. Restrict the key to the Vision API in the Google Cloud
 * console and it is scoped tightly enough for a single-user app.
 *
 * The free tier covers roughly 1000 images a month, comfortably above expected
 * use here.
 */
export const googleVision: OcrProvider = {
  name: 'google-vision',

  isConfigured() {
    return Boolean(process.env.GOOGLE_VISION_API_KEY)
  },

  async extract(image: Buffer): Promise<ExtractionResult> {
    const apiKey = process.env.GOOGLE_VISION_API_KEY
    if (!apiKey) throw new Error('GOOGLE_VISION_API_KEY is not set')

    const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: image.toString('base64') },
            // DOCUMENT_TEXT_DETECTION over TEXT_DETECTION: it does denser
            // layout analysis, which holds the results table together instead
            // of scattering the numbers.
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            imageContext: { languageHints: ['en', 'ja'] },
          },
        ],
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Vision API ${response.status}: ${body.slice(0, 300)}`)
    }

    const payload = (await response.json()) as {
      responses?: {
        error?: { message?: string }
        fullTextAnnotation?: { text?: string }
        textAnnotations?: { description?: string }[]
      }[]
    }

    const first = payload.responses?.[0]
    // Vision reports per-image failures inside a 200 response.
    if (first?.error?.message) {
      throw new Error(`Vision API: ${first.error.message}`)
    }

    const text = first?.fullTextAnnotation?.text ?? first?.textAnnotations?.[0]?.description ?? ''

    return {
      raw_text: text,
      // Confidence for text-only providers is decided by the parse layer,
      // which knows whether the text actually yielded usable fields.
      confidence: text.trim() ? 1 : 0,
      provider: 'google-vision',
    }
  },
}
