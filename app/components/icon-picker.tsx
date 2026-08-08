'use client'

import type { ReactNode } from 'react'

/** Preset grid plus a "none" option that clears back to whatever fallback the
 *  caller renders. Used for exercise type icons and for profile pictures; the
 *  preset list is a prop because those are different menus, but the grid, the
 *  selected state and the 44px hit targets should not drift apart.
 *
 *  `value` is free text rather than one of `presets` — a row may hold an emoji
 *  that has since been dropped from the list, and it stays selected. null means
 *  the "none" choice is selected; a value matching nothing selects nothing,
 *  which is how a caller says "what's in use isn't from this grid at all".
 *
 *  `renderIcon` defaults to showing the preset value as-is (plain emoji text);
 *  pass it when a preset is a sentinel that needs a custom glyph instead, e.g.
 *  the jump-rope entry in EXERCISE_ICON_PRESETS. */
export function IconPicker({
  presets,
  value,
  onChange,
  clearLabel = 'No icon',
  renderIcon = (icon: string) => icon,
}: {
  presets: string[]
  value: string | null
  onChange: (icon: string | null) => void
  clearLabel?: string
  renderIcon?: (icon: string) => ReactNode
}) {
  return (
    <div className="icon-grid">
      <button
        type="button"
        className={`icon-choice ${value === null ? 'icon-choice-active' : ''}`}
        aria-pressed={value === null}
        aria-label={clearLabel}
        onClick={() => onChange(null)}
      >
        <span className="muted">—</span>
      </button>
      {presets.map((icon) => (
        <button
          key={icon}
          type="button"
          className={`icon-choice ${value === icon ? 'icon-choice-active' : ''}`}
          aria-pressed={value === icon}
          aria-label={icon}
          onClick={() => onChange(icon)}
        >
          {renderIcon(icon)}
        </button>
      ))}
    </div>
  )
}
