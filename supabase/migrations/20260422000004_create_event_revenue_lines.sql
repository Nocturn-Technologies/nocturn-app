-- Create event_revenue_lines table.
--
-- Per Andrew's NOC-24 review:
--   "actual_bar_revenue is a financial outcome. It's not an expense.
--   It's not really the collective's revenue either unless there's a
--   bar share agreement. Putting it on the events table or in
--   event_expenses is us making up a place for it because we don't
--   have the right place yet.
--
--   The right place is an event_revenue_lines table -- a revenue-side
--   equivalent of event_expenses. Categories like bar share,
--   sponsorship, door cash, merchandise. Each line has a projected
--   amount and an actual amount."
--
-- Categories are exactly Andrew's four — no 'other' catch-all.
-- Safe to add later via ALTER TYPE ADD VALUE if operators hit a case.
--
-- Governance:
--   §1  Config tier (operator sets projected; fills actual; frozen after
--       settlement)
--   §2  Q4 — parent events has many revenue lines → new table with FK
--   §4  Bar shortfall computed server-side:
--       MAX(0, events.bar_minimum - SUM(bar_share actual_amount))
--       Never stored.
--   §7  new-table checklist: tier comment, RLS, created_at default, FK
--       index, enum for category, rollback
--
-- Linear: NOC-34

BEGIN;

-- Tier: Config — revenue-side counterpart to event_expenses
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

COMMIT;
