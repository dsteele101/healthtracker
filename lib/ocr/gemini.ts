import { DDR_EXTRACTION_SCHEMA, EXTRACTION_PROMPT, coerceExtraction } from './schema'
import type { ExtractionResult, OcrProvider } from './types'

/* Model IDs on the Gemini API move faster than most, so this is configurable
 * rather than pinned in code. If the default 404s, set GEMINI_MODEL to a
 * current one from https://aistudio.google.com/ — the request shape below is
 * stable across them. */
const DEFAULT_MODEL = 'gemini-2.0-flash'

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

/** Gemini's structured-output schema dialect is close to, but not the same as,
 *  JSON Schema: it wants an OpenAPI-style subset with no `additionalProperties`
 *  and nullability expressed as a flag rather than a union type. */
function toGeminiSchema() {
  const properties: Record<string, unknown> = {
    song_title: { type: 'STRING', nullable: true },
    difficulty: { type: 'INTEGER', nullable: true },
    difficulty_scale: { type: 'STRING', enum: ['old', 'new'], nullable: true },
    percentage_score: { type: 'NUMBER', nullable: true },
    song_length_seconds: { type: 'INTEGER', nullable: true },
  }
  return {
    type: 'OBJECT',
    properties,
    required: [...DDR_EXTRACTION_SCHEMA.required],
  }
}

export const gemini: OcrProvider = {
  name: 'gemini',

  isConfigured() {
    return Boolean(process.env.GEMINI_API_KEY)
  },

  async extract(image: Buffer, mimeType: string): Promise<ExtractionResult> {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set')

    const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL

    const response = await fetch(
      `${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: mimeType || 'image/jpeg', data: image.toString('base64') } },
                { text: EXTRACTION_PROMPT },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: toGeminiSchema(),
          },
        }),
      },
    )

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Gemini API ${response.status}: ${body.slice(0, 300)}`)
    }

    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
      promptFeedback?: { blockReason?: string }
    }

    if (payload.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked the request: ${payload.promptFeedback.blockReason}`)
    }

    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('Gemini returned no content.')

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error('Gemini returned malformed JSON.')
    }

    const fields = coerceExtraction(parsed)

    return {
      fields,
      confidence: Object.keys(fields).length / 4,
      provider: 'gemini',
    }
  },
}
