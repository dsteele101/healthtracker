import Anthropic from '@anthropic-ai/sdk'
import {
  DDR_EXTRACTION_SCHEMA,
  EXTRACTION_FIELD_COUNT,
  EXTRACTION_PROMPT,
  coerceExtraction,
} from './schema'
import type { ExtractionResult, OcrProvider } from './types'

/* Haiku 4.5 by default: this is a short, well-specified extraction from a
 * single image, which is exactly what the cheapest tier is good at, and it
 * keeps the per-photo cost around a third of a cent. Override with
 * CLAUDE_OCR_MODEL if a read proves too hard for it. */
const DEFAULT_MODEL = 'claude-haiku-4-5'

/** Structured provider: returns the five fields directly, so the raw-text
 *  parse layer is skipped entirely. */
export const claude: OcrProvider = {
  name: 'claude',

  isConfigured() {
    return Boolean(process.env.ANTHROPIC_API_KEY)
  },

  async extract(image: Buffer, mimeType: string): Promise<ExtractionResult> {
    const client = new Anthropic()

    const mediaType = normalizeMediaType(mimeType)

    const response = await client.messages.create({
      model: process.env.CLAUDE_OCR_MODEL ?? DEFAULT_MODEL,
      // The response is a five-field JSON object; no need for headroom.
      max_tokens: 1024,
      output_config: {
        format: { type: 'json_schema', schema: DDR_EXTRACTION_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: image.toString('base64') },
            },
            { type: 'text', text: EXTRACTION_PROMPT },
          ],
        },
      ],
    })

    // A safety refusal returns 200 with no usable content; check before reading.
    if (response.stop_reason === 'refusal') {
      throw new Error('Claude declined to read this image.')
    }

    const text = response.content.find((block) => block.type === 'text')?.text
    if (!text) throw new Error('Claude returned no content.')

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error('Claude returned malformed JSON.')
    }

    const fields = coerceExtraction(parsed)

    return {
      fields,
      // Confidence stands in for how much of the screen was legible: the model
      // nulls what it cannot read, so the count of recovered fields is the
      // signal, not a number the model asserts about itself.
      confidence: Object.keys(fields).length / EXTRACTION_FIELD_COUNT,
      provider: 'claude',
    }
  },
}

type SupportedMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

/** The API accepts a fixed set; anything else (HEIC from an iPhone) is labelled
 *  as JPEG, which is what the browser hands over after capture anyway. */
function normalizeMediaType(mimeType: string): SupportedMediaType {
  switch (mimeType) {
    case 'image/png':
    case 'image/gif':
    case 'image/webp':
      return mimeType
    default:
      return 'image/jpeg'
  }
}
