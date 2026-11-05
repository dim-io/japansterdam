CREATE TABLE radar_vision_control (
  id TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  smoke_ok INTEGER NOT NULL DEFAULT 0,
  last_outcome TEXT,
  last_check_at INTEGER
);
CREATE TABLE radar_photo_checks (
  pilot_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  evidence_key TEXT NOT NULL,
  state TEXT NOT NULL,
  result TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (pilot_id,item_id,evidence_key)
);
INSERT INTO radar_vision_control (id) VALUES ('pilot-2026-11-04');
