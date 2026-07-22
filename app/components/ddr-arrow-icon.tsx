import { useId } from 'react'

/** Fallback visual cue for a DDR entry with no results-screen photo attached.
 *  A generic step-arrow glyph, not a trace of any specific artwork — same
 *  blue-gradient-on-black-outline language as the rest of the DDR styling in
 *  globals.css (see the Project OutFox palette note up top). */
export function DdrArrowIcon() {
  const gradientId = useId()

  return (
    <svg viewBox="0 0 100 100" className="ddr-arrow-icon" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a4bcf" />
          <stop offset="1" stopColor="#22c6f2" />
        </linearGradient>
      </defs>
      <path
        d="M50 6 L90 42 L68 42 L68 78 L50 96 L32 78 L32 42 L10 42 Z"
        fill="none"
        stroke="#111"
        strokeWidth="12"
        strokeLinejoin="round"
      />
      <path
        d="M50 6 L90 42 L68 42 L68 78 L50 96 L32 78 L32 42 L10 42 Z"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="6"
        strokeLinejoin="round"
      />
    </svg>
  )
}
