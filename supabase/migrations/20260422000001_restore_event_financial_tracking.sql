-- Restore event financial tracking surface area.
--
-- Per Andrew's NOC-24 review, rolls 3 migrations into one:
--   1. events.bar_minimum — venue contract term (config on events)
--   2. event_revenue_lines — revenue-side counterpart to event_expenses
--   3. event_expenses.projected_amount — budget-vs-actual split on costs
--
-- Governance references:
--   §1  all three surfaces are Config tier
--   §2  Q6 (setting on existing config table) + Q4 (parent events has many lines)
--   §4  bar shortfall = MAX(0, events.bar_minimum - SUM(bar_share actual))
--        — computed server-side, never stored
--   §7  new-table checklist applies to event_revenue_lines
--   §8  all 3 migrations in one file + rollback, QA first
--
-- Linear: NOC-34

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. events.bar_minimum — venue contract minimum (config)
--    Restored per Andrew: "belongs on the event, same as capacity"
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.events
  ADD COLUMN bar_minimum NUMERIC(10,2);

COMMENT ON COLUMN public.events.bar_minimum IS
  'Venue contract minimum bar revenue. If actual bar_share total falls short, shortfall is a venue penalty computed at settlement. Never store the shortfall itself.';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. event_revenue_lines — revenue-side counterpart to event_expenses
--    Categories per Andrew: bar_share / sponsorship / door_cash / merchandise
-- ═══════════════════════════════════════════════════════════════════════

CREATE TYPE revenue_line_category AS ENUM (
  'bar_share',
  'sponsorship',
  'door_cash',
  'merchandise'
);

CREATE TABLE public.event_revenue_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  category          revenue_line_category NOT NULL,
  description       TEXT,
  projected_amount  NUMERIC(10,2),
  actual_amount     NUMERIC(10,2),
  created_by        UUID REFERENCES public.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.event_revenue_lines IS
  'Config tier — revenue-side counterpart to event_expenses. Operator sets projected at planning; fills actual post-event. Frozen after settlement completes.';

CREATE INDEX idx_event_revenue_lines_event_id
  ON public.event_revenue_lines(event_id);

ALTER TABLE public.event_revenue_lines ENABLE ROW LEVEL SECURITY;

-- RLS: mirror event_expenses — collective members on the event's collective
CREATE POLICY "event_revenue_lines_select" ON public.event_revenue_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.collective_members cm ON cm.collective_id = e.collective_id
      WHERE e.id = event_revenue_lines.event_id
        AND cm.user_id = auth.uid()
        AND cm.deleted_at IS NULL
    )
  );

CREATE POLICY "event_revenue_lines_insert" ON public.event_revenue_lines
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.collective_members cm ON cm.collective_id = e.collective_id
      WHERE e.id = event_revenue_lines.event_id
        AND cm.user_id = auth.uid()
        AND cm.deleted_at IS NULL
    )
  );

CREATE POLICY "event_revenue_lines_update" ON public.event_revenue_lines
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.collective_members cm ON cm.collective_id = e.collective_id
      WHERE e.id = event_revenue_lines.event_id
        AND cm.user_id = auth.uid()
        AND cm.deleted_at IS NULL
    )
  );

CREATE POLICY "event_revenue_lines_delete" ON public.event_revenue_lines
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.collective_members cm ON cm.collective_id = e.collective_id
      WHERE e.id = event_revenue_lines.event_id
        AND cm.user_id = auth.uid()
        AND cm.deleted_at IS NULL
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
-- 3. event_expenses.projected_amount — budget-vs-actual split on costs
--    Per Andrew: "event_expenses has no projected vs actual split ... a gap"
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.event_expenses
  ADD COLUMN projected_amount NUMERIC(10,2);

COMMENT ON COLUMN public.event_expenses.projected_amount IS
  'Planned budget for this expense line. Nullable for legacy rows (pre-NOC-34) — display as "—" in UI when null. `amount` column remains the actual spend.';

COMMIT;
