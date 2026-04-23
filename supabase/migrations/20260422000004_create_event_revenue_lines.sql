-- Create event_revenue_lines + revenue_line_types (Path B — reference table).
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
-- Path B (chosen 2026-04-22 after Andrew's NOC-34 review): categories
-- live in a `revenue_line_types` reference table instead of a Postgres
-- enum. Rationale:
--   - Adding a new category is an INSERT, not an ALTER TYPE + deploy.
--   - Per-collective custom categories become possible without further
--     schema work (rows with collective_id = NULL are platform defaults,
--     rows with collective_id set are that collective's custom types).
--   - `code` column supports accounting codes (4200, 4300, ...) for
--     future financial exports without a schema change.
--   - Same shape will be reused for expense_line_types in a follow-up
--     ticket, so event_expenses.category can move to the same pattern.
--
-- Scope note: this PR ships the data layer only. UI for collectives to
-- manage custom types is deferred to a Phase-2 ticket. Seeded platform
-- defaults cover every revenue stream Andrew flagged plus the common
-- nightlife cases (coat check, VIP tables, food, streaming, merch,
-- door cash).
--
-- Governance:
--   §1  Config tier (operator-facing offerings, mutable until
--       transactional rows reference them)
--   §2  Q4 — parent events has many revenue lines → new table with FK
--   §4  Bar shortfall computed server-side:
--       MAX(0, events.bar_minimum - SUM(actual_amount) WHERE type.code = 'BAR_SHARE')
--       Never stored.
--   §7  new-table checklist: tier comments, RLS, created_at defaults,
--       indexes on every FK, rollback committed alongside.
--   §8  Two-step drops respected: no column is being dropped here.
--
-- Linear: NOC-34

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- Reference table: revenue_line_types
-- Tier: config. Platform defaults (collective_id = NULL) are seeded
-- below. Collectives can add their own rows later via a settings UI.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE public.revenue_line_types (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT NOT NULL,
  label          TEXT NOT NULL,
  group_name     TEXT,
  collective_id  UUID REFERENCES public.collectives(id) ON DELETE CASCADE,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  sort_order     INTEGER NOT NULL DEFAULT 100,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- `code` must be unique per scope: platform defaults share one
  -- namespace (collective_id IS NULL) and each collective has its own
  -- namespace for custom types.
  UNIQUE (collective_id, code)
);

COMMENT ON TABLE public.revenue_line_types IS
  'Config tier — revenue-category reference table. collective_id IS NULL = platform default (readable by all). collective_id set = that collective''s custom type (scoped).';

COMMENT ON COLUMN public.revenue_line_types.code IS
  'Stable machine identifier (e.g. BAR_SHARE, SPONSORSHIP, 4200). Used by app code and future accounting exports.';

COMMENT ON COLUMN public.revenue_line_types.group_name IS
  'Optional grouping: venue_revenue, ancillary, ticketing. Drives UI sectioning; not enforced.';

CREATE INDEX idx_revenue_line_types_collective_id
  ON public.revenue_line_types(collective_id);

CREATE INDEX idx_revenue_line_types_active
  ON public.revenue_line_types(is_active)
  WHERE is_active = true;

ALTER TABLE public.revenue_line_types ENABLE ROW LEVEL SECURITY;

-- Platform defaults are readable by any authenticated user; custom rows
-- are readable only by members of the owning collective.
CREATE POLICY "revenue_line_types_select" ON public.revenue_line_types
  FOR SELECT USING (
    collective_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.collective_members cm
      WHERE cm.collective_id = revenue_line_types.collective_id
        AND cm.user_id = auth.uid()
        AND cm.deleted_at IS NULL
    )
  );

-- Only members can create custom types for their own collective.
-- Platform defaults (collective_id IS NULL) are seed-only: we disallow
-- user-driven INSERTs of NULL-scoped rows.
CREATE POLICY "revenue_line_types_insert" ON public.revenue_line_types
  FOR INSERT WITH CHECK (
    collective_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.collective_members cm
      WHERE cm.collective_id = revenue_line_types.collective_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
        AND cm.deleted_at IS NULL
    )
  );

CREATE POLICY "revenue_line_types_update" ON public.revenue_line_types
  FOR UPDATE USING (
    collective_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.collective_members cm
      WHERE cm.collective_id = revenue_line_types.collective_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
        AND cm.deleted_at IS NULL
    )
  );

CREATE POLICY "revenue_line_types_delete" ON public.revenue_line_types
  FOR DELETE USING (
    collective_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.collective_members cm
      WHERE cm.collective_id = revenue_line_types.collective_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
        AND cm.deleted_at IS NULL
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- Seed: platform defaults (collective_id IS NULL)
-- Covers Andrew's four (bar_share, sponsorship, door_cash, merchandise)
-- plus the nightlife cases he flagged were missing (coat_check,
-- vip_table, food, streaming). Codes follow an accounting-style
-- convention so future exports can map to a chart of accounts
-- without a schema change.
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO public.revenue_line_types (code, label, group_name, sort_order) VALUES
  ('TICKET_SALES',  'Ticket sales',  'ticketing',       10),
  ('DOOR_CASH',     'Door cash',     'ticketing',       20),
  ('BAR_SHARE',     'Bar share',     'venue_revenue',   30),
  ('COAT_CHECK',    'Coat check',    'venue_revenue',   40),
  ('VIP_TABLE',     'VIP / bottle',  'venue_revenue',   50),
  ('FOOD',          'Food',          'venue_revenue',   60),
  ('SPONSORSHIP',   'Sponsorship',   'ancillary',       70),
  ('MERCHANDISE',   'Merchandise',   'ancillary',       80),
  ('STREAMING',     'Streaming',     'ancillary',       90),
  ('OTHER',         'Other',         'ancillary',      100);

-- ─────────────────────────────────────────────────────────────────────
-- Main table: event_revenue_lines
-- Tier: config (mutable until settlement).
-- References revenue_line_types instead of carrying an enum.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE public.event_revenue_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  revenue_type_id   UUID NOT NULL REFERENCES public.revenue_line_types(id) ON DELETE RESTRICT,
  description       TEXT,
  projected_amount  NUMERIC(10,2),
  actual_amount     NUMERIC(10,2),
  created_by        UUID REFERENCES public.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.event_revenue_lines IS
  'Config tier — revenue-side counterpart to event_expenses. Operator sets projected at planning; fills actual post-event. Frozen after settlement completes. Category shape lives in revenue_line_types (Path B, NOC-34).';

COMMENT ON COLUMN public.event_revenue_lines.revenue_type_id IS
  'FK to revenue_line_types. ON DELETE RESTRICT — a type in use cannot be deleted; collectives must deactivate (is_active=false) instead.';

CREATE INDEX idx_event_revenue_lines_event_id
  ON public.event_revenue_lines(event_id);

CREATE INDEX idx_event_revenue_lines_revenue_type_id
  ON public.event_revenue_lines(revenue_type_id);

ALTER TABLE public.event_revenue_lines ENABLE ROW LEVEL SECURITY;

-- RLS: mirror event_expenses — collective members on the event's collective.
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

-- ─────────────────────────────────────────────────────────────────────
-- Audit trail: financial edits (INSERT/UPDATE/DELETE on actual_amount or
-- projected_amount) write to audit_logs via the existing trigger
-- function. Required by Andrew's review — financial edits after the
-- event must be traceable.
-- ─────────────────────────────────────────────────────────────────────

CREATE TRIGGER trg_audit_event_revenue_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.event_revenue_lines
  FOR EACH ROW EXECUTE FUNCTION public.audit_financial_change();

COMMIT;
