/** Preset icon for reverse-crunch exercise types. Same custom-glyph approach
 *  as JumpRopeIcon — see lib/exercise-icons.ts. */
export function ReverseCrunchIcon() {
  return (
    <svg viewBox="0 0 100 100" className="jump-rope-icon" aria-hidden="true">
      <circle cx="16" cy="62" r="8" fill="none" stroke="currentColor" strokeWidth="6" />
      <path
        d="M24 62 L54 66 L58 35 L40 30 M24 62 L14 74"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
