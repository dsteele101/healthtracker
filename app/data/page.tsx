'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import {
  buildDdrCsv,
  buildExerciseCsv,
  buildExport,
  download,
  importExport,
  timestampedName,
} from '@/lib/export'
import { useDdrEntries, useExerciseEntries, useExerciseTypes } from '@/lib/use-store'
import { SyncBadge } from '../components/sync-badge'

export default function DataPage() {
  const exercises = useExerciseEntries()
  const ddr = useDdrEntries()
  const exerciseTypes = useExerciseTypes()
  const fileInput = useRef<HTMLInputElement>(null)

  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // CSV-only: JSON stays a full, unfiltered backup so it's always a safe
  // restore target. Exercise and DDR get their own filters since neither
  // date range nor exercise type is guaranteed to mean the same thing to both.
  const [exerciseStart, setExerciseStart] = useState('')
  const [exerciseEnd, setExerciseEnd] = useState('')
  const [exerciseTypeId, setExerciseTypeId] = useState('')
  const [ddrStart, setDdrStart] = useState('')
  const [ddrEnd, setDdrEnd] = useState('')

  async function run(label: string, action: () => Promise<string>) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      setMessage(await action())
    } catch (e) {
      setError(e instanceof Error ? e.message : `${label} failed.`)
    } finally {
      setBusy(false)
    }
  }

  const exportJson = () =>
    run('Export', async () => {
      const data = await buildExport()
      download(
        timestampedName('healthtracker', 'json'),
        JSON.stringify(data, null, 2),
        'application/json',
      )
      const count = data.exercise_entries.length + data.ddr_entries.length
      return `Exported ${count} entries as JSON.`
    })

  const exportExerciseCsv = () =>
    run('Export', async () => {
      const csv = await buildExerciseCsv({
        start: exerciseStart || undefined,
        end: exerciseEnd || undefined,
        exerciseTypeId: exerciseTypeId || undefined,
      })
      download(timestampedName('healthtracker-exercise', 'csv'), csv, 'text/csv')
      return 'Exported exercise CSV.'
    })

  const exportDdrCsv = () =>
    run('Export', async () => {
      const csv = await buildDdrCsv({
        start: ddrStart || undefined,
        end: ddrEnd || undefined,
      })
      download(timestampedName('healthtracker-ddr', 'csv'), csv, 'text/csv')
      return 'Exported DDR CSV.'
    })

  const onFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset so re-picking the same file fires change again.
    event.target.value = ''
    if (!file) return

    void run('Import', async () => {
      const result = await importExport(await file.text())
      const parts = [`Imported ${result.imported} rows`]
      if (result.songs > 0) parts.push(`${result.songs} song titles`)
      if (result.skipped > 0) parts.push(`skipped ${result.skipped} malformed`)
      return `${parts.join(', ')}.`
    })
  }

  const totalEntries = (exercises?.length ?? 0) + (ddr?.length ?? 0)

  return (
    <main className="page">
      <header className="spread">
        <h1 className="title">Data</h1>
        <SyncBadge />
      </header>

      <p className="muted">
        {exercises === undefined || ddr === undefined
          ? 'Loading…'
          : `${totalEntries} entries on this device.`}
      </p>

      <section className="card stack">
        <h2 className="subtitle">Export</h2>
        <p className="hint">
          Runs against this device&rsquo;s copy, so it works offline and does not need
          the server.
        </p>
        <button type="button" className="btn btn-block" onClick={exportJson} disabled={busy}>
          Export JSON
        </button>
        <p className="hint">
          Complete, including deletions. This is the file to keep as a backup and the
          one Import reads.
        </p>
        <hr className="divider" />

        <h3 className="hint">Exercise CSV</h3>
        <div className="row">
          <label className="stack" style={{ flex: 1 }}>
            <span className="hint">From</span>
            <input
              type="date"
              value={exerciseStart}
              max={exerciseEnd || undefined}
              onChange={(e) => setExerciseStart(e.target.value)}
            />
          </label>
          <label className="stack" style={{ flex: 1 }}>
            <span className="hint">To</span>
            <input
              type="date"
              value={exerciseEnd}
              min={exerciseStart || undefined}
              onChange={(e) => setExerciseEnd(e.target.value)}
            />
          </label>
        </div>
        <label className="stack">
          <span className="hint">Exercise</span>
          <select value={exerciseTypeId} onChange={(e) => setExerciseTypeId(e.target.value)}>
            <option value="">All exercises</option>
            {exerciseTypes?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-block"
          onClick={exportExerciseCsv}
          disabled={busy}
        >
          Export Exercise CSV
        </button>

        <h3 className="hint">DDR CSV</h3>
        <div className="row">
          <label className="stack" style={{ flex: 1 }}>
            <span className="hint">From</span>
            <input
              type="date"
              value={ddrStart}
              max={ddrEnd || undefined}
              onChange={(e) => setDdrStart(e.target.value)}
            />
          </label>
          <label className="stack" style={{ flex: 1 }}>
            <span className="hint">To</span>
            <input
              type="date"
              value={ddrEnd}
              min={ddrStart || undefined}
              onChange={(e) => setDdrEnd(e.target.value)}
            />
          </label>
        </div>
        <button type="button" className="btn btn-block" onClick={exportDdrCsv} disabled={busy}>
          Export DDR CSV
        </button>

        <p className="hint">Both exclude deleted entries.</p>
      </section>

      <section className="card stack">
        <h2 className="subtitle">Import</h2>
        <p className="hint">
          Reads a JSON export. Existing entries are only replaced by newer ones, so
          importing an old backup will not undo recent changes.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          onChange={onFile}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          className="btn btn-block"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        >
          Choose JSON file…
        </button>
      </section>

      {message && <p className="muted">{message}</p>}
      {error && <p className="error">{error}</p>}

      <Link href="/" className="btn btn-block">
        Done
      </Link>
    </main>
  )
}
