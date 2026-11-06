-- Separate unpriced research candidates; no change to deal approvals or existing budgets.
CREATE TABLE radar_research (
  pilot_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  data TEXT NOT NULL,
  priority INTEGER NOT NULL,
  state TEXT NOT NULL,
  photo_state TEXT,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (pilot_id,item_id)
);
CREATE TABLE radar_research_limits (
  pilot_id TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0
);
