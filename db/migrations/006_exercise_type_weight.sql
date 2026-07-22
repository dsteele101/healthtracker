-- Whether an exercise type's log form should ask for weight, mirroring
-- tracks_reps/tracks_duration from 001_init.sql.

ALTER TABLE exercise_types
    ADD COLUMN tracks_weight boolean NOT NULL DEFAULT false;

ALTER TABLE exercise_types
    ALTER COLUMN tracks_weight DROP DEFAULT;
