-- Optional link to a video or article explaining an exercise, shown on its
-- detail page.

ALTER TABLE exercise_types
    ADD COLUMN info_url text;
