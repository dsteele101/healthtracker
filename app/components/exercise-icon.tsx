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

/** Renders an exercise type's icon value. Most presets are plain emoji
 *  text; a handful are sentinels that map to a custom SVG instead, for
 *  exercises no emoji depicts accurately (see lib/exercise-icons.ts). */
export function ExerciseIcon({ icon }: { icon: string }) {
  const Custom = CUSTOM_ICONS[icon]
  return Custom ? <Custom /> : <>{icon}</>
}
