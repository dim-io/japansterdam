-- Anonymous counters only: no visitor IDs, IP addresses, cookies or full URLs.
CREATE TABLE statistics_meta (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL);
INSERT INTO statistics_meta VALUES ('main', unixepoch()*1000);
CREATE TABLE statistics_daily (
 day TEXT NOT NULL, event TEXT NOT NULL, page TEXT NOT NULL,
 product TEXT NOT NULL DEFAULT '', source TEXT NOT NULL, device TEXT NOT NULL,
 country TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
 duration_sum INTEGER NOT NULL DEFAULT 0, duration_count INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(day,event,page,product,source,device,country)
);
CREATE INDEX statistics_by_day ON statistics_daily(day);
