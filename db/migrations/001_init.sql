-- Initial schema.
--
-- No user_id columns and no row-level security: Cloudflare Access authenticates
-- at the edge, so every request that reaches the app is already the owner's.
--
-- Rows carry client-generated UUIDs. The phone writes to IndexedDB first and
-- assigns the id itself, so a row keeps one identity from creation through sync
-- and there is no server round-trip needed to confirm a write.

CREATE TABLE exercise_types (
    id              uuid PRIMARY KEY,
    name            text        NOT NULL,
    -- Drive which fields the entry form shows: a plank asks for time, a pull-up
    -- asks for reps. Adding an exercise is a row insert, never a code change.
    tracks_reps     boolean     NOT NULL DEFAULT true,
    tracks_duration boolean     NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
);

CREATE UNIQUE INDEX exercise_types_name_unique
    ON exercise_types (lower(name))
    WHERE deleted_at IS NULL;

CREATE TABLE exercise_entries (
    id               uuid PRIMARY KEY,
    exercise_type_id uuid        NOT NULL REFERENCES exercise_types (id),
    reps             integer     CHECK (reps IS NULL OR reps >= 0),
    duration_seconds integer     CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    notes            text,
    performed_at     timestamptz NOT NULL,
    -- Unused for now. Present so workout sessions can be added later without a
    -- data migration, once there's enough use to know what shape they take.
    session_id       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz
);

CREATE INDEX exercise_entries_performed_at ON exercise_entries (performed_at DESC);
CREATE INDEX exercise_entries_updated_at ON exercise_entries (updated_at);
CREATE INDEX exercise_entries_type ON exercise_entries (exercise_type_id);

CREATE TYPE ddr_difficulty_scale AS ENUM ('old', 'new');

CREATE TABLE ddr_entries (
    id                  uuid PRIMARY KEY,
    song_title          text        NOT NULL,
    -- The numeric foot rating. Range depends on which scale it was read from,
    -- so the check covers the wider of the two and difficulty_scale records
    -- which one applies.
    difficulty          integer     NOT NULL CHECK (difficulty BETWEEN 1 AND 20),
    -- 'old' = the 1-10 scale, 'new' = the 1-20 scale introduced with DDR X.
    -- Stored as entered rather than normalized: the scales don't convert
    -- cleanly, and the raw value is what's wanted back out.
    difficulty_scale    ddr_difficulty_scale NOT NULL,
    song_length_seconds integer     CHECK (song_length_seconds IS NULL OR song_length_seconds > 0),
    percentage_score    numeric(5,2) NOT NULL CHECK (percentage_score BETWEEN 0 AND 100),
    -- Relative path into the photo volume; served through a route handler so
    -- Access stays in front of it.
    photo_path          text,
    performed_at        timestamptz NOT NULL,
    session_id          uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);

CREATE INDEX ddr_entries_performed_at ON ddr_entries (performed_at DESC);
CREATE INDEX ddr_entries_updated_at ON ddr_entries (updated_at);

-- Fuzzy-match corpus for photo import. Populated from entries as they're saved,
-- so it builds itself from actual play history. This is what turns "read
-- arbitrary stylized text" into "pick the nearest known title".
CREATE TABLE ddr_songs (
    id           uuid PRIMARY KEY,
    title        text        NOT NULL,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ddr_songs_title_unique ON ddr_songs (lower(title));
