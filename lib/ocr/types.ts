import type { DifficultyScale } from '../types'

/** The five fields a DDR results screen can yield. */
export interface DdrFields {
  song_title?: string
  difficulty?: number
  difficulty_scale?: DifficultyScale
  song_length_seconds?: number
  percentage_score?: number
}

/**
 * Providers come in two shapes and the interface has to serve both:
 *
 *   - text-only (Google Vision, Tesseract) return `raw_text`, which the shared
 *     parse layer turns into fields;
 *   - structured (Claude, Gemini) can be asked for the fields directly and
 *     skip that step.
 *
 * Both converge on the same confirmation form, so switching providers is a
 * config change and nothing else moves.
 */
export interface ExtractionResult {
  raw_text?: string
  fields?: DdrFields
  /** 0–1. How much to trust this before showing it for confirmation. */
  confidence: number
  /** Which provider produced this, for debugging a bad read. */
  provider: string
}

export interface OcrProvider {
  name: string
  /** True when the credentials this provider needs are actually configured. */
  isConfigured(): boolean
  extract(image: Buffer, mimeType: string): Promise<ExtractionResult>
}

export type ProviderName = 'google-vision' | 'claude' | 'gemini' | 'tesseract'
