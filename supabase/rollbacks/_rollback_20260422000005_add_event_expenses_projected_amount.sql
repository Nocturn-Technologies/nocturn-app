-- Rollback for 20260422000005_add_event_expenses_projected_amount.sql
-- Linear: NOC-35
--
-- Drops the audit trigger first, then the two new columns. `amount`
-- column is untouched (it was never removed, per §8 two-step drops).

BEGIN;

DROP TRIGGER IF EXISTS trg_audit_event_expenses ON public.event_expenses;

ALTER TABLE public.event_expenses
  DROP COLUMN IF EXISTS actual_amount,
  DROP COLUMN IF EXISTS projected_amount;

COMMIT;
