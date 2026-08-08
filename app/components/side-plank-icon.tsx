/** Preset icon for side-plank exercise types. Same custom-glyph approach as
 *  JumpRopeIcon — see lib/exercise-icons.ts. */
export function SidePlankIcon() {
  return (
    <svg viewBox="0 0 100 100" className="jump-rope-icon" aria-hidden="true">
      <circle cx="20" cy="32" r="8" fill="none" stroke="currentColor" strokeWidth="6" />
      <path
        d="M26 38 L85 62 M34 44 L30 78 M34 44 L18 15"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
