'use client'

import Link from 'next/link'
import { useState } from 'react'
import * as local from '@/lib/local-db'
import { formatDuration, parseDuration } from '@/lib/format'
import { useExerciseTypes, useWorkoutTemplates } from '@/lib/use-store'
import type { ExerciseType, WorkoutTemplate, WorkoutTemplateItem } from '@/lib/types'
import { SyncBadge } from '../components/sync-badge'

function emptyItem(exerciseTypeId: string): WorkoutTemplateItem {
  return {
    exercise_type_id: exerciseTypeId,
    target_sets: null,
    target_reps: null,
    target_duration_seconds: null,
    notes: null,
  }
}

/** One planned exercise within a routine: which exercise, and optionally how
 *  much of it. Shared between the create form and the per-routine editor. */
function ItemFields({
  item,
  types,
  onChange,
  onRemove,
}: {
  item: WorkoutTemplateItem
  types: local.Local<ExerciseType>[]
  onChange: (item: WorkoutTemplateItem) => void
  onRemove: () => void
}) {
  const [duration, setDuration] = useState(
    item.target_duration_seconds !== null ? formatDuration(item.target_duration_seconds) : '',
  )

  return (
    <div className="card stack">
      <div className="row">
        <select
          className="grow"
          value={item.exercise_type_id}
          onChange={(e) => onChange({ ...item, exercise_type_id: e.target.value })}
        >
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-danger" onClick={onRemove}>
          Remove
        </button>
      </div>

      <div className="row">
        <div className="field grow">
          <label className="label">Sets</label>
          <input
            inputMode="numeric"
            value={item.target_sets ?? ''}
            placeholder="Optional"
            onChange={(e) => {
              const value = e.target.value.trim()
              onChange({ ...item, target_sets: value ? Number(value) : null })
            }}
          />
        </div>
        <div className="field grow">
          <label className="label">Reps</label>
          <input
            inputMode="numeric"
            value={item.target_reps ?? ''}
            placeholder="Optional"
            onChange={(e) => {
              const value = e.target.value.trim()
              onChange({ ...item, target_reps: value ? Number(value) : null })
            }}
          />
        </div>
        <div className="field grow">
          <label className="label">Time</label>
          <input
            value={duration}
            placeholder="1:30"
            onChange={(e) => {
              setDuration(e.target.value)
              const parsed = parseDuration(e.target.value)
              onChange({ ...item, target_duration_seconds: parsed })
            }}
          />
        </div>
      </div>
    </div>
  )
}

/** Edits an existing routine in place: name and its list of items. */
function TemplateRow({
  template,
  types,
}: {
  template: local.Local<WorkoutTemplate>
  types: local.Local<ExerciseType>[]
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(template.name)
  const [items, setItems] = useState(template.items)
  const [error, setError] = useState<string | null>(null)

  function startEditing() {
    setName(template.name)
    setItems(template.items)
    setError(null)
    setEditing(true)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return setError('Give it a name.')
    if (items.length === 0) return setError('Add at least one exercise.')

    await local.put('workout_templates', {
      ...template,
      name: trimmed,
      items,
      updated_at: new Date().toISOString(),
    })
    setEditing(false)
  }

  if (editing) {
    return (
      <form onSubmit={save} className="card stack">
        <div className="field">
          <label className="label" htmlFor={`name-${template.id}`}>
            Name
          </label>
          <input
            id={`name-${template.id}`}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            autoComplete="off"
          />
        </div>

        {items.map((item, index) => (
          <ItemFields
            key={index}
            item={item}
            types={types}
            onChange={(next) => setItems(items.map((it, i) => (i === index ? next : it)))}
            onRemove={() => setItems(items.filter((_, i) => i !== index))}
          />
        ))}

        {types.length > 0 && (
          <button
            type="button"
            className="btn btn-block"
            onClick={() => setItems([...items, emptyItem(types[0].id)])}
          >
            Add exercise
          </button>
        )}

        {error && <p className="error">{error}</p>}

        <div className="spread">
          <button type="button" className="btn" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="card stack">
      <div className="spread">
        <div className="grow">
          <div className="subtitle">{template.name}</div>
          <div className="muted">
            {template.items
              .map((item) => types.find((t) => t.id === item.exercise_type_id)?.name ?? 'Unknown')
              .join(' · ')}
          </div>
        </div>
        <button type="button" className="btn" onClick={startEditing}>
          Edit
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (confirm(`Remove "${template.name}"? Past sessions keep their link to it.`)) {
              void local.remove('workout_templates', template.id)
            }
          }}
        >
          Remove
        </button>
      </div>
    </div>
  )
}

export default function RoutinesPage() {
  const templates = useWorkoutTemplates()
  const types = useExerciseTypes()

  const [name, setName] = useState('')
  const [items, setItems] = useState<WorkoutTemplateItem[]>([])
  const [error, setError] = useState<string | null>(null)

  async function addTemplate(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return setError('Give it a name.')
    if (items.length === 0) return setError('Add at least one exercise.')

    const now = new Date().toISOString()
    const template: WorkoutTemplate = {
      id: crypto.randomUUID(),
      name: trimmed,
      items,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }

    await local.put('workout_templates', template)
    setName('')
    setItems([])
    setError(null)
  }

  return (
    <main className="page">
      <header className="spread">
        <h1 className="title">Routines</h1>
        <SyncBadge />
      </header>

      {types !== undefined && types.length === 0 ? (
        <div className="empty">
          No exercises defined yet.
          <div style={{ marginTop: 16 }}>
            <Link href="/types" className="btn btn-primary">
              Add your first exercise
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={addTemplate} className="card stack">
          <div className="field">
            <label className="label" htmlFor="routine-name">
              New routine
            </label>
            <input
              id="routine-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              placeholder="Leg day"
              autoComplete="off"
            />
          </div>

          {items.map((item, index) => (
            <ItemFields
              key={index}
              item={item}
              types={types ?? []}
              onChange={(next) => setItems(items.map((it, i) => (i === index ? next : it)))}
              onRemove={() => setItems(items.filter((_, i) => i !== index))}
            />
          ))}

          {types && types.length > 0 && (
            <button
              type="button"
              className="btn btn-block"
              onClick={() => setItems([...items, emptyItem(types[0].id)])}
            >
              Add exercise
            </button>
          )}

          {error && <p className="error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block">
            Add routine
          </button>
        </form>
      )}

      <section className="stack">
        {templates === undefined && <p className="muted">Loading…</p>}

        {templates?.length === 0 && (
          <div className="empty">No routines yet. Add one above to reuse it when you start a workout.</div>
        )}

        {templates?.map((template) => (
          <TemplateRow key={template.id} template={template} types={types ?? []} />
        ))}
      </section>

      <Link href="/" className="btn btn-block">
        Done
      </Link>
    </main>
  )
}
