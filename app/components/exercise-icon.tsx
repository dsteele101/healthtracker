import { JUMP_ROPE_ICON } from '@/lib/exercise-icons'
import { JumpRopeIcon } from './jump-rope-icon'

/** Renders an exercise type's icon value. Every preset but jump-rope is
 *  plain emoji text; jump-rope is a sentinel that maps to a custom SVG
 *  instead (see lib/exercise-icons.ts for why). */
export function ExerciseIcon({ icon }: { icon: string }) {
  if (icon === JUMP_ROPE_ICON) return <JumpRopeIcon />
  return <>{icon}</>
}
