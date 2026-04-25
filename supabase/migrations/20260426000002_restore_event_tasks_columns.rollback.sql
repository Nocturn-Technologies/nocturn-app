-- Rollback for 20260426000002_restore_event_tasks_columns.sql
-- Drops the four restored columns + the trigger + the indexes. Use only if
-- the restore landed broken; this is non-destructive only if no rows have
-- been written that depend on these columns since the migration ran.

BEGIN;
DROP TRIGGER IF EXISTS event_tasks_updated_at ON public.event_tasks;
DROP INDEX IF EXISTS public.idx_event_tasks_metadata_source;
DROP INDEX IF EXISTS public.idx_event_tasks_deleted_at;
ALTER TABLE public.event_tasks DROP CONSTRAINT IF EXISTS event_tasks_priority_check;
ALTER TABLE public.event_tasks
  DROP COLUMN IF EXISTS metadata,
  DROP COLUMN IF EXISTS priority,
  DROP COLUMN IF EXISTS deleted_at,
  DROP COLUMN IF EXISTS updated_at;
COMMIT;
