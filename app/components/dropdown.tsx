'use client'

import { useEffect, useRef, useState } from 'react'

export interface DropdownOption {
  value: string
  label: string
}

/** App-styled stand-in for a native `<select>` -- a trigger that looks like
 *  the app's other inputs, opening a card-styled panel instead of the
 *  browser's own (unthemeable) option list. Always filterable, so long lists
 *  stay as fast to narrow down as the old type-to-search fields were. */
export function Dropdown({
  id,
  label,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
}: {
  id: string
  label: string
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  function close() {
    setOpen(false)
    setQuery('')
  }

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close()
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const selected = options.find((o) => o.value === value)
  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <div className="field dropdown" ref={rootRef}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <button
        id={id}
        type="button"
        className="dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected ? undefined : 'muted'}>{selected?.label ?? placeholder}</span>
        <span className="dropdown-chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="dropdown-panel">
          <input
            className="dropdown-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            autoComplete="off"
            autoFocus
          />
          <div className="dropdown-options" role="listbox" aria-labelledby={id}>
            {filtered.length ? (
              filtered.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className={`dropdown-option ${option.value === value ? 'dropdown-option-active' : ''}`}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  {option.label}
                </button>
              ))
            ) : (
              <p className="muted dropdown-empty">No matches.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
