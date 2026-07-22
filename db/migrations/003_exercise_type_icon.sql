-- Visual cue for exercise types, shown on timeline entries.
--
-- Stored as free text rather than an enum: it holds a single emoji, and the
-- set of "good exercise emoji" isn't something this app should gatekeep.

ALTER TABLE exercise_types
    ADD COLUMN icon text;
