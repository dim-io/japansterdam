CREATE TABLE IF NOT EXISTS radar_deal_ratings (
 item_id TEXT PRIMARY KEY,
 evidence_key TEXT NOT NULL,
 input TEXT NOT NULL,
 priority INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL DEFAULT 'queued',
 result TEXT,
 created_at INTEGER NOT NULL,
 observed_at INTEGER NOT NULL,
 attempted_at INTEGER,
 rated_at INTEGER
);
CREATE INDEX IF NOT EXISTS radar_deal_ratings_queue ON radar_deal_ratings(state,priority,created_at);
CREATE TABLE IF NOT EXISTS radar_deal_rating_daily (
 day TEXT PRIMARY KEY,
 attempts INTEGER NOT NULL DEFAULT 0,
 blocked INTEGER NOT NULL DEFAULT 0
);
