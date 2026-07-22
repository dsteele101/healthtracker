-- Optional weight used for an exercise entry, e.g. a loaded squat vs bodyweight.

ALTER TABLE exercise_entries
    ADD COLUMN weight numeric(6,2) CHECK (weight IS NULL OR weight >= 0);
