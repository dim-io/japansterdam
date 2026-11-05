-- New trial state, preserving the original counters and delivery history.
INSERT OR IGNORE INTO radar_control (id) VALUES ('pilot-2026-11-06');
INSERT OR IGNORE INTO radar_vision_control (id,smoke_ok,last_outcome)
SELECT 'pilot-2026-11-06',smoke_ok,last_outcome FROM radar_vision_control WHERE id='pilot-2026-11-04';
-- Carry forward deduplication: a new trial must not resend an old alert.
INSERT OR IGNORE INTO radar_alerts SELECT 'pilot-2026-11-06',item_id,price,delivery,message_id,attempted_at FROM radar_alerts WHERE pilot_id='pilot-2026-11-04';
INSERT OR IGNORE INTO radar_seen SELECT 'pilot-2026-11-06',item_id,price,observed_at FROM radar_seen WHERE pilot_id='pilot-2026-11-04';
CREATE TABLE radar_vision_daily (day TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0);
-- Conservative historic baseline: pending and failed calls count too.
INSERT INTO radar_vision_daily (day,attempts)
SELECT strftime('%Y-%m-%d',created_at/1000,'unixepoch'),COUNT(*) FROM radar_photo_checks GROUP BY 1;
