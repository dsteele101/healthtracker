-- Profile picture.
--
-- Two nullable columns rather than one, because the two kinds of avatar are
-- genuinely different things and squeezing both into one text column would mean
-- inventing a prefix convention ('emoji:' / 'upload:') that every reader has to
-- know about. At most one is ever set; the API clears the other when it writes
-- one, and deletes the file it orphans.
--
-- Both NULL means "no picture chosen", which every account starts as and is a
-- perfectly good end state -- the UI falls back to a default icon rather than
-- nagging.
--
-- display_name already exists from 011_users.sql. It gets a default at
-- provisioning time (the local part of the email) and is editable from here on.

-- A single emoji picked from the presets. Free text, like exercise_types.icon:
-- the preset list is a menu, not a whitelist, so an account that sets something
-- else is displaying it rather than breaking.
ALTER TABLE users ADD COLUMN avatar_emoji text;

-- Filename of an uploaded picture, relative to the avatars directory inside the
-- photo volume. Named with a fresh uuid on every upload rather than being keyed
-- to the account, so the URL changes when the picture does and a cached copy can
-- never be the stale one.
ALTER TABLE users ADD COLUMN avatar_path text;

-- Neither is required, but setting both is a bug rather than a state worth
-- rendering -- it would leave "which one wins?" to whichever branch happened to
-- be checked first.
ALTER TABLE users ADD CONSTRAINT users_one_avatar_kind
    CHECK (avatar_emoji IS NULL OR avatar_path IS NULL);
