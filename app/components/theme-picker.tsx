'use client'

import { useState } from 'react'
import { applyTheme, type ThemeId } from '@/lib/theme'

interface ThemeDef {
  id: ThemeId
  label: string
  tagline: string
  swatches: [string, string, string]
}

const THEME_DEFS: ThemeDef[] = [
  {
    id: 'outfox',
    label: 'Project Outfox',
    tagline: 'Navy HUD, combo-ready',
    swatches: ['#0d1128', '#ff8a3d', '#22c6f2'],
  },
  {
    id: 'stepmania',
    label: 'StepMania',
    tagline: 'Arcade neon, song wheel',
    swatches: ['#08080b', 'oklch(72% 0.24 340)', 'oklch(78% 0.19 195)'],
  },
  {
    id: 'fitness',
    label: 'Fitness',
    tagline: 'Sporty, high-contrast',
    swatches: ['#ffffff', 'oklch(58% 0.19 145)', 'oklch(58% 0.19 25)'],
  },
]

/** `initialTheme` comes from the server (the same cookie read that sets
 *  `<html data-theme>`), not from reading the DOM here — a component can't
 *  read `document` during SSR, so seeding state that way would render
 *  "outfox" on the server regardless of the real cookie and mismatch on
 *  hydration the moment the actual theme differs. */
export function ThemePicker({ initialTheme }: { initialTheme: ThemeId }) {
  const [active, setActive] = useState<ThemeId>(initialTheme)

  return (
    <div className="theme-picker-row">
      {THEME_DEFS.map((theme) => (
        <button
          key={theme.id}
          type="button"
          className={`theme-card ${active === theme.id ? 'theme-card-active' : ''}`}
          onClick={() => {
            applyTheme(theme.id)
            setActive(theme.id)
          }}
        >
          <div className="theme-swatch-row">
            {theme.swatches.map((color, i) => (
              <div key={i} className="theme-swatch" style={{ background: color }} />
            ))}
          </div>
          <div className="theme-card-name">{theme.label}</div>
          <div className="theme-card-tagline">{theme.tagline}</div>
        </button>
      ))}
    </div>
  )
}
