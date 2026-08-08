/** Preset icon for jump-rope exercise types. No emoji shows a person actually
 *  jumping rope — the closest, 🪢, is just a knot — so this is a small custom
 *  glyph instead. Single-color stroke via currentColor so it inherits
 *  whatever text color the surrounding .type-icon/.icon-choice slot uses. */
export function JumpRopeIcon() {
  return (
    <svg viewBox="0 0 100 100" className="jump-rope-icon" aria-hidden="true">
      <circle cx="50" cy="20" r="9" fill="none" stroke="currentColor" strokeWidth="6" />
      <path
        d="M50 29 L50 55 M50 36 L30 46 M50 36 L70 46 M50 55 L39 68 L37 86 M50 55 L61 68 L63 86"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M30 46 C 18 66 32 96 50 96 C 68 96 82 66 70 46"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  )
}
