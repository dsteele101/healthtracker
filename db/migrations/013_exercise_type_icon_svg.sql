-- Generated icon for an exercise type: a small drawing the LLM produces from
-- the exercise's name, for the many movements no emoji depicts.
--
-- A second column rather than a wider `icon`, for the same reason users got
-- two avatar columns in 012_user_avatar.sql: a picked preset and a generated
-- drawing are genuinely different things, and folding both into one text
-- column would mean inventing a prefix convention ('emoji:' / 'svg:') that
-- every reader has to know about. `icon` is capped at 16 characters besides
-- (see lib/validate.ts), which no drawing fits inside.
--
-- What it holds is the *contents* of an `<svg viewBox="0 0 100 100">`, not a
-- whole document -- shape elements only. That is what makes it safe to render
-- into the page (see lib/icon-svg.ts) and what makes a generated icon sit in
-- the same slot, at the same size, in the same color as the hand-drawn presets
-- in app/components/*-icon.tsx.
ALTER TABLE exercise_types
    ADD COLUMN icon_svg text;

-- Both NULL means "no icon chosen", which every existing type is and which the
-- UI already renders as a generic fallback. Setting both is a bug rather than
-- a state worth rendering -- it would leave "which one wins?" to whichever
-- branch happened to be checked first -- so the writer clears one when it sets
-- the other, and this refuses the pair outright.
ALTER TABLE exercise_types ADD CONSTRAINT exercise_types_one_icon_kind
    CHECK (icon IS NULL OR icon_svg IS NULL);
