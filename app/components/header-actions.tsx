'use client'

import { ProfileMenu } from './profile-menu'
import { SyncBadge } from './sync-badge'

/** The right-hand side of every page header.
 *
 *  One component rather than two tags repeated across ten pages, so the next
 *  thing that belongs up there is a single edit instead of ten. The sync badge
 *  stays quiet unless it has something to say; the account button is always
 *  there. */
export function HeaderActions() {
  return (
    <div className="row header-actions">
      <SyncBadge />
      <ProfileMenu />
    </div>
  )
}
