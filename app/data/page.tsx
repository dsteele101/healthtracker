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
import { useDdrEntries, useExerciseEntries } from '@/lib/use-store'
import { SyncBadge } from '../components/sync-badge'

export default function DataPage() {
  const exercises = useExerciseEntries()
  const ddr = useDdrEntries()
  const fileInput = useRef<HTMLInputElement>(null)

  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  const exportCsv = () =>
    run('Export', async () => {
      // Two files rather than one: the columns don't overlap, and flattening
      // them together would produce a sheet that's mostly empty cells.
      const [exerciseCsv, ddrCsv] = await Promise.all([buildExerciseCsv(), buildDdrCsv()])
      download(timestampedName('healthtracker-exercise', 'csv'), exerciseCsv, 'text/csv')
      download(timestampedName('healthtracker-ddr', 'csv'), ddrCsv, 'text/csv')
      return 'Exported two CSV files: exercise and DDR.'
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
        <button type="button" className="btn btn-block" onClick={exportCsv} disabled={busy}>
          Export CSV
        </button>
        <p className="hint">
          Two files for spreadsheets. Excludes deleted entries.
        </p>
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
