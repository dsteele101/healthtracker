/** Sentinel value standing in for the jump-rope preset. No emoji depicts a
 *  person jumping rope, so this renders as a custom SVG (see
 *  components/jump-rope-icon.tsx) everywhere an icon value is displayed,
 *  rather than as literal text. */
export const JUMP_ROPE_ICON = 'jump-rope'

/** Preset icons offered when picking a visual cue for an exercise type.
 *  Free text under the hood (see ExerciseType.icon) — this is just the menu,
 *  not a whitelist enforced anywhere else. */
export const EXERCISE_ICON_PRESETS: string[] = [
  '💪', '🏋️', '🏃', '🚴', '🧘', '🤸',
  '🥊', '🏊', '🦵', '🧗', '⛹️', '🤾',
  '🚶', '🤺', '🏓', JUMP_ROPE_ICON,
]

/** Shown for a type with no icon set — most existing types, right after this
 *  feature ships. */
export const DEFAULT_EXERCISE_ICON = '🏋️'
