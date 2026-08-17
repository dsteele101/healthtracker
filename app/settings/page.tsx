import { cookies } from 'next/headers'
import { DEFAULT_THEME, THEME_COOKIE, isThemeId } from '@/lib/theme'
import { SettingsContent } from '../components/settings-content'

export default async function SettingsPage() {
  const store = await cookies()
  const raw = store.get(THEME_COOKIE)?.value
  const theme = isThemeId(raw) ? raw : DEFAULT_THEME

  return <SettingsContent initialTheme={theme} />
}
