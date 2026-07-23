/* Turns OCR text from a DDR results screen into entry fields.
 *
 * The hard part isn't reading pixels, it's reading *stylized* text. Song titles
 * on a results screen are decorative and OCR mangles them. But the set of songs
 * that could plausibly appear is small — it's the ones already logged — so the
 * title only has to land nearer the right entry than any other. That reframing
 * is what makes a plain-OCR provider viable at all.
 *
 * The numbers are the opposite: score and difficulty render in clean fonts and
 * are the most reliable things on the screen. */

import type { DdrFields } from './types'
import type { DifficultyScale } from '../types'

// --- fuzzy matching ----------------------------------------------------------

/** Strips the decoration OCR trips over so comparison is on letters alone. */
export function normalizeTitle(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    // Drop combining marks, so "é" matches "e".
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

/** Levenshtein distance, iterative with two rows. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  let current = new Array<number>(b.length + 1)

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(
        current[j - 1] + 1, // insertion
        previous[j] + 1, // deletion
        previous[j - 1] + cost, // substitution
      )
    }
    ;[previous, current] = [current, previous]
  }

  return previous[b.length]
}

/** 0–1, where 1 is identical after normalization. */
export function similarity(a: string, b: string): number {
  const x = normalizeTitle(a)
  const y = normalizeTitle(b)
  if (!x && !y) return 1
  if (!x || !y) return 0
  const longest = Math.max(x.length, y.length)
  return 1 - levenshtein(x, y) / longest
}

export interface SongMatch {
  title: string
  confidence: number
  /** The OCR line this matched against, for showing what it read. */
  matchedLine: string
}

/* Below this, a "match" is more likely noise than a real read. Tuned to accept
 * ordinary OCR damage ("PARAN0iA" for "PARANOiA") while rejecting unrelated
 * lines that happen to share letters. */
const MATCH_THRESHOLD = 0.55

/**
 * Finds the corpus entry closest to any line of OCR text.
 *
 * Every line is tried because the title's position on the screen varies and the
 * largest text isn't reliably first in the OCR output.
 */
export function matchSong(lines: string[], corpus: string[]): SongMatch | null {
  if (corpus.length === 0) return null

  let best: SongMatch | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    // Very short fragments match too many things by accident.
    if (normalizeTitle(trimmed).length < 3) continue

    for (const candidate of corpus) {
      const score = similarity(trimmed, candidate)
      if (score > (best?.confidence ?? 0)) {
        best = { title: candidate, confidence: score, matchedLine: trimmed }
      }
    }
  }

  return best && best.confidence >= MATCH_THRESHOLD ? best : null
}

// --- field extraction --------------------------------------------------------

/** Words that appear next to the difficulty rating on a results screen. */
const DIFFICULTY_WORDS =
  /\b(BEGINNER|BASIC|DIFFICULT|EXPERT|CHALLENGE|LIGHT|STANDARD|HEAVY|ONI)\b/i

/**
 * A percentage between 0 and 100, preferring one written with a % sign.
 *
 * OCR often reads the decimal point as a comma, and sometimes drops it — so a
 * bare "9483" is read as 94.83 when a 4-digit run appears next to a % sign.
 */
export function extractScore(text: string): number | undefined {
  const withPercent = [...text.matchAll(/(\d{1,3})[.,](\d{1,2})\s*%/g)]
  for (const match of withPercent) {
    const value = Number(`${match[1]}.${match[2]}`)
    if (value >= 0 && value <= 100) return value
  }

  // A percent sign with a run of digits and no separator: 9483% -> 94.83
  const squashed = [...text.matchAll(/\b(\d{4})\s*%/g)]
  for (const match of squashed) {
    const value = Number(match[1]) / 100
    if (value >= 0 && value <= 100) return value
  }

  const bare = [...text.matchAll(/\b(\d{1,3})[.,](\d{1,2})\b/g)]
  for (const match of bare) {
    const value = Number(`${match[1]}.${match[2]}`)
    // 100 exactly is a legitimate perfect score; above it is a misread.
    if (value >= 0 && value <= 100) return value
  }

  /* Whole number with a percent sign. The lookbehind matters: without it,
   * "999.99%" is rejected by the decimal patterns above as out of range, and
   * then this one happily matches the trailing "99" and reports a 99% score.
   * A digit or separator immediately before means this is a fragment of a
   * larger number, not a score. */
  const wholePercent = [...text.matchAll(/(?<![\d.,])(\d{1,3})\s*%/g)]
  for (const match of wholePercent) {
    const value = Number(match[1])
    if (value >= 0 && value <= 100) return value
  }

  return undefined
}

/**
 * The numeric foot rating.
 *
 * Prefers a number sitting on the same line as a difficulty name, since a
 * results screen is full of other small integers (combo counts, judgement
 * tallies) that would otherwise match.
 */
export function extractDifficulty(
  lines: string[],
  scale: DifficultyScale,
): number | undefined {
  const max = scale === 'old' ? 10 : 20
  const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= max

  for (const line of lines) {
    if (!DIFFICULTY_WORDS.test(line)) continue
    for (const match of line.matchAll(/\b(\d{1,2})\b/g)) {
      const value = Number(match[1])
      if (inRange(value)) return value
    }
  }

  // Fall back to a line that is nothing but a plausible rating.
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^\d{1,2}$/.test(trimmed)) {
      const value = Number(trimmed)
      if (inRange(value)) return value
    }
  }

  return undefined
}

/**
 * The difficulty name itself (BEGINNER, EXPERT, etc.), read straight off
 * whichever line matched `DIFFICULTY_WORDS` while locating the number above —
 * that match is otherwise discarded once the number's found.
 */
export function extractDifficultyType(lines: string[]): string | undefined {
  for (const line of lines) {
    const match = line.match(DIFFICULTY_WORDS)
    if (match) return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase()
  }
  return undefined
}

/** Song length, shown as m:ss on the results screen. */
export function extractLength(text: string): number | undefined {
  for (const match of text.matchAll(/\b(\d{1,2}):([0-5]\d)\b/g)) {
    const seconds = Number(match[1]) * 60 + Number(match[2])
    // Sanity bounds: DDR charts run roughly 1 to 5 minutes. Anything outside
    // that is a clock, a timestamp, or a misread.
    if (seconds >= 30 && seconds <= 600) return seconds
  }
  return undefined
}

export interface ParseOptions {
  /** Titles already logged, used as the match corpus. */
  corpus: string[]
  /** Which scale the user currently has selected. */
  scale: DifficultyScale
}

export interface ParseResult {
  fields: DdrFields
  confidence: number
  /** What the title matcher did, so the UI can show its working. */
  songMatch: SongMatch | null
  /** Fields that could not be read, so the form can highlight them. */
  missing: (keyof DdrFields)[]
}

/** Derives entry fields from raw OCR text. */
export function parseDdrText(rawText: string, options: ParseOptions): ParseResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const songMatch = matchSong(lines, options.corpus)
  const score = extractScore(rawText)
  const difficulty = extractDifficulty(lines, options.scale)
  const difficultyType = extractDifficultyType(lines)
  const length = extractLength(rawText)

  const fields: DdrFields = {}
  if (songMatch) fields.song_title = songMatch.title
  if (score !== undefined) fields.percentage_score = score
  if (difficulty !== undefined) fields.difficulty = difficulty
  if (difficultyType !== undefined) fields.difficulty_type = difficultyType
  if (length !== undefined) fields.song_length_seconds = length

  const missing: (keyof DdrFields)[] = []
  if (!fields.song_title) missing.push('song_title')
  if (fields.percentage_score === undefined) missing.push('percentage_score')
  if (fields.difficulty === undefined) missing.push('difficulty')

  /* Weighted toward the score: it's the most reliably readable field and the
   * one most likely to be wrong in a way the user won't notice. A confident
   * title with no score is worth less than the reverse. */
  const confidence =
    (songMatch ? songMatch.confidence * 0.35 : 0) +
    (score !== undefined ? 0.45 : 0) +
    (difficulty !== undefined ? 0.2 : 0)

  return { fields, confidence, songMatch, missing }
}
