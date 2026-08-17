'use client'

import { useRef, useState } from 'react'
import { AVATAR_ICON_PRESETS } from '@/lib/avatar-icons'
import { updateProfile, uploadAvatar } from '@/lib/profile'
import type { MeResponse } from '@/lib/types'
import { IconPicker } from './icon-picker'
import { ProfileAvatar, displayNameOf } from './profile-avatar'

/* An uploaded picture is neither a preset nor the default, so nothing in the
 * grid should look selected — highlighting "Default picture" would claim the
 * opposite of what is on screen. The picker treats null as "the default is
 * chosen" and anything else as "this icon is chosen", so an empty string, which
 * is never a real icon, selects neither. */
const NOTHING_SELECTED = ''

/** Profile identity, name, and avatar editing. Lives on the Settings page —
 *  split out from the old account-popover so it mounts as ordinary page
 *  content instead of a positioned overlay. Split from the button that used
 *  to open it so mounting still seeds the name field from a plain useState
 *  default rather than an effect that writes state after render. */
export function ProfileEditor({ user }: { user: MeResponse | null }) {
  const [name, setName] = useState(user?.display_name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await action()
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  const unchanged = name.trim() === (user?.display_name ?? '')

  const saveName = (event: React.FormEvent) => {
    event.preventDefault()
    if (unchanged) return
    void run(() => updateProfile({ display_name: name.trim() || null }))
  }

  const pickIcon = (icon: string | null) => void run(() => updateProfile({ avatar_emoji: icon }))

  const chooseFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset immediately: picking the same file twice in a row fires no change
    // event otherwise, which reads as the upload silently doing nothing.
    event.target.value = ''
    if (file) void run(() => uploadAvatar(file))
  }

  return (
    <div className="card stack">
      <div className="row profile-identity">
        <ProfileAvatar user={user} size={56} />
        <div className="grow">
          <strong>{displayNameOf(user)}</strong>
          <p className="hint">{user?.email || 'Signed in'}</p>
        </div>
      </div>

      <form onSubmit={saveName} className="stack">
        <label className="label" htmlFor="settings-name">
          Display name
        </label>
        <div className="row">
          <input
            id="settings-name"
            className="grow"
            value={name}
            maxLength={60}
            placeholder={displayNameOf(user)}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
            autoComplete="off"
          />
          <button type="submit" className="btn" disabled={busy || unchanged}>
            Save
          </button>
        </div>
      </form>

      <hr className="divider" />

      <span className="label">Picture</span>
      <IconPicker
        presets={AVATAR_ICON_PRESETS}
        value={user?.avatar_path ? NOTHING_SELECTED : (user?.avatar_emoji ?? null)}
        onChange={pickIcon}
        clearLabel="Default picture"
      />

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="visually-hidden"
        onChange={chooseFile}
      />
      <button
        type="button"
        className="btn btn-block"
        onClick={() => fileInput.current?.click()}
        disabled={busy}
      >
        {user?.avatar_path ? 'Replace uploaded picture…' : 'Upload a picture…'}
      </button>
      <p className="hint">Cropped to a square and scaled down before it is stored.</p>

      {error && <p className="error">{error}</p>}
      {saved && !error && <p className="hint">Saved.</p>}
    </div>
  )
}
