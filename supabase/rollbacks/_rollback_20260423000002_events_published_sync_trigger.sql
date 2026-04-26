-- Rollback for 20260423000002_events_published_sync_trigger.sql
-- Linear: NOC-XX (S02 events is_published sync)
--
-- Drops the trigger + function. events.is_published stays populated with
-- the values at time of rollback; future writes will no longer be kept in
-- sync with status, so downstream code is back to where it was before
-- this PR. Safe to run.

BEGIN;

DROP TRIGGER IF EXISTS trg_events_is_published_sync ON public.events;
DROP FUNCTION IF EXISTS public.sync_events_is_published();

COMMIT;
