/** Preset icon for bodyweight-squat exercise types. Same custom-glyph
 *  approach as JumpRopeIcon — see lib/exercise-icons.ts. */
export function SquatIcon() {
  return (
    <svg viewBox="0 0 100 100" className="jump-rope-icon" aria-hidden="true">
      <circle cx="50" cy="18" r="9" fill="none" stroke="currentColor" strokeWidth="6" />
      <path
        d="M50 27 L50 50 M50 32 L28 15 M50 32 L72 15 M50 50 L28 62 L24 90 M50 50 L72 62 L76 90"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
