-- Reusable named routines (e.g. "Leg Day") that a session can be started from.
--
-- Items have no identity outside their template and always change together
-- with it, so they're a jsonb column rather than a join table — same call as
-- ddr_songs being a flat table instead of normalized history.
-- Shape: [{ exercise_type_id, target_sets, target_reps, target_duration_seconds, notes }]

CREATE TABLE workout_templates (
    id         uuid PRIMARY KEY,
    name       text        NOT NULL,
    items      jsonb       NOT NULL DEFAULT '[]',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    server_seq bigint      NOT NULL DEFAULT nextval('sync_seq')
);

CREATE INDEX workout_templates_server_seq ON workout_templates (server_seq);
