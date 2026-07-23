-- Artist and difficulty-name fields for DDR entries, filled by photo import or
-- typed by hand. Both free text: difficulty naming (Beginner/Hard/Expert/...)
-- varies by game and theme rather than following one fixed set.

ALTER TABLE ddr_entries
    ADD COLUMN artist text;

ALTER TABLE ddr_entries
    ADD COLUMN difficulty_type text;
