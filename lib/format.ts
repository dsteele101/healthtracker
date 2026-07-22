/** Formatting and parsing shared by the entry forms. */

/** Renders seconds as m:ss, or h:mm:ss past an hour. */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/**
 * Parses a duration the way someone would actually type it mid-workout:
 * "90" (seconds), "1:30", or "1:02:03". Returns null if it isn't any of those.
 */
export function parseDuration(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const parts = trimmed.split(':')
  if (parts.length > 3) return null
  if (!parts.every((p) => /^\d+$/.test(p.trim()))) return null

  const numbers = parts.map((p) => Number(p.trim()))

  // A bare number is seconds — typing "90" for a 90-second plank is natural,
  // and reading it as 90 minutes would be absurd.
  if (numbers.length === 1) return numbers[0]

  // Anything after the first segment is a clock field and can't exceed 59.
  if (numbers.slice(1).some((n) => n > 59)) return null

  return numbers.length === 2
    ? numbers[0] * 60 + numbers[1]
    : numbers[0] * 3600 + numbers[1] * 60 + numbers[2]
}

/** "Today, 2:15 PM" / "Tue, Jul 21" for entry lists. */
export function formatWhen(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const wasYesterday = date.toDateString() === yesterday.toDateString()

  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return `Today, ${time}`
  if (wasYesterday) return `Yesterday, ${time}`

  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
}

/** Value for a `datetime-local` input, which wants local time with no zone. */
export function toDatetimeLocal(iso: string): string {
  const date = new Date(iso)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

/** Inverse of toDatetimeLocal: local wall-clock string back to a UTC instant. */
export function fromDatetimeLocal(value: string): string {
  return new Date(value).toISOString()
}
