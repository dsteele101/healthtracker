import {
  AB_WHEEL_ROLLOUT_ICON,
  BALL_LEG_CURL_ICON,
  JUMP_ROPE_ICON,
  LAT_PULLDOWN_ICON,
  REVERSE_CRUNCH_ICON,
  SIDE_PLANK_ICON,
  SQUAT_ICON,
} from '@/lib/exercise-icons'
import { AbWheelRolloutIcon } from './ab-wheel-rollout-icon'
import { BallLegCurlIcon } from './ball-leg-curl-icon'
import { JumpRopeIcon } from './jump-rope-icon'
import { LatPulldownIcon } from './lat-pulldown-icon'
import { ReverseCrunchIcon } from './reverse-crunch-icon'
import { SidePlankIcon } from './side-plank-icon'
import { SquatIcon } from './squat-icon'

const CUSTOM_ICONS: Record<string, () => React.JSX.Element> = {
  [JUMP_ROPE_ICON]: JumpRopeIcon,
  [SQUAT_ICON]: SquatIcon,
  [SIDE_PLANK_ICON]: SidePlankIcon,
  [REVERSE_CRUNCH_ICON]: ReverseCrunchIcon,
  [AB_WHEEL_ROLLOUT_ICON]: AbWheelRolloutIcon,
  [BALL_LEG_CURL_ICON]: BallLegCurlIcon,
  [LAT_PULLDOWN_ICON]: LatPulldownIcon,
}

/** Renders an exercise type's icon. Three kinds, in precedence order:
 *
 *   - a generated drawing, which is markup rather than a value (see below);
 *   - a preset sentinel that maps to a hand-drawn SVG, for exercises no emoji
 *     depicts accurately (see lib/exercise-icons.ts);
 *   - anything else, which is a plain emoji and renders as text.
 *
 *  Callers that have a whole type row pass both fields; the fallback emoji goes
 *  in `icon`, since a row with neither set still has to render something. */
export function ExerciseIcon({ icon, iconSvg }: { icon: string; iconSvg?: string | null }) {
  if (iconSvg) return <GeneratedIcon svg={iconSvg} />

  const Custom = CUSTOM_ICONS[icon]
  return Custom ? <Custom /> : <>{icon}</>
}

/* The wrapper is written here rather than generated, so it is identical for
 * every icon and not the model's to decide: same viewBox the presets use, same
 * sizing class, and no fill of its own so currentColor inherits from the slot.
 *
 * dangerouslySetInnerHTML is the only way to mount markup that arrived as a
 * string. What makes it safe is that nothing reaches this column unsanitized —
 * both writers, the generation route and the sync validator, go through
 * sanitizeIconSvg first, and it admits shape elements only. See lib/icon-svg.ts. */
function GeneratedIcon({ svg }: { svg: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="jump-rope-icon"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
