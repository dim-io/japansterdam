-- The original Worker transport used redirect:error, which workerd rejects
-- before any request is sent. Keep the counted attempt; allow one corrected
-- scan after this exact pre-network failure, without resetting other history.
ALTER TABLE radar_control ADD COLUMN transport_retry INTEGER NOT NULL DEFAULT 0;
UPDATE radar_control SET transport_retry = 1
WHERE id = 'pilot-2026-11-04' AND attempts = 4 AND last_slot = 498306
  AND last_error = 'Scan niet voltooid: RADAR_PROVIDER_FAILED';
