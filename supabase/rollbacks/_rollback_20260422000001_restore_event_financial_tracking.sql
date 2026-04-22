-- Rollback for 20260422000001_restore_event_financial_tracking.sql
-- Linear: NOC-34
--
-- Reverse order of creation. Safe to run repeatedly (IF EXISTS guards).

BEGIN;

-- 3. Revert event_expenses.projected_amount
ALTER TABLE public.event_expenses
  DROP COLUMN IF EXISTS projected_amount;

-- 2. Revert event_revenue_lines
DROP TABLE IF EXISTS public.event_revenue_lines;
DROP TYPE IF EXISTS revenue_line_category;

-- 1. Revert events.bar_minimum
ALTER TABLE public.events
  DROP COLUMN IF EXISTS bar_minimum;

COMMIT;
