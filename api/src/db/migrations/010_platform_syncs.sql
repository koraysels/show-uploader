-- When each show's metadata was last pushed to each platform. One row per
-- (show, platform), overwritten on every successful sync — history isn't the
-- point, "how stale is what the platform shows" is.
CREATE TABLE IF NOT EXISTS platform_syncs (
  show_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (show_id, platform)
);
