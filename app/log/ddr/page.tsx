'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import * as local from '@/lib/local-db'
import { fromDatetimeLocal, parseDuration, toDatetimeLocal } from '@/lib/format'
import { useActiveSession, useDdrEntries, useSongs } from '@/lib/use-store'
import type { DdrFields } from '@/lib/ocr'
import { MAX_DIFFICULTY, type DdrEntry, type DifficultyScale } from '@/lib/types'
import { SyncBadge } from '../../components/sync-badge'
import { PhotoImport } from './photo-import'

const LAST_SCALE_KEY = 'tracker:last-difficulty-scale'

function readLastScale(): DifficultyScale {
  if (typeof window === 'undefined') return 'new'
  const stored = localStorage.getItem(LAST_SCALE_KEY)
  return stored === 'old' || stored === 'new' ? stored : 'new'
}

export default function LogDdrPage() {
  const router = useRouter()
  const songs = useSongs()
  const ddrEntries = useDdrEntries()
  const activeSession = useActiveSession()

  // Distinct difficulty-type names seen before, for the suggestion list —
  // there's no dedicated corpus for these like there is for song titles, so
  // it's derived straight from history.
  const difficultyTypes = [
    ...new Set((ddrEntries ?? []).map((e) => e.difficulty_type).filter((t): t is string => !!t)),
  ].sort((a, b) => a.localeCompare(b))

  // Same reasoning as the exercise form: this page is prerendered, so a
  // timestamp computed anywhere but the browser would be the build date.
  const [performedAt, setPerformedAt] = useState(() =>
    toDatetimeLocal(new Date().toISOString()),
  )
  // A player stays on one scale for long stretches; carry it over.
  const [scale, setScale] = useState<DifficultyScale>(readLastScale)

  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [difficultyType, setDifficultyType] = useState('')
  const [length, setLength] = useState('')
  const [score, setScore] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /** What photo import read, shown so a wrong guess is visible before saving. */
  const [importNote, setImportNote] = useState<string | null>(null)
  /** Compressed copy of the captured photo, staged until save. */
  const [photo, setPhoto] = useState<Blob | null>(null)

  const clearError = () => setError(null)

  /** Fills only the fields OCR actually read, leaving anything it missed for
   *  manual entry rather than blanking what's already typed. */
  function applyImportedFields(fields: DdrFields, note: string) {
    if (fields.song_title !== undefined) setTitle(fields.song_title)
    if (fields.artist !== undefined) setArtist(fields.artist)
    if (fields.difficulty !== undefined) setDifficulty(String(fields.difficulty))
    if (fields.difficulty_type !== undefined) setDifficultyType(fields.difficulty_type)
    if (fields.percentage_score !== undefined) setScore(String(fields.percentage_score))
    if (fields.song_length_seconds !== undefined) {
      const total = fields.song_length_seconds
      setLength(`${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`)
    }
    if (fields.difficulty_scale !== undefined) setScale(fields.difficulty_scale)
    setImportNote(note)
    setError(null)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()

    const songTitle = title.trim()
    if (!songTitle) return setError('Song title is required.')

    const max = MAX_DIFFICULTY[scale]
    const difficultyValue = Number(difficulty)
    if (
      !difficulty.trim() ||
      !Number.isInteger(difficultyValue) ||
      difficultyValue < 1 ||
      difficultyValue > max
    ) {
      // Naming the ceiling catches the common mistake: entering a rating from
      // one scale with the other selected.
      return setError(`Difficulty must be a whole number from 1 to ${max} on the ${scale} scale.`)
    }

    const scoreValue = Number(score)
    if (!score.trim() || Number.isNaN(scoreValue) || scoreValue < 0 || scoreValue > 100) {
      return setError('Score must be between 0 and 100.')
    }

    let lengthValue: number | null = null
    if (length.trim()) {
      const parsed = parseDuration(length)
      if (parsed === null || parsed <= 0) {
        return setError('Song length should look like 105 or 1:45.')
      }
      lengthValue = parsed
    }

    setSaving(true)
    const now = new Date().toISOString()
    const entry: DdrEntry = {
      id: crypto.randomUUID(),
      song_title: songTitle,
      artist: artist.trim() || null,
      difficulty: difficultyValue,
      difficulty_scale: scale,
      difficulty_type: difficultyType.trim() || null,
      song_length_seconds: lengthValue,
      // Two decimals is what the results screen shows.
      percentage_score: Math.round(scoreValue * 100) / 100,
      photo_path: null,
      performed_at: performedAt ? fromDatetimeLocal(performedAt) : now,
      session_id: activeSession?.id ?? null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }

    await local.put('ddr_entries', entry)
    // Queued separately from the entry itself: the entry is already a valid
    // row without a photo, so a photo that fails to upload should never block
    // or roll back the save.
    if (photo) await local.queuePhoto(entry.id, photo, 'image/jpeg')
    // Grows the match corpus that photo import will read titles against.
    await local.rememberSong(songTitle)
    localStorage.setItem(LAST_SCALE_KEY, scale)
    router.push('/')
  }

  return (
    <main className="page">
      <header className="spread">
        <h1 className="title">Log DDR</h1>
        <SyncBadge />
      </header>

      <form onSubmit={save} className="stack">
        <PhotoImport
          corpus={songs.map((s) => s.title)}
          scale={scale}
          onFields={applyImportedFields}
          onPhoto={setPhoto}
        />

        {importNote && <p className="hint">{importNote}</p>}

        <div className="field">
          <label className="label" htmlFor="song">
            Song
          </label>
          <input
            id="song"
            list="song-suggestions"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              clearError()
            }}
            placeholder="PARANOiA"
            autoComplete="off"
          />
          {/* Native suggestions from play history — no dropdown to build, and
              it still allows a title that isn't in the list yet. */}
          <datalist id="song-suggestions">
            {songs.map((song) => (
              <option key={song.id} value={song.title} />
            ))}
          </datalist>
        </div>

        <div className="field">
          <label className="label" htmlFor="artist">
            Artist
          </label>
          <input
            id="artist"
            value={artist}
            onChange={(e) => {
              setArtist(e.target.value)
              clearError()
            }}
            placeholder="Optional"
            autoComplete="off"
          />
        </div>

        <div className="field">
          <span className="label">Difficulty scale</span>
          <div className="row">
            {(['old', 'new'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`btn grow ${scale === option ? 'btn-primary' : ''}`}
                aria-pressed={scale === option}
                onClick={() => {
                  setScale(option)
                  clearError()
                }}
              >
                {option === 'old' ? 'Old (1–10)' : 'New (1–20)'}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="difficulty-type">
            Difficulty type
          </label>
          <input
            id="difficulty-type"
            list="difficulty-type-suggestions"
            value={difficultyType}
            onChange={(e) => {
              setDifficultyType(e.target.value)
              clearError()
            }}
            placeholder="Expert"
            autoComplete="off"
          />
          <datalist id="difficulty-type-suggestions">
            {difficultyTypes.map((type) => (
              <option key={type} value={type} />
            ))}
          </datalist>
        </div>

        <div className="row">
          <div className="field grow">
            <label className="label" htmlFor="difficulty">
              Difficulty
            </label>
            <input
              id="difficulty"
              inputMode="numeric"
              value={difficulty}
              onChange={(e) => {
                setDifficulty(e.target.value)
                clearError()
              }}
              placeholder={scale === 'old' ? '8' : '16'}
              autoComplete="off"
            />
          </div>

          <div className="field grow">
            <label className="label" htmlFor="score">
              Score %
            </label>
            <input
              id="score"
              // decimal, not numeric: the keypad needs a decimal point for 94.83
              inputMode="decimal"
              value={score}
              onChange={(e) => {
                setScore(e.target.value)
                clearError()
              }}
              placeholder="94.83"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="length">
            Song length
          </label>
          <input
            id="length"
            value={length}
            onChange={(e) => {
              setLength(e.target.value)
              clearError()
            }}
            placeholder="1:45"
            autoComplete="off"
          />
          <p className="hint">Optional. Seconds (105) or clock time (1:45).</p>
        </div>

        <div className="field">
          <label className="label" htmlFor="when">
            When
          </label>
          <input
            id="when"
            type="datetime-local"
            value={performedAt}
            suppressHydrationWarning
            onChange={(e) => setPerformedAt(e.target.value)}
          />
        </div>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <Link href="/" className="btn btn-block">
          Cancel
        </Link>
      </form>
    </main>
  )
}
