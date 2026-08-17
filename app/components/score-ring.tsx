/** DDR rank letters, same thresholds the game itself uses. */
function rank(scorePct: number): string {
  if (scorePct >= 95) return 'AAA'
  if (scorePct >= 90) return 'AA'
  if (scorePct >= 80) return 'A'
  if (scorePct >= 70) return 'B'
  return 'C'
}

/** A small radial score readout for a DDR entry: percentage as a ring fill,
 *  rank letter in the middle. Purely presentational and theme-agnostic —
 *  every color comes from a CSS custom property, so it reads correctly in
 *  all three themes with no per-theme branching here. */
export function ScoreRing({ scorePct }: { scorePct: number }) {
  return (
    <div
      className="score-ring"
      style={{
        background: `conic-gradient(var(--accent) ${scorePct}%, var(--surface-alt) 0)`,
      }}
    >
      <div className="score-ring-inner">
        <div className="score-ring-rank">{rank(scorePct)}</div>
        <div className="score-ring-pct">{scorePct}%</div>
      </div>
    </div>
  )
}
