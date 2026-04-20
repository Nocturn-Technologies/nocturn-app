-- Add deleted_at column to events table.
-- The new schema omitted this column but 30+ code paths filter by it.
-- All existing rows remain NULL (not deleted), so all active queries still match.
-- A future cleanup pass will remove the stale filters and drop this column.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
