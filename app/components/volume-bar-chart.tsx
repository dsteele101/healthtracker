'use client'

import type { Point } from './trend-chart'

// Fixed viewBox, same as trend-chart.tsx's fixed 600x200 — the SVG's own
// width:100%/height:auto scaling is what makes the chart fill its container
// on any screen, so the viewBox itself never needs to grow or shrink with
// point count. Each bar's width is a share of this fixed width instead
// (below), which is what actually makes the bars span edge-to-edge whether
// there's 1 entry or 20.
const VB_WIDTH = 240
const VB_HEIGHT = 90
const PAD_TOP = 8
// Bar takes this fraction of its slot; the rest is gap, split evenly on
// either side so bars read as centered in their slot rather than packed left.
const FILL_RATIO = 0.7

/** Rounds up to a clean axis max (1/2/2.5/5/10 x a power of ten). Mirrors
 *  trend-chart.tsx's niceCeil, which this chart doesn't share a module with
 *  since it's a small, self-contained duplicate the same way the rest of
 *  this codebase keeps each SVG chart standalone. */
function niceCeil(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const residual = value / magnitude
  const step = [1, 2, 2.5, 5, 10].find((s) => residual <= s) ?? 10
  return step * magnitude
}

/** A per-entry volume bar chart, following the same fixed-viewBox,
 *  scaled-by-width SVG pattern as trend-chart.tsx — colored via the
 *  secondary accent (`--accent2`) so it reads as a distinct series next to
 *  any accent-colored line chart shown alongside it. Bar width is derived
 *  from the point count against the fixed viewBox width, not a fixed pixel
 *  size, so the bars always span the full chart width — wide blocks for a
 *  couple of entries, a dense comb for many — rather than a narrow cluster
 *  padded out by empty space. */
export function VolumeBarChart({ points, formatValue }: { points: Point[]; formatValue: (value: number) => string }) {
  if (points.length === 0) return null

  const max = niceCeil(Math.max(...points.map((p) => p.value), 1))
  const slotWidth = VB_WIDTH / points.length
  const barWidth = slotWidth * FILL_RATIO
  const sideGap = (slotWidth - barWidth) / 2
  const usableHeight = VB_HEIGHT - PAD_TOP

  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`}
        className="chart-svg"
        role="img"
        aria-label={`Volume per entry, ${points.length} entries, latest ${formatValue(points[points.length - 1].value)}`}
      >
        {points.map((p, i) => {
          const h = Math.max(2, (p.value / max) * usableHeight)
          const x = i * slotWidth + sideGap
          const y = VB_HEIGHT - h
          return <rect key={i} x={x} y={y} width={barWidth} height={h} rx={2} fill="var(--accent2)" />
        })}
      </svg>
    </div>
  )
}
