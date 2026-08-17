'use client'

import { useState } from 'react'
import { formatDay } from '@/lib/format'

export interface StreakDay {
  /** Local-calendar-day key (e.g. "2026-7-17", zero-indexed month) -- used
   *  as the React key; `iso` carries the real date for display. */
  date: string
  iso: string
  count: number
  /** Days past today, padded on so the current week's column still has 7
   *  cells. Rendered as blank spacers -- never counted or interactive. */
  future: boolean
}

const ROWS = 7

/** Buckets a day's count into a 0-4 shade step relative to the busiest day
 *  in the grid, the same way GitHub grades commit-heavy days darker. */
function level(count: number, max: number): number {
  if (count === 0) return 0
  return Math.min(4, Math.ceil((count / max) * 4))
}

function describe(day: StreakDay): string {
  const activity = day.count === 0 ? 'No activity' : `${day.count} ${day.count === 1 ? 'activity' : 'activities'}`
  return `${formatDay(day.iso)}: ${activity}`
}

/** GitHub-style contribution grid: weeks run left-to-right as columns, each
 *  stacking Sun-Sat top-to-bottom (`days` arrives in that column-major order
 *  -- see useConsistencyStreak), shaded by that day's combined exercise +
 *  DDR count. Hover or tap a cell to see its date and count, via the same
 *  hit-button + floating .chart-tooltip pattern trend-chart.tsx uses for its
 *  data points -- pointerleave only clears on mouse so a tap stays pinned
 *  instead of vanishing the instant a touch lifts. */
export function StreakGrid({ days }: { days: StreakDay[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const weeks = days.length / ROWS
  const maxCount = Math.max(1, ...days.filter((d) => !d.future).map((d) => d.count))
  const active = activeIndex !== null ? days[activeIndex] : null

  return (
    <div
      className="chart-wrap"
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setActiveIndex(null)
      }}
    >
      <div className="streak-grid" style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }}>
        {days.map((day, i) =>
          day.future ? (
            <div key={day.date} className="streak-cell-spacer" />
          ) : (
            <button
              key={day.date}
              type="button"
              className={`streak-cell streak-level-${level(day.count, maxCount)}`}
              onPointerEnter={() => setActiveIndex(i)}
              onFocus={() => setActiveIndex(i)}
              onClick={() => setActiveIndex(i)}
              aria-label={describe(day)}
            />
          ),
        )}
      </div>

      {active && activeIndex !== null && (
        <div
          className="chart-tooltip"
          style={{
            left: `${((Math.floor(activeIndex / ROWS) + 0.5) / weeks) * 100}%`,
            top: `${((activeIndex % ROWS) / ROWS) * 100}%`,
          }}
        >
          <strong>{formatDay(active.iso)}</strong>
          <span>{active.count === 0 ? 'No activity' : `${active.count} ${active.count === 1 ? 'activity' : 'activities'}`}</span>
        </div>
      )}
    </div>
  )
}
