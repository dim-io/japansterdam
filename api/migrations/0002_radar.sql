-- Separate radar state; existing shop tables are untouched.
CREATE TABLE IF NOT EXISTS radar_control (
  id TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_slot INTEGER NOT NULL DEFAULT -1,
  last_attempt_at INTEGER,
  last_wake_at INTEGER,
  last_scan_at INTEGER,
  last_report TEXT,
  last_error TEXT,
  error_at INTEGER
);
CREATE TABLE IF NOT EXISTS radar_seen (
  pilot_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  price REAL NOT NULL,
  observed_at INTEGER NOT NULL,
  PRIMARY KEY (pilot_id, item_id)
);
CREATE TABLE IF NOT EXISTS radar_alerts (
  pilot_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  price REAL NOT NULL,
  delivery TEXT NOT NULL,
  message_id INTEGER,
  attempted_at INTEGER NOT NULL,
  PRIMARY KEY (pilot_id, item_id)
);
