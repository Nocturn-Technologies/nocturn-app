-- Rollback for 20260426000001_recreate_rsvps_table.sql
-- Drops the rsvps table + all its dependencies (indexes, trigger, policies
-- cascade with the table). Use only if the recreate landed broken.

BEGIN;
DROP TRIGGER IF EXISTS rsvps_updated_at ON public.rsvps;
DROP TABLE IF EXISTS public.rsvps CASCADE;
COMMIT;
