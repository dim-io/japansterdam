-- One bounded check of already stored results. Does not reset scan or AI budgets.
CREATE TABLE radar_research_tests (
  pilot_id TEXT PRIMARY KEY,
  attempted_at INTEGER NOT NULL,
  state TEXT NOT NULL,
  report TEXT
);
