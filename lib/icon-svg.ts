/* Generated exercise icons: what they are, and what makes them safe to render.
 *
 * An icon generated from an exercise's name (see app/api/exercise-icon) is the
 * inner markup of an `<svg viewBox="0 0 100 100">` -- shape elements only, with
 * no root element of its own. Storing it that way buys two things:
 *
 *   - it is rendered with dangerouslySetInnerHTML, and a fragment that cannot
 *     carry a root element cannot carry <script>, <style>, <foreignObject>, an
 *     <image> pointing somewhere else, or an onload= either;
 *   - the viewBox, the sizing class and the currentColor stroke all come from
 *     the surrounding component, so a generated icon lands in the same slot at
 *     the same size and inherits the same color as the hand-drawn presets in
 *     app/components/*-icon.tsx.
 *
 * Everything that writes the column goes through `sanitizeIconSvg` first: the
 * generation route, because a model's output is untrusted, and the sync
 * validator, because a row arriving at /api/sync/push is untrusted too. The
 * renderer trusts the column precisely because nothing can reach it uninspected.
 *
 * The scan below is a whitelist, not a search for known-bad markup. Anything it
 * does not positively recognise -- an element it hasn't heard of, an attribute
 * outside the geometry-and-color set, a stray character in a value, text
 * between two tags -- is rejected rather than interpreted. That is why it can
 * be this short and still be the whole defence. */

/** Roughly ten times the largest hand-drawn preset, which is enough for a
 *  detailed pictogram and far short of anything worth storing in a row. */
export const MAX_ICON_SVG_LENGTH = 4000

const ALLOWED_ELEMENTS = new Set([
  'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'g',
])

const ALLOWED_ATTRIBUTES = new Set([
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'width', 'height', 'points', 'transform',
  'fill', 'fill-rule', 'fill-opacity', 'opacity',
  'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-opacity',
])

/** One tag, with quoted attribute values. Deliberately narrow: markup this
 *  doesn't match doesn't get parsed some other way, it gets refused. Both quote
 *  styles, because which one a model reaches for is a coin flip and an
 *  otherwise-fine drawing shouldn't be thrown away over it. */
const ANY_ATTRIBUTE = String.raw`[a-zA-Z][a-zA-Z0-9-]*\s*=\s*(?:"[^"<>]*"|'[^'<>]*')`

const TAG = new RegExp(
  String.raw`<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+${ANY_ATTRIBUTE})*)\s*(\/?)>`,
  'g',
)

/** The same shape again, this time pulling the name and value out. */
const ATTRIBUTE = /([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)')/g

/* Numbers, path commands, color words, hex colors and transform calls. Note
 * what is absent: no colon, so `javascript:` and `data:` cannot be spelled at
 * all, and no ampersand, so an entity cannot smuggle one back in. */
const SAFE_VALUE = /^[a-zA-Z0-9\s.,%#+\-/()]*$/

/** Throws with a reason a person can act on. Returns the trimmed markup on
 *  success, which is what callers should store — not their original input. */
export function sanitizeIconSvg(input: string): string {
  const svg = input.trim()

  if (svg === '') throw new Error('icon_svg is empty')
  if (svg.length > MAX_ICON_SVG_LENGTH) {
    throw new Error(`icon_svg exceeds ${MAX_ICON_SVG_LENGTH} characters`)
  }

  const open: string[] = []
  let cursor = 0

  TAG.lastIndex = 0
  for (let tag = TAG.exec(svg); tag !== null; tag = TAG.exec(svg)) {
    if (svg.slice(cursor, tag.index).trim() !== '') {
      throw new Error('icon_svg may not contain text between shapes')
    }
    cursor = tag.index + tag[0].length

    const [, closing, rawName, attributes, selfClosing] = tag
    const element = rawName.toLowerCase()

    if (!ALLOWED_ELEMENTS.has(element)) {
      throw new Error(`icon_svg may not contain <${element}>`)
    }

    if (closing) {
      if (open.pop() !== element) throw new Error(`icon_svg has a stray </${element}>`)
      continue
    }

    checkAttributes(element, attributes)
    if (!selfClosing) open.push(element)
  }

  // No tags matched at all, or the string is padding around them.
  if (cursor === 0) throw new Error('icon_svg contains no shapes')
  if (svg.slice(cursor).trim() !== '') {
    throw new Error('icon_svg may not contain text between shapes')
  }
  if (open.length > 0) throw new Error(`icon_svg has an unclosed <${open[open.length - 1]}>`)

  return svg
}

function checkAttributes(element: string, source: string): void {
  ATTRIBUTE.lastIndex = 0
  for (let attr = ATTRIBUTE.exec(source); attr !== null; attr = ATTRIBUTE.exec(source)) {
    const name = attr[1].toLowerCase()
    // One of the two quote styles matched; the other group is undefined.
    const value = attr[2] ?? attr[3]

    if (!ALLOWED_ATTRIBUTES.has(name)) {
      throw new Error(`<${element}> may not carry a ${name} attribute`)
    }
    if (!SAFE_VALUE.test(value)) {
      throw new Error(`<${element}> has an unsupported ${name} value`)
    }
    /* The one construct the character set above still permits that can point
     * outside the document: url(#gradient) is harmless, url(http://…) is not,
     * and neither is worth supporting in a single-color pictogram. */
    if (/url\s*\(/i.test(value)) {
      throw new Error(`<${element}> may not use url() in ${name}`)
    }
  }
}
