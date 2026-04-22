-- ⚠ DRAFT MIGRATION PROPOSAL — DO NOT APPLY AS-IS
-- NOC-24: Where do bar_minimum + actual_bar_revenue live post-#93?
--
-- PR #93 dropped events.bar_minimum + events.actual_bar_revenue. The UI
-- inputs are currently gated to a "paused" notice (PR #106). This file
-- proposes 3 shapes for restoration. Andrew picks one, deletes the other
-- two option blocks, fills out the picked block, adds the paired rollback,
-- and applies to QA.
--
-- Full § 2 walk + rationale: Linear NOC-24.
-- Governance checks on final migration:
--   § 7 new-column checklist if editing events
--   § 7 new-table checklist if creating event_bar_settings
--   § 9 naming (NUMERIC(10,2), _at suffix on any timestamps)

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- OPTION 1 — Revert columns to events (§ 2 Q6: simplest restore)
-- ─────────────────────────────────────────────────────────────────────
-- ALTER TABLE public.events
--   ADD COLUMN IF NOT EXISTS bar_minimum       NUMERIC(10,2),
--   ADD COLUMN IF NOT EXISTS actual_bar_revenue NUMERIC(10,2);

-- ─────────────────────────────────────────────────────────────────────
-- OPTION 2 — Sibling table event_bar_settings (keeps events lean)
-- ─────────────────────────────────────────────────────────────────────
-- -- TIER: config (one row per event with bar tracking; mutable until
-- -- settlement)
-- CREATE TABLE IF NOT EXISTS public.event_bar_settings (
--   event_id           UUID PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
--   bar_minimum        NUMERIC(10,2),
--   actual_bar_revenue NUMERIC(10,2),
--   created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
--   updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
-- );
-- ALTER TABLE public.event_bar_settings ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "ebs_select" ON public.event_bar_settings FOR SELECT TO authenticated
--   USING (event_id IN (SELECT id FROM public.events WHERE collective_id IN (SELECT get_user_collectives())));
-- CREATE POLICY "ebs_service_role" ON public.event_bar_settings FOR ALL TO service_role
--   USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- OPTION 3 — Roll into event_expenses as line items (§ 2 Q1)
-- ─────────────────────────────────────────────────────────────────────
-- No schema change. `updateEventBarSettings` becomes two `addExpense`-
-- flavored calls with category='bar_minimum' and category='bar_actual'.
-- The barShortfall computation already feeds expense totals. No migration
-- file needed — just gut updateEventBarSettings() server-side.

COMMIT;
