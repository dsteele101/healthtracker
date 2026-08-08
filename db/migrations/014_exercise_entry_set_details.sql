-- Per-set variance: sets recorded with different reps and/or weight each
-- (e.g. a descending pyramid), instead of one uniform reps/weight applied
-- across `sets`. NULL means "uniform" -- the common case -- and reps/weight
-- keep meaning what they do today. Same call as workout_templates.items
-- (009): a set has no identity outside its entry, so it's jsonb, not a join
-- table.
-- Shape: null | [{ reps, weight }, ...]
ALTER TABLE exercise_entries
    ADD COLUMN set_details jsonb;

ALTER TABLE exercise_entries
    ADD CONSTRAINT exercise_entries_set_details_shape
    CHECK (set_details IS NULL OR jsonb_typeof(set_details) = 'array');

-- Mirrors the app-level invariant lib/validate.ts enforces: when a per-set
-- breakdown is present, the scalar reps/weight it would otherwise duplicate
-- must be null, so a set's numbers live in exactly one place.
ALTER TABLE exercise_entries
    ADD CONSTRAINT exercise_entries_set_details_exclusive
    CHECK (set_details IS NULL OR (reps IS NULL AND weight IS NULL));
