/** Link/video URL field, shared by every form that edits ExerciseType.info_url. */
export function InfoUrlField({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        More info (optional)
      </label>
      <input
        id={id}
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://…"
        autoComplete="off"
      />
      <p className="hint">Link to a video or article demonstrating the exercise.</p>
    </div>
  )
}
