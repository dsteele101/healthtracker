'use client'

import { useState } from 'react'

/** A numeric input that buffers its own text instead of deriving `value`
 *  straight from the parsed number. Binding `value` directly to a `number |
 *  null` collapses transient text on every keystroke -- "12." re-renders as
 *  "12" because `Number("12.") === 12`, silently dropping the decimal point,
 *  and a leading "." parses to NaN and gets displayed back as the string
 *  "NaN". Buffering the text lets users type multi-character decimals; the
 *  `value !== lastReported` check below resyncs from props when the parent
 *  changes the value for reasons other than this field's own onChange (e.g.
 *  a reset). */
export function NumberField({
  value,
  onChange,
  placeholder,
  inputMode = 'decimal',
}: {
  value: number | null
  onChange: (value: number | null) => void
  placeholder?: string
  inputMode?: 'decimal' | 'numeric'
}) {
  const [text, setText] = useState(value !== null ? String(value) : '')
  const [lastReported, setLastReported] = useState(value)

  if (value !== lastReported) {
    setLastReported(value)
    setText(value !== null ? String(value) : '')
  }

  return (
    <input
      inputMode={inputMode}
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        const next = e.target.value.trim()
        setText(next)
        const parsed = next ? Number(next) : null
        const result = parsed === null || Number.isNaN(parsed) ? null : parsed
        setLastReported(result)
        onChange(result)
      }}
    />
  )
}
