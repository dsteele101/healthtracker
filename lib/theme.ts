/* The three selectable visual themes. Nav shape, radius, and fonts are pure
 * CSS keyed off `[data-theme]` (see globals.css) — this file only owns the
 * identifiers, persistence, and the one thing CSS can't do: updating the
 * live <meta name="theme-color"> tag when a user switches theme without a
 * reload. */

export type ThemeId = 'outfox' | 'stepmania' | 'fitness'

export const THEMES: ThemeId[] = ['outfox', 'stepmania', 'fitness']

export const DEFAULT_THEME: ThemeId = 'outfox'

export const THEME_COOKIE = 'theme'

const THEME_STORAGE_KEY = 'tracker:theme'

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEMES as string[]).includes(value)
}

/** Representative background color per theme, for the browser chrome
 *  (`generateViewport`'s themeColor and the live <meta> tag). Outfox mirrors
 *  the app's existing hardcoded dark value, since that theme still has a
 *  light/dark split of its own driven by prefers-color-scheme. */
export const THEME_COLOR: Record<ThemeId, string> = {
  outfox: '#0d1128',
  stepmania: '#08080b',
  fitness: '#ffffff',
}

/** Switches the live theme: updates the DOM attribute immediately, and
 *  persists it two ways — localStorage for instant re-application on this
 *  device, a cookie so the server can render the right `data-theme` on the
 *  very first paint of the next load. Client-only; a no-op during SSR. */
export function applyTheme(theme: ThemeId): void {
  if (typeof window === 'undefined') return

  document.documentElement.dataset.theme = theme
  localStorage.setItem(THEME_STORAGE_KEY, theme)
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLOR[theme])
}
