-- Rollback for 20260423000001_add_events_timezone.sql
-- Linear: NOC-XX (S01 events.timezone)
--
-- Safe to run: drops the column if present. Any app code reading
-- events.timezone will need the feature-branch reverted as part of the
-- rollback — grep for `events.timezone` / `event.timezone` and the
-- date.ts helpers' optional timezone param before dropping.

BEGIN;

ALTER TABLE public.events
  DROP COLUMN IF EXISTS timezone;

COMMIT;
