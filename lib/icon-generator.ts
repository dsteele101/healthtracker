import Anthropic from '@anthropic-ai/sdk'
import { MAX_ICON_SVG_LENGTH, sanitizeIconSvg } from './icon-svg'

/* Draws an exercise icon from the exercise's name.
 *
 * Server-only: it holds the API key, and the browser never talks to Anthropic
 * directly. Reached through app/api/exercise-icon.
 *
 * Opus 5 by default, where the OCR read next door uses Haiku. The two look
 * similar -- one short call, one small answer -- but they are not the same kind
 * of work: reading five fields off a screenshot is transcription, and drawing a
 * legible pictogram of "Bulgarian split squat" is not. Model quality is exactly
 * what separates a recognisable figure from a scribble, and an icon is drawn
 * once per exercise rather than once per log, so the cost sits in a different
 * order of magnitude than photo import's. Override with CLAUDE_ICON_MODEL. */
const DEFAULT_MODEL = 'claude-opus-5'

/** The schema the response is constrained to. One field: the drawing. */
const ICON_SCHEMA = {
  type: 'object',
  properties: {
    svg: {
      type: 'string',
      description:
        'The inner markup of the icon: shape elements only, no <svg> wrapper.',
    },
  },
  required: ['svg'],
  additionalProperties: false,
} as const

/* The house style is spelled out rather than left to taste, because a generated
 * icon sits in a grid next to the hand-drawn ones and any drift shows
 * immediately. SquatIcon is quoted verbatim as the worked example -- it is a
 * real preset from app/components/squat-icon.tsx, so matching it is matching
 * what ships.
 *
 * The element and attribute rules are not the security boundary; lib/icon-svg.ts
 * is. They are here so the common case comes back usable on the first attempt
 * instead of being rejected after the user has waited for it. */
const SYSTEM_PROMPT = `You draw tiny monochrome pictograms for a workout tracker.

Given the name of an exercise, return one icon depicting that movement.

Output rules:
- Return only the *contents* of an <svg viewBox="0 0 100 100">. No <svg> wrapper,
  no <defs>, no <style>, no <text>, no comments.
- Use only these elements: path, circle, ellipse, rect, line, polyline, polygon, g.
- Use only geometry and stroke/fill attributes. No ids, no classes, no url(...)
  references, no gradients, no images.
- Draw in a single color: fill="none" stroke="currentColor" with
  stroke-linecap="round" and stroke-linejoin="round". Use stroke-width="6" for
  the figure and no thinner than "4" for equipment. Solid fill="currentColor" is
  fine for a small detail like a head or a weight plate.
- Stay inside the 4-96 range on both axes so nothing clips.
- Keep it under ${MAX_ICON_SVG_LENGTH} characters.

Style rules:
- It is displayed at about 24 pixels. A handful of confident strokes reads at
  that size; fine detail, shading and texture do not.
- Draw a stick figure performing the movement, plus the one piece of equipment
  that identifies it (a barbell, a rope, a bench) when there is one. Prefer the
  pose that makes the exercise recognisable at a glance over anatomical accuracy.
- If the name means nothing to you, draw the most plausible reading of it rather
  than a generic dumbbell.

Worked example, for "Squat":
<circle cx="50" cy="18" r="9" fill="none" stroke="currentColor" stroke-width="6" />
<path d="M50 27 L50 50 M50 32 L28 15 M50 32 L72 15 M50 50 L28 62 L24 90 M50 50 L72 62 L76 90" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />`

export function isIconGenerationConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

/**
 * Returns sanitized icon markup ready to store, or throws.
 *
 * The model's output is run through the same sanitizer the sync endpoint uses,
 * so a drawing that strays outside the house rules is refused here rather than
 * reaching a row -- and by extension, everyone else's devices.
 */
export async function generateIconSvg(exerciseName: string): Promise<string> {
  const client = new Anthropic()

  const response = await client.messages.create({
    model: process.env.CLAUDE_ICON_MODEL ?? DEFAULT_MODEL,
    /* The drawing itself is a few hundred tokens. The headroom is for thinking,
     * which is on by default on this model and counts against the same ceiling
     * -- sized too tightly, the icon truncates mid-path. */
    max_tokens: 8192,
    /* Someone is watching a spinner on a button. Full effort buys deliberation
     * this task doesn't need and seconds the person does notice; medium draws
     * the same quality of pictogram in a fraction of the time. */
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: ICON_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: exerciseName }],
  })

  // A safety refusal returns 200 with no usable content; check before reading.
  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to draw this exercise.')
  }

  const text = response.content.find((block) => block.type === 'text')?.text
  if (!text) throw new Error('Claude returned no content.')

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Claude returned malformed JSON.')
  }

  const svg = (parsed as { svg?: unknown }).svg
  if (typeof svg !== 'string') throw new Error('Claude returned no drawing.')

  return sanitizeIconSvg(svg)
}
