/** Preset avatars offered when picking a profile picture.
 *
 *  Free text under the hood (see users.avatar_emoji) — this is the menu, not a
 *  whitelist enforced anywhere. Same arrangement as EXERCISE_ICON_PRESETS.
 *
 *  Deliberately not all gym equipment: this stands in for a person, and a row of
 *  identical dumbbells makes for a poor way of telling accounts apart. The
 *  animals do most of the work. */
export const AVATAR_ICON_PRESETS: string[] = [
  '🦩', '🦊', '🐙', '🦈', '🐉', '🦉',
  '🐺', '🦌', '🐸', '🦅', '🐴', '🦁',
  '💪', '🏃', '🚴', '🧘', '🏋️', '🤸',
  '⚡', '🔥', '🌊', '🌵', '🍀', '👾',
]

/** Shown for an account that hasn't picked one — which is every account at the
 *  moment it's created, so this is the common case rather than a fallback. */
export const DEFAULT_AVATAR_ICON = '🦩'
