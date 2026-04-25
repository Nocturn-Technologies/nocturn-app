-- ═══════════════════════════════════════════════════════════════════════
-- NOC-51: Restore stripped columns on event_tasks (QA only)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Tier: config — event_tasks is mutable until the event ends
--
-- Prod Supabase (zvmslijvdkcnkrjjgaie) has these four columns; QA's
-- entity-architecture rebuild (20260419000003_full_schema_rebuild.sql)
-- recreated event_tasks but stripped them. Same class of issue as
-- the missing rsvps table (NOC-50) and the missing stripe_* cache
-- columns on collectives.
--
-- Columns restored:
--   metadata   jsonb       — playbook source/position, AI content payloads
--   priority   text        — low / medium / high / urgent
--   deleted_at timestamptz — soft delete (per governance §6 rules for
--                            config tables with transactional refs)
--   updated_at timestamptz — audit trail + standard trigger target
--
-- Without these:
--   * applyLaunchPlaybook insert fails (writes priority + metadata)
--   * NOC-49 anchor-shift never fires (reads metadata.source/position)
--   * AI-generated content tasks lose their captions/hashtags/tip
--   * Soft-delete operations either hard-delete or fail silently
--
-- Backfill is safe: existing rows get default priority='medium' and
-- updated_at=created_at; metadata + deleted_at start NULL.
--
-- Governance references:
--   §1  Tier already declared (config table)
--   §6  Soft delete via deleted_at — config table with transactional refs
--   §7  Indexes on the new metadata source key + soft-delete partial index
--   §8  Additive only, ships rollback alongside
--
-- Rollback: 20260426000002_restore_event_tasks_columns.rollback.sql
-- Linear: NOC-51

BEGIN;

-- ─── Add columns ────────────────────────────────────────────────────────
ALTER TABLE public.event_tasks
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Constrain priority to the same set the application validates against.
-- ADD CONSTRAINT IF NOT EXISTS isn't supported in Postgres for CHECK, so
-- drop-then-add is the safe pattern.
ALTER TABLE public.event_tasks DROP CONSTRAINT IF EXISTS event_tasks_priority_check;
ALTER TABLE public.event_tasks ADD CONSTRAINT event_tasks_priority_check
  CHECK (priority IS NULL OR priority IN ('low', 'medium', 'high', 'urgent'));

-- ─── Backfill updated_at to match created_at on existing rows ───────────
UPDATE public.event_tasks SET updated_at = created_at WHERE updated_at IS NULL OR updated_at = created_at;

-- ─── Indexes ────────────────────────────────────────────────────────────
-- Mirror prod: index on metadata.source for the playbook anchor lookup
-- (NOC-49 walks every task in an event filtering by source; an expression
-- index makes that scan cheap once playbooks have lots of tasks).
CREATE INDEX IF NOT EXISTS idx_event_tasks_metadata_source
  ON public.event_tasks ((metadata->>'source'))
  WHERE metadata IS NOT NULL;

-- Partial index for the live-tasks list — most queries filter to non-deleted
CREATE INDEX IF NOT EXISTS idx_event_tasks_deleted_at
  ON public.event_tasks (deleted_at)
  WHERE deleted_at IS NULL;

-- ─── Updated-at trigger ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS event_tasks_updated_at ON public.event_tasks;
CREATE TRIGGER event_tasks_updated_at
  BEFORE UPDATE ON public.event_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMIT;
