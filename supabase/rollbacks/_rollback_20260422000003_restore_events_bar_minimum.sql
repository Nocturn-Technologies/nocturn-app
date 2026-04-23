-- Rollback for 20260422000003_restore_events_bar_minimum.sql
-- Linear: NOC-33

BEGIN;

ALTER TABLE public.events
  DROP COLUMN IF EXISTS bar_minimum;

COMMIT;
