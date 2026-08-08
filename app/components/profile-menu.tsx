'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { AVATAR_ICON_PRESETS } from '@/lib/avatar-icons'
import { logOut, updateProfile, uploadAvatar } from '@/lib/profile'
import { useIdentity } from '@/lib/use-store'
import type { MeResponse } from '@/lib/types'
import { IconPicker } from './icon-picker'
import { ProfileAvatar, displayNameOf } from './profile-avatar'

/* An uploaded picture is neither a preset nor the default, so nothing in the
 * grid should look selected — highlighting "Default picture" would claim the
 * opposite of what is on screen. The picker treats null as "the default is
 * chosen" and anything else as "this icon is chosen", so an empty string, which
 * is never a real icon, selects neither. */
const NOTHING_SELECTED = ''

/** The open menu.
 *
 *  Split out from the button so that mounting is what seeds the name field —
 *  opening the menu mounts this, and a change of account remounts it via the
 *  key. That keeps the initial value a plain useState default instead of an
 *  effect that writes state after render, and removes the window where the
 *  panel was open before the identity had loaded and the field still held ''. */
function ProfilePanel({ user, id }: { user: MeResponse | null; id: string }) {
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
    <div className="profile-panel card stack" id={id} role="dialog" aria-label="Account">
      <div className="row profile-identity">
        <ProfileAvatar user={user} size={56} />
        <div className="grow">
          <strong>{displayNameOf(user)}</strong>
          <p className="hint">{user?.email || 'Signed in'}</p>
        </div>
      </div>

      <form onSubmit={saveName} className="stack">
        <label className="label" htmlFor={`${id}-name`}>
          Display name
        </label>
        <div className="row">
          <input
            id={`${id}-name`}
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

      <hr className="divider" />

      <button type="button" className="btn btn-block btn-danger" onClick={logOut}>
        Log out
      </button>
      <p className="hint">
        Entries stay on this device. Anything not yet synced is kept for the next time you
        sign in.
      </p>
    </div>
  )
}

/** Account menu: who you are, what you look like, and the way out.
 *
 *  Sits in every page header next to the sync badge. Unlike that badge this is
 *  always visible — it is the only signpost for whose data is on screen, which
 *  matters now that more than one person uses the app and a shared browser shows
 *  no other clue. */
export function ProfileMenu() {
  const user = useIdentity()
  const [open, setOpen] = useState(false)

  const panelId = useId()
  const container = useRef<HTMLDivElement>(null)

  /* Close on an outside click or Escape. Both, because this opens from a small
   * target in a corner and either instinct should work. */
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="profile-menu" ref={container}>
      <button
        type="button"
        className="avatar-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Account: ${displayNameOf(user)}`}
        onClick={() => setOpen((current) => !current)}
      >
        <ProfileAvatar user={user} size={36} />
      </button>

      {open && <ProfilePanel key={user?.id ?? 'unknown'} user={user} id={panelId} />}
    </div>
  )
}
