/** Preset icons offered when picking a visual cue for an exercise type.
 *  Free text under the hood (see ExerciseType.icon) — this is just the menu,
 *  not a whitelist enforced anywhere else. */
export const EXERCISE_ICON_PRESETS: string[] = [
  '💪', '🏋️', '🏃', '🚴', '🧘', '🤸',
  '🥊', '🏊', '🦵', '🧗', '⛹️', '🤾',
  '🚶', '🤺', '🏓', '🪢',
]

/** Shown for a type with no icon set — most existing types, right after this
 *  feature ships. */
export const DEFAULT_EXERCISE_ICON = '🏋️'
