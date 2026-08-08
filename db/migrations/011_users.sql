-- Multi-user.
--
-- Supersedes the opening note in 001_init.sql. Cloudflare Access is still the
-- only thing standing between the internet and this app, but the app now
-- verifies the Access JWT itself and reads the email claim from it, so it knows
-- *which* authorized person is calling rather than assuming there is only one.
--
-- exercise_types stays global on purpose: one shared catalog everyone picks
-- from and can add to, so nobody has to re-create "Push-up". Logs are private.

CREATE TABLE users (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email        text        NOT NULL,
    display_name text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive: the identity provider returns whatever case it has on file,
-- and two casings of one address must not become two accounts holding two
-- halves of one person's history.
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

-- The account this app has been running as since 001_init.sql. Everything
-- currently in the database is theirs.
INSERT INTO users (email, display_name) VALUES ('derrick.l.steele@gmail.com', 'Derrick');


-- --- ownership ---------------------------------------------------------------

ALTER TABLE workout_templates ADD COLUMN user_id uuid REFERENCES users (id);
ALTER TABLE workout_sessions  ADD COLUMN user_id uuid REFERENCES users (id);
ALTER TABLE exercise_entries  ADD COLUMN user_id uuid REFERENCES users (id);
ALTER TABLE ddr_entries       ADD COLUMN user_id uuid REFERENCES users (id);

-- Added nullable and backfilled rather than declared NOT NULL up front, because
-- there is no sensible column default: ownership comes from a row in users that
-- does not exist until three statements ago.
--
-- Deliberately does NOT touch server_seq. The owner's devices already hold every
-- one of these rows; re-stamping them would push the whole history back down the
-- wire on the next pull to say nothing the client doesn't know.
UPDATE workout_templates t SET user_id = u.id FROM users u
    WHERE lower(u.email) = 'derrick.l.steele@gmail.com' AND t.user_id IS NULL;
UPDATE workout_sessions s SET user_id = u.id FROM users u
    WHERE lower(u.email) = 'derrick.l.steele@gmail.com' AND s.user_id IS NULL;
UPDATE exercise_entries e SET user_id = u.id FROM users u
    WHERE lower(u.email) = 'derrick.l.steele@gmail.com' AND e.user_id IS NULL;
UPDATE ddr_entries d SET user_id = u.id FROM users u
    WHERE lower(u.email) = 'derrick.l.steele@gmail.com' AND d.user_id IS NULL;

ALTER TABLE workout_templates ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE workout_sessions  ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE exercise_entries  ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE ddr_entries       ALTER COLUMN user_id SET NOT NULL;


-- --- pull indexes ------------------------------------------------------------

-- Pull is now "WHERE user_id = $2 AND server_seq > $1 ORDER BY server_seq".
--
-- A single-column server_seq index can no longer serve that as a range scan: it
-- would walk the whole table in sequence order discarding rows belonging to
-- other people, so one quiet user behind an active one scans arbitrarily far to
-- fill a page. Leading with user_id makes it a range scan again, and keeping
-- server_seq second preserves the ORDER BY for free.
CREATE INDEX workout_templates_user_seq ON workout_templates (user_id, server_seq);
CREATE INDEX workout_sessions_user_seq  ON workout_sessions  (user_id, server_seq);
CREATE INDEX exercise_entries_user_seq  ON exercise_entries  (user_id, server_seq);
CREATE INDEX ddr_entries_user_seq       ON ddr_entries       (user_id, server_seq);

-- Now dead. Pull was the only reader of server_seq on these tables -- push only
-- ever asks the sequence itself for last_value.
DROP INDEX workout_templates_server_seq;
DROP INDEX workout_sessions_server_seq;
DROP INDEX exercise_entries_server_seq;
DROP INDEX ddr_entries_server_seq;
-- exercise_types_server_seq stays: that table is shared, so it is still pulled
-- unfiltered and its index is still exactly the one the query wants.

-- Timeline reads are per-user now too.
DROP INDEX exercise_entries_performed_at;
DROP INDEX ddr_entries_performed_at;
DROP INDEX workout_sessions_started_at;
CREATE INDEX exercise_entries_user_performed_at ON exercise_entries (user_id, performed_at DESC);
CREATE INDEX ddr_entries_user_performed_at      ON ddr_entries      (user_id, performed_at DESC);
CREATE INDEX workout_sessions_user_started_at   ON workout_sessions (user_id, started_at DESC);


-- --- cross-user reference integrity ------------------------------------------

-- A plain "REFERENCES workout_sessions (id)" is satisfied by *anyone's* session,
-- so nothing would stop one account from logging an entry into another's
-- workout. Carrying user_id into the foreign key makes a row only able to point
-- at a parent belonging to the same person, enforced by storage rather than by
-- every future route handler remembering to check.
--
-- MATCH SIMPLE -- the default, and what we want -- treats a row with any NULL
-- among the referencing columns as satisfying the constraint. Since user_id is
-- NOT NULL, that reduces to "session_id IS NULL passes", which is exactly what
-- an entry outside any session needs. MATCH FULL would reject it.
--
-- The UNIQUE constraints duplicate each table's primary key index, which is the
-- price of being a composite foreign key target. One extra btree on tables this
-- size is not a cost worth avoiding.
ALTER TABLE workout_templates ADD CONSTRAINT workout_templates_id_user_key UNIQUE (id, user_id);
ALTER TABLE workout_sessions  ADD CONSTRAINT workout_sessions_id_user_key  UNIQUE (id, user_id);

ALTER TABLE workout_sessions DROP CONSTRAINT workout_sessions_template_id_fkey;
ALTER TABLE workout_sessions
    ADD CONSTRAINT workout_sessions_template_fkey
    FOREIGN KEY (template_id, user_id) REFERENCES workout_templates (id, user_id);

ALTER TABLE exercise_entries DROP CONSTRAINT exercise_entries_session_id_fkey;
ALTER TABLE exercise_entries
    ADD CONSTRAINT exercise_entries_session_fkey
    FOREIGN KEY (session_id, user_id) REFERENCES workout_sessions (id, user_id);

ALTER TABLE ddr_entries DROP CONSTRAINT ddr_entries_session_id_fkey;
ALTER TABLE ddr_entries
    ADD CONSTRAINT ddr_entries_session_fkey
    FOREIGN KEY (session_id, user_id) REFERENCES workout_sessions (id, user_id);

-- workout_templates.items is jsonb holding exercise_type_id values with no
-- foreign key. That stays as it is: those point at the shared catalog, so there
-- is no cross-user reference to constrain.


-- --- shared catalog attribution ----------------------------------------------

-- exercise_types has no user_id -- it is the one shared table, and anyone may
-- add to it or correct it. But "shared" should not mean one person can retire a
-- movement out from under everyone else's timeline, so record who added each
-- one and let the push route refuse a delete from anyone else.
--
-- Nullable: the rows that predate this migration were added when there was only
-- one person, and attributing them to that account would be a guess about
-- intent rather than a fact. NULL reads as "part of the original catalog".
ALTER TABLE exercise_types ADD COLUMN created_by uuid REFERENCES users (id);
