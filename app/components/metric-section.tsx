'use client'

import { useState } from 'react'
import { formatWhen } from '@/lib/format'
import { TrendChart, type Point } from './trend-chart'

interface MetricSectionProps {
  title: string
  points: Point[]
  formatValue: (value: number) => string
  /** Defaults to formatWhen (an instant); pass formatDay for points
   *  aggregated per calendar day. */
  formatDate?: (iso: string) => string
  /** Singular noun for one point, pluralized with a trailing 's' in the
   *  summary line — "session" for a single log, "day" for a daily rollup. */
  pointNoun?: string
  hint?: string
}

/** One metric's card: a summary line, a chart, and a table-view twin toggle. */
export function MetricSection({
  title,
  points,
  formatValue,
  formatDate = formatWhen,
  pointNoun = 'session',
  hint,
}: MetricSectionProps) {
  const [showTable, setShowTable] = useState(false)
  const best = points.length ? Math.max(...points.map((p) => p.value)) : null

  return (
    <section className="card stack">
      <div className="spread">
        <h2 className="subtitle">{title}</h2>
        {points.length > 0 && (
          <button type="button" className="pill" onClick={() => setShowTable((s) => !s)}>
            {showTable ? 'Chart' : 'Table'}
          </button>
        )}
      </div>

      {hint && <p className="hint">{hint}</p>}

      {points.length === 0 ? (
        <div className="empty">No {title.toLowerCase()} logged in this range.</div>
      ) : (
        <>
          <p className="muted mono">
            {points.length} {points.length === 1 ? pointNoun : `${pointNoun}s`} · best{' '}
            {formatValue(best!)}
          </p>

          {showTable ? (
            <div className="table-wrap">
              <table className="table-simple">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {points
                    .slice()
                    .reverse()
                    .map((p, i) => (
                      <tr key={i}>
                        <td>{formatDate(p.at)}</td>
                        <td className="mono">{formatValue(p.value)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <TrendChart points={points} formatValue={formatValue} formatPointLabel={formatDate} />
          )}
        </>
      )}
    </section>
  )
}
