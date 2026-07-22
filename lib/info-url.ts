/** Trims to null-or-valid-http(s)-URL, mirroring the server validator in
 *  lib/validate.ts. Shared by every form that edits ExerciseType.info_url. */
export function parseInfoUrl(value: string): { ok: true; value: string | null } | { ok: false } {
  const trimmed = value.trim()
  if (!trimmed) return { ok: true, value: null }
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false }
  } catch {
    return { ok: false }
  }
  return { ok: true, value: trimmed }
}
