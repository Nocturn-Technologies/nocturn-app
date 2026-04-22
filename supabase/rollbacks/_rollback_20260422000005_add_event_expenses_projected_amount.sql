-- Rollback for 20260422000005_add_event_expenses_projected_amount.sql
-- Linear: NOC-35

BEGIN;

ALTER TABLE public.event_expenses
  DROP COLUMN IF EXISTS projected_amount;

COMMIT;
