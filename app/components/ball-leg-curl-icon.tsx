/** Preset icon for stability-ball-leg-curl exercise types. Same
 *  custom-glyph approach as JumpRopeIcon — see lib/exercise-icons.ts. */
export function BallLegCurlIcon() {
  return (
    <svg viewBox="0 0 100 100" className="jump-rope-icon" aria-hidden="true">
      <circle cx="14" cy="70" r="8" fill="none" stroke="currentColor" strokeWidth="6" />
      <path
        d="M22 70 L52 55 L80 57 M22 70 L12 82"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="86" cy="68" r="13" fill="none" stroke="currentColor" strokeWidth="5" />
    </svg>
  )
}
