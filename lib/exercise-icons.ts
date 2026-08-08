/** Sentinel values standing in for presets no emoji covers accurately — each
 *  renders as a custom SVG (see components/*-icon.tsx) everywhere an icon
 *  value is displayed, rather than as literal text. Kept to 16 chars or
 *  under: the icon column is validated at that length (see validate.ts). */
export const JUMP_ROPE_ICON = 'jump-rope'
export const SQUAT_ICON = 'squat'
export const SIDE_PLANK_ICON = 'side-plank'
export const REVERSE_CRUNCH_ICON = 'reverse-crunch'
export const AB_WHEEL_ROLLOUT_ICON = 'ab-wheel-rollout'
export const BALL_LEG_CURL_ICON = 'ball-leg-curl'
export const LAT_PULLDOWN_ICON = 'lat-pulldown'

/** Preset icons offered when picking a visual cue for an exercise type.
 *  Free text under the hood (see ExerciseType.icon) — this is just the menu,
 *  not a whitelist enforced anywhere else. */
export const EXERCISE_ICON_PRESETS: string[] = [
  '💪', '🏋️', '🏃', '🚴', '🧘', '🤸',
  '🥊', '🏊', '🦵', '🧗', '⛹️', '🤾',
  '🚶', '🤺', '🏓', JUMP_ROPE_ICON,
  SQUAT_ICON, SIDE_PLANK_ICON, REVERSE_CRUNCH_ICON, AB_WHEEL_ROLLOUT_ICON,
  BALL_LEG_CURL_ICON, LAT_PULLDOWN_ICON,
]

/** Shown for a type with no icon set — most existing types, right after this
 *  feature ships. */
export const DEFAULT_EXERCISE_ICON = '🏋️'
