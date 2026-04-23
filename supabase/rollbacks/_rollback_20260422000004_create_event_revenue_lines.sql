-- Rollback for 20260422000004_create_event_revenue_lines.sql (Path B)
-- Linear: NOC-34
--
-- Drops the audit trigger first, then the dependent table, then the
-- reference table. No enum type to drop under Path B.
-- Safe order: event_revenue_lines has FK → revenue_line_types, so the
-- child must go first.

BEGIN;

DROP TRIGGER IF EXISTS trg_audit_event_revenue_lines ON public.event_revenue_lines;

DROP TABLE IF EXISTS public.event_revenue_lines;
DROP TABLE IF EXISTS public.revenue_line_types;

COMMIT;
