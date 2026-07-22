'use client'

import { useState } from 'react'
import { formatWhen } from '@/lib/format'

export interface Point {
  at: string
  value: number
}

interface TrendChartProps {
  points: Point[]
  formatValue: (value: number) => string
  /** Labels each point in the tooltip and hit-target aria-labels. Defaults to
   *  formatWhen (an instant); pass formatDay for figures aggregated per
   *  calendar day, where a time-of-day would be fabricated. */
  formatPointLabel?: (iso: string) => string
}

const VB_WIDTH = 600
const VB_HEIGHT = 200
const PAD = { top: 20, right: 12, bottom: 24, left: 44 }
const CHART_WIDTH = VB_WIDTH - PAD.left - PAD.right
const CHART_HEIGHT = VB_HEIGHT - PAD.top - PAD.bottom
const BASELINE_Y = PAD.top + CHART_HEIGHT

/** Rounds up to a clean axis max (1/2/2.5/5/10 x a power of ten). */
function niceCeil(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const residual = value / magnitude
  const step = [1, 2, 2.5, 5, 10].find((s) => residual <= s) ?? 10
  return step * magnitude
}

function axisDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** A single-series line+area chart for one metric over time. Sized to a
 *  fixed viewBox and scaled by the SVG's own width:100%, so callers don't
 *  need to know pixel dimensions. */
export function TrendChart({ points, formatValue, formatPointLabel = formatWhen }: TrendChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const times = points.map((p) => new Date(p.at).getTime())
  const xMin = Math.min(...times)
  const xMax = Math.max(...times)
  const xSpan = xMax - xMin || 1
  const yMax = niceCeil(Math.max(...points.map((p) => p.value), 1))

  const xAt = (t: number) =>
    points.length === 1 ? PAD.left + CHART_WIDTH / 2 : PAD.left + ((t - xMin) / xSpan) * CHART_WIDTH
  const yAt = (v: number) => PAD.top + CHART_HEIGHT - (v / yMax) * CHART_HEIGHT

  const coords = points.map((p) => ({ x: xAt(new Date(p.at).getTime()), y: yAt(p.value) }))
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ')
  const areaPath = `${linePath} L${coords[coords.length - 1].x},${BASELINE_Y} L${coords[0].x},${BASELINE_Y} Z`

  const last = points[points.length - 1]
  const lastCoord = coords[coords.length - 1]
  const active = activeIndex !== null ? points[activeIndex] : null
  const activeCoord = activeIndex !== null ? coords[activeIndex] : null

  function nearestIndex(clientX: number, svg: SVGSVGElement): number {
    const rect = svg.getBoundingClientRect()
    const ratio = (clientX - rect.left) / rect.width
    const targetX = ratio * VB_WIDTH
    let best = 0
    let bestDist = Infinity
    coords.forEach((c, i) => {
      const dist = Math.abs(c.x - targetX)
      if (dist < bestDist) {
        bestDist = dist
        best = i
      }
    })
    return best
  }

  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`}
        className="chart-svg"
        role="img"
        aria-label={`Trend over time, ${points.length} sessions, latest ${formatValue(last.value)}`}
        onPointerDown={(e) => setActiveIndex(nearestIndex(e.clientX, e.currentTarget))}
        onPointerMove={(e) => setActiveIndex(nearestIndex(e.clientX, e.currentTarget))}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setActiveIndex(null)
        }}
      >
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={PAD.left}
            x2={VB_WIDTH - PAD.right}
            y1={PAD.top + CHART_HEIGHT * (1 - f)}
            y2={PAD.top + CHART_HEIGHT * (1 - f)}
            className="chart-grid"
          />
        ))}

        {[0, 0.5, 1].map((f) => (
          <text
            key={f}
            x={PAD.left - 8}
            y={PAD.top + CHART_HEIGHT * (1 - f)}
            dy="0.32em"
            textAnchor="end"
            className="chart-tick"
          >
            {formatValue(Math.round(yMax * f))}
          </text>
        ))}

        <path d={areaPath} fill="var(--accent)" fillOpacity={0.1} stroke="none" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        ))}

        <text
          x={lastCoord.x}
          y={lastCoord.y - 10}
          textAnchor={lastCoord.x > VB_WIDTH - PAD.right - 40 ? 'end' : 'middle'}
          className="chart-endlabel"
        >
          {formatValue(last.value)}
        </text>

        {points.length > 1 ? (
          <>
            <text x={PAD.left} y={VB_HEIGHT - 6} textAnchor="start" className="chart-tick">
              {axisDate(points[0].at)}
            </text>
            <text x={VB_WIDTH - PAD.right} y={VB_HEIGHT - 6} textAnchor="end" className="chart-tick">
              {axisDate(last.at)}
            </text>
          </>
        ) : (
          <text x={VB_WIDTH / 2} y={VB_HEIGHT - 6} textAnchor="middle" className="chart-tick">
            {axisDate(last.at)}
          </text>
        )}

        {activeCoord && (
          <line x1={activeCoord.x} x2={activeCoord.x} y1={PAD.top} y2={BASELINE_Y} className="chart-crosshair" />
        )}
        {activeCoord && (
          <circle
            cx={activeCoord.x}
            cy={activeCoord.y}
            r={6}
            fill="var(--accent)"
            stroke="var(--background)"
            strokeWidth={2}
          />
        )}
      </svg>

      {/* Real buttons rather than SVG focus: reliable keyboard/screen-reader
       *  access to the same values the pointer interaction above surfaces. */}
      <div className="chart-hits">
        {coords.map((c, i) => (
          <button
            key={i}
            type="button"
            className="chart-hit"
            style={{ left: `${(c.x / VB_WIDTH) * 100}%`, top: `${(c.y / VB_HEIGHT) * 100}%` }}
            onFocus={() => setActiveIndex(i)}
            onClick={() => setActiveIndex(i)}
            aria-label={`${formatPointLabel(points[i].at)}: ${formatValue(points[i].value)}`}
          />
        ))}
      </div>

      {active && activeCoord && (
        <div
          className="chart-tooltip"
          style={{ left: `${(activeCoord.x / VB_WIDTH) * 100}%`, top: `${(activeCoord.y / VB_HEIGHT) * 100}%` }}
        >
          <strong>{formatValue(active.value)}</strong>
          <span>{formatPointLabel(active.at)}</span>
        </div>
      )}
    </div>
  )
}
