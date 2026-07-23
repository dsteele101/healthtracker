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
    artist: {
      type: ['string', 'null'],
      description:
        "The song's credited artist/composer, exactly as printed. Null if not shown.",
    },
    difficulty: {
      type: ['integer', 'null'],
      description:
        'The numeric foot rating (1-20), not the judgement counts or combo. Null if not visible.',
    },
    difficulty_scale: {
      // Claude's structured-output schema compiler rejects `enum` combined
      // with a `type` array — anyOf is the supported way to express a
      // nullable enum.
      anyOf: [{ type: 'string', enum: ['old', 'new'] }, { type: 'null' }],
      description:
        "'old' if the rating is on the 1-10 scale, 'new' if 1-20. Null if unclear.",
    },
    difficulty_type: {
      type: ['string', 'null'],
      description:
        "The difficulty name printed next to the foot rating (e.g. Beginner, Easy, "
        + 'Medium, Hard, Expert, Challenge — themes vary). Report it exactly as shown. '
        + 'Null if not visible.',
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
    'artist',
    'difficulty',
    'difficulty_scale',
    'difficulty_type',
    'percentage_score',
    'song_length_seconds',
  ],
  additionalProperties: false,
} as const

/** Total field count in the schema above, used to normalise confidence
 *  scores consistently across providers. */
export const EXTRACTION_FIELD_COUNT = DDR_EXTRACTION_SCHEMA.required.length

export const EXTRACTION_PROMPT = `This is a rhythm-game (Dance Dance Revolution, ITGmania, or similar) results screen, showing the outcome of the song just played.

The screen may ALSO show a "recently played" or history list of other songs
played earlier in the session, alongside the current result. That history list
is NOT the answer — every field below must describe the CURRENT result only,
the one this results screen is actually reporting on. If you cannot tell which
text belongs to the current result and which belongs to a history/list of
past plays, prefer null over guessing from the wrong one.

Extract the fields in the schema. Rules:
- song_title and artist describe the song just played (the current result),
  never an entry from a "recently played" sidebar or history list.
- The difficulty is the chart's foot rating, usually a small number next to a
  difficulty name (Beginner, Easy, Medium, Hard, Expert, Challenge, etc. —
  naming varies by game/theme). It is NOT the combo count, the judgement
  tallies, or the score.
- difficulty_type is that difficulty name itself, reported exactly as printed.
- The percentage score is the accuracy figure, typically shown with a % sign.
- Report song_title and artist exactly as printed, including unusual capitalisation.
- Use null for anything you cannot read with confidence, or that you cannot
  confidently attribute to the current result. A null is far better than a
  guess: these values are being recorded as a permanent log, and a wrong value
  is worse than a blank one the user fills in.`

/** Narrows a structured provider's raw JSON to the fields we accept, dropping
 *  nulls and anything out of range. Shared so Claude and Gemini can't drift. */
export function coerceExtraction(raw: unknown): {
  song_title?: string
  artist?: string
  difficulty?: number
  difficulty_scale?: 'old' | 'new'
  difficulty_type?: string
  percentage_score?: number
  song_length_seconds?: number
} {
  if (typeof raw !== 'object' || raw === null) return {}
  const value = raw as Record<string, unknown>
  const out: ReturnType<typeof coerceExtraction> = {}

  if (typeof value.song_title === 'string' && value.song_title.trim()) {
    out.song_title = value.song_title.trim()
  }

  if (typeof value.artist === 'string' && value.artist.trim()) {
    out.artist = value.artist.trim().slice(0, 300)
  }

  if (typeof value.difficulty_type === 'string' && value.difficulty_type.trim()) {
    out.difficulty_type = value.difficulty_type.trim().slice(0, 60)
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
