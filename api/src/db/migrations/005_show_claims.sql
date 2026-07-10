-- Soft, advisory claim on a draft archive show while someone processes it.
-- Durable so it survives API restarts (Komodo redeploys) and long uploads that
-- outlive any live SSE connection. One claim per show; a new claim by another
-- user overwrites (the "open anyway" steal). last_seen_at is bumped by heartbeat
-- and drives the stale sweep.
CREATE TABLE IF NOT EXISTS show_claims (
  show_id      TEXT PRIMARY KEY,
  user_sub     TEXT NOT NULL,
  user_name    TEXT NOT NULL,
  claimed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
