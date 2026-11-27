# Continuous Radar

The owner's 23 November 2026 instruction enables `tools/deal-radar/operation.json`.
Only an installed private runtime can activate it; the public pilot stays disabled.
Cloudflare Cron wakes every five minutes, scanning one group of up to three brands.
The 53 brands rotate in 18 groups (90 minutes per full cycle).

Each UTC day has its own `continuous-YYYY-MM-DD` reservation key, a 24-hour window
and at most 288 scans. Initialization uses INSERT OR IGNORE and preserves existing
counters, historic seen IDs and research delivery states. Seen IDs remain global,
so midnight and redeploys do not re-alert existing listings. Results include source
runs since the previous private pilot's start rather than only today's runs.

Apify account preflight still runs before every scan. Existing included-credit and
monthly spending limits remain authoritative: continuous scheduling can pause at
the budget ceiling. No plan upgrade or extra paid credit is authorized by this code.
The owner’s 27 November instruction increases the result allowance to 20 per brand
(up to 60 listings per grouped run), with the same 18 groups / 90-minute cycle.
Alias searches share each group’s source allowance; normalization caps each brand
at 20. The provider ceiling is $0.03 per run. The monthly included-credit limit,
monitor memories, scan reservations and AI budgets stay unchanged. Backend dataset
reads include all 60 potential rows rather than silently stopping at 30. Global daily AI limits remain 240 deal
ratings and three image calls. Expired Free-plan attestations are not renewed by
changing the scan window; deployment rechecks account subscriptions. Without Free
confirmation, scanning continues with automatic AI disabled.

Public /status reports runMode=continuous, endsAt=null and nextDailyResetAt,
plus scan counters, errors, all brands and the actual last completed scan.
To pause, disable the operation manifest and private policy; no historical data
needs to be deleted or counters reset.
