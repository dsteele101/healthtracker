'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { THEME_CHANGE_EVENT, THEME_LABEL, type ThemeId } from '@/lib/theme'
import { useActiveSession, useIdentity } from '@/lib/use-store'
import { ProfileAvatar, displayNameOf } from './profile-avatar'
import { SyncBadge } from './sync-badge'

const MARQUEE_TEXT =
  'NEW SESSION LOGGED ♦ KEEP THE STREAK GOING ♦ CHECK YOUR PERSONAL RECORDS ♦ '

interface NavItem {
  href: string
  label: string
  match: (pathname: string) => boolean
}

/** Mirrors the design handoff's screen list exactly (Home/Log/Routines/
 *  Session/Stats/Exercises/Data/Settings) — one nav tab per screen, not one
 *  per route, so "Log" covers both /log/exercise and /log/ddr and "Session"
 *  follows whichever session (in-progress, or the start flow) is current. */
function buildNavItems(sessionHref: string): NavItem[] {
  return [
    { href: '/', label: 'Home', match: (p) => p === '/' },
    { href: '/log/exercise', label: 'Log', match: (p) => p.startsWith('/log') },
    { href: '/routines', label: 'Routines', match: (p) => p.startsWith('/routines') },
    { href: sessionHref, label: 'Session', match: (p) => p.startsWith('/sessions') },
    { href: '/stats', label: 'Stats', match: (p) => p.startsWith('/stats') },
    { href: '/types', label: 'Exercises', match: (p) => p.startsWith('/types') || p.startsWith('/exercise/') },
    { href: '/data', label: 'Data', match: (p) => p.startsWith('/data') },
    { href: '/settings', label: 'Settings', match: (p) => p.startsWith('/settings') },
  ]
}

/** Persistent top nav, shared across every route. Section navigation and the
 *  account entry point (avatar → Settings) — a different job than each
 *  page's own primary-action buttons, which stay put. Nav shape, marquee
 *  visibility and font all come from `[data-theme]` CSS in globals.css; the
 *  only thing this component branches on in JS is which tab is active and
 *  whether the mobile menu is open. */
export function NavBar({ initialTheme }: { initialTheme: ThemeId }) {
  const pathname = usePathname()
  const user = useIdentity()
  const activeSession = useActiveSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const [theme, setTheme] = useState(initialTheme)

  // CSS reacts to `[data-theme]` on its own; the brand text is JS-rendered
  // content, so it needs this explicit signal to follow a live theme switch
  // from Settings instead of only updating on the next full navigation.
  useEffect(() => {
    const onThemeChange = (event: Event) => setTheme((event as CustomEvent<ThemeId>).detail)
    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange)
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange)
  }, [])

  const sessionHref = activeSession ? `/sessions/${activeSession.id}` : '/sessions/start'
  const navItems = useMemo(() => buildNavItems(sessionHref), [sessionHref])

  return (
    <>
      <nav className="nav-bar">
        <button
          type="button"
          className="nav-hamburger"
          aria-label="Menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          ☰
        </button>

        <Link href="/" className="nav-brand">
          {THEME_LABEL[theme]}
        </Link>

        <div className="nav-tabs-row">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`nav-tab ${item.match(pathname) ? 'nav-tab-active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <SyncBadge />

        <Link href="/settings" className="nav-avatar-link" aria-label={`Settings: ${displayNameOf(user)}`}>
          <ProfileAvatar user={user} size={36} />
        </Link>
      </nav>

      {menuOpen && (
        <>
          <div className="nav-menu-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="nav-menu-panel">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`nav-menu-item ${item.match(pathname) ? 'nav-menu-item-active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="marquee-wrap" aria-hidden="true">
        <div className="marquee-track">{MARQUEE_TEXT.repeat(2)}</div>
      </div>
    </>
  )
}
