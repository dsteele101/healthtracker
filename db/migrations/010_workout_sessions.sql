-- A concrete grouping of entries logged together, e.g. "Leg Day - Tuesday".
--
-- ended_at IS NULL means the session is in progress -- that's the only signal
-- "active session" needs, so there's no separate status flag.
--
-- This is what exercise_entries.session_id and ddr_entries.session_id (added
-- in 001_init.sql, unused until now) finally point at.

CREATE TABLE workout_sessions (
    id          uuid PRIMARY KEY,
    name        text,
    template_id uuid REFERENCES workout_templates (id),
    started_at  timestamptz NOT NULL,
    ended_at    timestamptz,
    notes       text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    deleted_at  timestamptz,
    server_seq  bigint      NOT NULL DEFAULT nextval('sync_seq')
);

CREATE INDEX workout_sessions_server_seq ON workout_sessions (server_seq);
CREATE INDEX workout_sessions_started_at ON workout_sessions (started_at DESC);

-- No ON DELETE clause: sessions are soft-deleted like every other table here,
-- never hard-deleted, so the referenced row always still exists.
ALTER TABLE exercise_entries
    ADD CONSTRAINT exercise_entries_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES workout_sessions (id);

ALTER TABLE ddr_entries
    ADD CONSTRAINT ddr_entries_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES workout_sessions (id);
