-- Preserve existing counters; old rows have no hour or software dimensions.
DROP INDEX IF EXISTS statistics_by_day;
ALTER TABLE statistics_daily RENAME TO statistics_daily_previous;
CREATE TABLE statistics_daily (
 day TEXT NOT NULL, event TEXT NOT NULL, page TEXT NOT NULL,
 product TEXT NOT NULL DEFAULT '', source TEXT NOT NULL, device TEXT NOT NULL,
 country TEXT NOT NULL, hour INTEGER NOT NULL DEFAULT -1,
 browser TEXT NOT NULL DEFAULT 'Onbekend', operating_system TEXT NOT NULL DEFAULT 'Onbekend',
 count INTEGER NOT NULL DEFAULT 0, duration_sum INTEGER NOT NULL DEFAULT 0, duration_count INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(day,event,page,product,source,device,country,hour,browser,operating_system)
);
INSERT INTO statistics_daily(day,event,page,product,source,device,country,count,duration_sum,duration_count)
SELECT day,event,page,product,source,device,country,count,duration_sum,duration_count FROM statistics_daily_previous;
DROP TABLE statistics_daily_previous;
CREATE INDEX statistics_by_day ON statistics_daily(day);
ALTER TABLE statistics_meta ADD COLUMN visitor_insights_started_at INTEGER;
UPDATE statistics_meta SET visitor_insights_started_at=unixepoch()*1000 WHERE id='main';
