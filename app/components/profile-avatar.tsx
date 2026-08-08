'use client'

import { DEFAULT_AVATAR_ICON } from '@/lib/avatar-icons'
import type { MeResponse } from '@/lib/types'

/** The account's picture at a given size: an uploaded image, a picked emoji, or
 *  the default. One component so the header button, the menu and anywhere else
 *  can't disagree about which of the three wins. */
export function ProfileAvatar({ user, size }: { user: MeResponse | null; size: number }) {
  if (user?.avatar_path) {
    return (
      /* Served by a route handler behind auth rather than being a static asset,
       * so next/image has nothing to optimise here — and it is already stored
       * cropped to a 256px square, which is the work Image would be doing. */
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/avatar/${user.avatar_path}`}
        alt=""
        width={size}
        height={size}
        className="avatar-img"
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <span className="avatar-emoji" style={{ fontSize: Math.round(size * 0.58) }} aria-hidden="true">
      {user?.avatar_emoji ?? DEFAULT_AVATAR_ICON}
    </span>
  )
}

/** What to call this account. Falls back to the local part of the address, which
 *  is also what provisioning seeds display_name with — so this only does real
 *  work for an account that has since cleared its name. */
export function displayNameOf(user: MeResponse | null): string {
  if (!user) return 'Account'
  if (user.display_name) return user.display_name
  const at = user.email.indexOf('@')
  return at > 0 ? user.email.slice(0, at) : user.email || 'Account'
}
