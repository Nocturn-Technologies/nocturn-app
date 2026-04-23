-- NOC-35 — symmetrical financial columns on event_expenses.
--
-- Per Andrew's NOC-35 review:
--   "The problem isn't adding `projected_amount` — we do need that. The
--   problem is leaving `amount` alongside it. You'd end up with
--   asymmetric columns that mean different things.
--
--   event_revenue_lines already has the right pattern. event_expenses
--   needs to match it. The fix is to rename `amount` → `actual_amount`
--   as part of this ticket, not add around it."
--
-- Per §8 governance (two-step drops — never drop a column in the same
-- migration that adds its replacement), the "rename" is done in three
-- phases across two tickets:
--
--   Phase A (this PR, NOC-35):
--     1. ADD actual_amount NUMERIC(10,2) NULL
--     2. ADD projected_amount NUMERIC(10,2) NULL
--     3. BACKFILL: UPDATE event_expenses SET actual_amount = amount
--     4. Wire audit_financial_change trigger
--     5. App code writes BOTH amount + actual_amount (keeps legacy
--        readers working) and reads actual_amount with fallback to
--        amount (handles any race during deploy).
--
--   Phase B (follow-up, separate ticket after this lands on prod):
--     1. Confirm no code reads `amount` directly (grep + Sentry search)
--     2. Drop `amount` column
--     3. Drop the dual-write in app code
--
-- Category enum conversion is explicitly NOT in this ticket. It's
-- blocked on NOC-34 Path B (revenue_line_types reference table, shipped
-- in PR #123). Once that merges, a sibling ticket creates
-- `expense_line_types` and converts `event_expenses.category TEXT` to
-- `expense_type_id UUID` via the same pattern. Trying to add an enum
-- here would just get undone when we pick up that ticket.
--
-- Governance:
--   §1  Config tier (operator-facing offerings, mutable until
--       transactional rows reference them — though settlement freezes
--       them in practice)
--   §2  Q6 — setting on existing config table → new columns
--   §4  Variance (projected vs actual) computed server-side, not stored
--   §7  Audit trigger added (financial edits must be traceable)
--   §8  Two-step drop respected — amount stays in this migration
--
-- Linear: NOC-35

BEGIN;

ALTER TABLE public.event_expenses
  ADD COLUMN actual_amount    NUMERIC(10,2),
  ADD COLUMN projected_amount NUMERIC(10,2);

COMMENT ON COLUMN public.event_expenses.actual_amount IS
  'Actual spend, symmetric with event_revenue_lines.actual_amount. Will replace `amount` after Phase B follow-up ticket confirms no readers remain on the old column.';

COMMENT ON COLUMN public.event_expenses.projected_amount IS
  'Planned budget for this expense line. Nullable for legacy rows (pre-NOC-35) — display as "—" in UI when null.';

-- Backfill: every existing row gets actual_amount = amount. QA has live
-- demo data (seeded 2026-04-22 for pitch walk-throughs); this keeps the
-- demo financials intact when code flips to reading actual_amount.
UPDATE public.event_expenses
   SET actual_amount = amount
 WHERE actual_amount IS NULL;

-- Audit trail: financial edits on event_expenses must be traceable,
-- same as event_revenue_lines in NOC-34. Attaches existing
-- audit_financial_change() trigger function.
CREATE TRIGGER trg_audit_event_expenses
  AFTER INSERT OR UPDATE OR DELETE ON public.event_expenses
  FOR EACH ROW EXECUTE FUNCTION public.audit_financial_change();

COMMIT;
