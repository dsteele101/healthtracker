/** Preset icon for ab-wheel-rollout exercise types. Same custom-glyph
 *  approach as JumpRopeIcon — see lib/exercise-icons.ts. */
export function AbWheelRolloutIcon() {
  return (
    <svg viewBox="0 0 100 100" className="jump-rope-icon" aria-hidden="true">
      <circle cx="24" cy="52" r="8" fill="none" stroke="currentColor" strokeWidth="6" />
      <path
        d="M80 84 L68 70 L30 55 L12 66"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="72" r="7" fill="none" stroke="currentColor" strokeWidth="5" />
    </svg>
  )
}
