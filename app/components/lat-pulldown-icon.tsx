/** Preset icon for lat-pulldown exercise types. Same custom-glyph approach
 *  as JumpRopeIcon — see lib/exercise-icons.ts. */
export function LatPulldownIcon() {
  return (
    <svg viewBox="0 0 100 100" className="jump-rope-icon" aria-hidden="true">
      <circle cx="50" cy="20" r="9" fill="none" stroke="currentColor" strokeWidth="6" />
      <path
        d="M50 29 L50 58 M50 33 L32 22 L22 12 M50 33 L68 22 L78 12 M50 58 L36 72 L36 90 M50 58 L64 72 L64 90"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 10 L86 10" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}
