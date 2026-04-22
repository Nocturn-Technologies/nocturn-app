-- Add event_expenses.projected_amount column.
--
-- Per Andrew's NOC-24 side note: "event_expenses also has no projected
-- vs actual split. It has one amount and an is_paid flag. That means
-- we can't show budget vs reality on expenses either, which is a gap
-- in the financial dashboard."
--
-- Governance:
--   §1  Config tier
--   §2  Q6 — setting on existing config table → new column
--   §8  additive, backward-compatible, rollback included
--
-- Column semantics:
--   amount            — actual spend (existing, unchanged)
--   projected_amount  — planned budget, nullable for legacy rows
--
-- Linear: NOC-35

BEGIN;

ALTER TABLE public.event_expenses
  ADD COLUMN projected_amount NUMERIC(10,2);

COMMENT ON COLUMN public.event_expenses.projected_amount IS
  'Planned budget for this expense line. Nullable for legacy rows (pre-NOC-35) — display as "—" in UI when null. `amount` column remains the actual spend.';

COMMIT;
