-- Sync cursor support.
--
-- Two different questions need two different answers, and conflating them is a
-- silent data-loss bug:
--
--   "which edit is newer?"        -> updated_at, set by the client at edit time,
--                                   because offline edits have to be orderable
--                                   before the server ever sees them.
--
--   "what has the server learned   -> server_seq, below.
--    about since I last pulled?"
--
-- Using updated_at for both breaks under clock skew: if the phone's clock runs
-- a few minutes slow, rows it writes get an updated_at in the past, and the
-- laptop's "give me everything after <cursor>" pull steps straight over them.
-- The rows exist on the server and simply never arrive. A monotonic sequence
-- assigned by the server sidesteps clocks entirely.

CREATE SEQUENCE sync_seq;

ALTER TABLE exercise_types
    ADD COLUMN server_seq bigint NOT NULL DEFAULT nextval('sync_seq');
ALTER TABLE exercise_entries
    ADD COLUMN server_seq bigint NOT NULL DEFAULT nextval('sync_seq');
ALTER TABLE ddr_entries
    ADD COLUMN server_seq bigint NOT NULL DEFAULT nextval('sync_seq');

-- Pull is always "where server_seq > cursor order by server_seq", so these
-- carry every read the sync endpoint makes.
CREATE INDEX exercise_types_server_seq ON exercise_types (server_seq);
CREATE INDEX exercise_entries_server_seq ON exercise_entries (server_seq);
CREATE INDEX ddr_entries_server_seq ON ddr_entries (server_seq);
