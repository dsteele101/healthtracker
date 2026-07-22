/** JSON schema shared by the structured providers (Claude, Gemini).
 *
 *  Both are asked for the same shape so their outputs are interchangeable and
 *  can be compared directly when benchmarking providers against real photos. */

export const DDR_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    song_title: {
      type: ['string', 'null'],
      description:
        'The song title exactly as printed. Null if not legible.',
    },
    difficulty: {
      type: ['integer', 'null'],
      description:
        'The numeric foot rating (1-20), not the judgement counts or combo. Null if not visible.',
    },
    difficulty_scale: {
      type: ['string', 'null'],
      enum: ['old', 'new', null],
      description:
        "'old' if the rating is on the 1-10 scale, 'new' if 1-20. Null if unclear.",
    },
    percentage_score: {
      type: ['number', 'null'],
      description: 'The percentage score, 0-100, to two decimals. Null if not visible.',
    },
    song_length_seconds: {
      type: ['integer', 'null'],
      description: 'Song length in seconds if a duration is shown. Null otherwise.',
    },
  },
  required: [
    'song_title',
    'difficulty',
    'difficulty_scale',
    'percentage_score',
    'song_length_seconds',
  ],
  additionalProperties: false,
} as const

export const EXTRACTION_PROMPT = `This is a Dance Dance Revolution results screen.

Extract the five fields in the schema. Rules:
- The difficulty is the chart's foot rating, usually a small number next to a
  difficulty name (BEGINNER, BASIC, DIFFICULT, EXPERT, CHALLENGE). It is NOT the
  combo count, the judgement tallies, or the score.
- The percentage score is the accuracy figure, typically shown with a % sign.
- Report the song title exactly as printed, including unusual capitalisation.
- Use null for anything you cannot read with confidence. A null is far better
  than a guess: these values are being recorded as a permanent log, and a wrong
  number is worse than a blank one the user fills in.`

/** Narrows a structured provider's raw JSON to the fields we accept, dropping
 *  nulls and anything out of range. Shared so Claude and Gemini can't drift. */
export function coerceExtraction(raw: unknown): {
  song_title?: string
  difficulty?: number
  difficulty_scale?: 'old' | 'new'
  percentage_score?: number
  song_length_seconds?: number
} {
  if (typeof raw !== 'object' || raw === null) return {}
  const value = raw as Record<string, unknown>
  const out: ReturnType<typeof coerceExtraction> = {}

  if (typeof value.song_title === 'string' && value.song_title.trim()) {
    out.song_title = value.song_title.trim()
  }

  const scale = value.difficulty_scale
  if (scale === 'old' || scale === 'new') out.difficulty_scale = scale

  if (typeof value.difficulty === 'number' && Number.isInteger(value.difficulty)) {
    // Validated against the reported scale when present, since a 16 is
    // impossible on the old scale and indicates a misread.
    const max = out.difficulty_scale === 'old' ? 10 : 20
    if (value.difficulty >= 1 && value.difficulty <= max) out.difficulty = value.difficulty
  }

  if (typeof value.percentage_score === 'number' && Number.isFinite(value.percentage_score)) {
    if (value.percentage_score >= 0 && value.percentage_score <= 100) {
      out.percentage_score = Math.round(value.percentage_score * 100) / 100
    }
  }

  if (
    typeof value.song_length_seconds === 'number' &&
    Number.isInteger(value.song_length_seconds) &&
    value.song_length_seconds > 0 &&
    value.song_length_seconds <= 3600
  ) {
    out.song_length_seconds = value.song_length_seconds
  }

  return out
}
