import type { SetDetail } from '@/lib/types'
import { NumberField } from './number-field'

/** One editable row per set, for exercises whose reps/weight vary set to
 *  set instead of being uniform. Shared by the log form, the entry editor,
 *  and the routine editor — same array-in-state add/remove pattern as the
 *  routine's own item list. */
export function SetDetailRows({
  sets,
  onChange,
  showReps = true,
  showWeight = true,
}: {
  sets: SetDetail[]
  onChange: (sets: SetDetail[]) => void
  showReps?: boolean
  showWeight?: boolean
}) {
  return (
    <div className="stack">
      {sets.map((set, index) => (
        <div key={index} className="row">
          {showReps && (
            <div className="field grow">
              <label className="label">{`Set ${index + 1} reps`}</label>
              <input
                inputMode="numeric"
                value={set.reps ?? ''}
                placeholder="12"
                onChange={(e) => {
                  const value = e.target.value.trim()
                  onChange(sets.map((s, i) => (i === index ? { ...s, reps: value ? Number(value) : null } : s)))
                }}
              />
            </div>
          )}
          {showWeight && (
            <div className="field grow">
              <label className="label">{`Set ${index + 1} weight`}</label>
              <NumberField
                value={set.weight}
                placeholder="Optional"
                onChange={(weight) => onChange(sets.map((s, i) => (i === index ? { ...s, weight } : s)))}
              />
            </div>
          )}
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => onChange(sets.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-block"
        onClick={() => onChange([...sets, { reps: null, weight: null }])}
      >
        Add set
      </button>
    </div>
  )
}
