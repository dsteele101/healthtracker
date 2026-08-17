'use client'

import { logOut } from '@/lib/profile'
import type { ThemeId } from '@/lib/theme'
import { useIdentity } from '@/lib/use-store'
import { ProfileEditor } from './profile-editor'
import { ThemePicker } from './theme-picker'

export function SettingsContent({ initialTheme }: { initialTheme: ThemeId }) {
  const user = useIdentity()

  return (
    <main className="page">
      <h1 className="title">Settings</h1>

      <ProfileEditor user={user} />

      <h2 className="subtitle">Theme</h2>
      <ThemePicker initialTheme={initialTheme} />

      <div className="card" style={{ padding: 0 }}>
        <div className="settings-row">
          <div>Units</div>
          <div className="muted">Imperial</div>
        </div>
        <div className="settings-row">
          <div>Notifications</div>
          <div className="muted">Enabled</div>
        </div>
        <div className="settings-row">
          <div>Sync</div>
          <div className="muted">Up to date</div>
        </div>
      </div>

      <button type="button" className="btn btn-block btn-danger" onClick={logOut}>
        Log out
      </button>
      <p className="hint">
        Entries stay on this device. Anything not yet synced is kept for the next time you sign
        in.
      </p>
    </main>
  )
}
