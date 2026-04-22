-- Rollback for 20260422000004_create_event_revenue_lines.sql
-- Linear: NOC-34

BEGIN;

DROP TABLE IF EXISTS public.event_revenue_lines;
DROP TYPE IF EXISTS revenue_line_category;

COMMIT;
