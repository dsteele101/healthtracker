-- Number of sets, required for every exercise entry (unlike reps/duration,
-- which are gated behind tracks_reps/tracks_duration).

ALTER TABLE exercise_entries
    ADD COLUMN sets integer NOT NULL DEFAULT 1 CHECK (sets >= 1);

ALTER TABLE exercise_entries
    ALTER COLUMN sets DROP DEFAULT;
