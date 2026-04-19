-- Door Sales v1
-- Enables door staff to sell tickets from the scanner phone:
--   1. Card (buyer scans a QR on staff's phone, pays on buyer's phone via Stripe Checkout)
--   2. Cash (staff marks ticket paid, no Stripe, owed to operator at reconciliation)
--   3. Comp (staff issues a free ticket, requires a reason, logged)
--
-- No Nocturn fee on cash or comp. Cash sales are the operator's tax responsibility.
-- Single-use signed tokens (via door_buy_tokens) prevent QR screenshot replay.
-- Every action writes an append-only row to door_events for reconciliation + audit.

-- ── door_buy_tokens ────────────────────────────────────────────────
-- Single-use tokens minted by staff. The QR rendered on staff's phone
-- points to /door-buy/{nonce}. Checkout consumes the nonce atomically.
CREATE TABLE IF NOT EXISTS door_buy_tokens (
  nonce text PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tier_id uuid NOT NULL REFERENCES ticket_tiers(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 4),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_ticket_ids uuid[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_door_buy_tokens_event ON door_buy_tokens(event_id);
CREATE INDEX idx_door_buy_tokens_expires ON door_buy_tokens(expires_at) WHERE consumed_at IS NULL;

-- ── door_events ────────────────────────────────────────────────────
-- Append-only audit spine. One row per door action (sale / comp / void
-- / capacity_override). Reconciliation views read from here.
CREATE TABLE IF NOT EXISTS door_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  collective_id uuid NOT NULL REFERENCES collectives(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ticket_id uuid REFERENCES tickets(id) ON DELETE SET NULL,
  tier_id uuid REFERENCES ticket_tiers(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN (
    'sale_card',        -- buyer paid via Stripe from door QR
    'sale_cash',        -- staff took cash, marked paid
    'sale_comp',        -- staff comped a ticket
    'void',             -- staff voided a door sale within 5 min
    'capacity_override' -- sale went through past tier.capacity
  )),
  payment_method text CHECK (payment_method IN ('card', 'cash', 'comp')),
  quantity integer NOT NULL DEFAULT 1,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  reason text,
  buyer_email text,
  buyer_phone text,
  over_capacity boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_door_events_event ON door_events(event_id, created_at DESC);
CREATE INDEX idx_door_events_staff ON door_events(event_id, staff_user_id);
CREATE INDEX idx_door_events_action ON door_events(event_id, action);
CREATE INDEX idx_door_events_ticket ON door_events(ticket_id) WHERE ticket_id IS NOT NULL;

-- ── RLS ────────────────────────────────────────────────────────────
-- Tables are written exclusively via server actions using the admin
-- client (which bypasses RLS). Policies below allow authenticated
-- collective members to SELECT their own collective's rows — the
-- reconciliation widget on the scanner page reads via these.

ALTER TABLE door_buy_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE door_events ENABLE ROW LEVEL SECURITY;

-- Collective members can read their own door_events
CREATE POLICY "door_events_select_collective_members"
  ON door_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM collective_members cm
      WHERE cm.collective_id = door_events.collective_id
        AND cm.user_id = auth.uid()
        AND cm.deleted_at IS NULL
    )
  );

-- Staff can read their own minted tokens (for in-flight QR flows)
CREATE POLICY "door_buy_tokens_select_staff"
  ON door_buy_tokens FOR SELECT
  USING (staff_user_id = auth.uid());

-- ── door_buy_token consume RPC ─────────────────────────────────────
-- Atomic single-use consumption. Returns the token row if it was won,
-- null otherwise. Prevents QR screenshot replay — only the first
-- checkout to call this wins; all others see token already consumed.
CREATE OR REPLACE FUNCTION consume_door_buy_token(
  p_nonce text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row door_buy_tokens%ROWTYPE;
BEGIN
  UPDATE door_buy_tokens
     SET consumed_at = now()
   WHERE nonce = p_nonce
     AND consumed_at IS NULL
     AND expires_at > now()
   RETURNING * INTO v_row;

  IF v_row.nonce IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired link');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', v_row.event_id,
    'tier_id', v_row.tier_id,
    'staff_user_id', v_row.staff_user_id,
    'quantity', v_row.quantity
  );
END;
$$;

-- ── door_sale_summary view ─────────────────────────────────────────
-- Aggregate totals per event for the live reconciliation widget.
-- Card sales are logged at Stripe session creation (with the pending
-- ticket's id). If the buyer abandons checkout, payment_intent.failed
-- deletes the pending ticket, which SET NULLs door_events.ticket_id
-- via FK — so `ticket_id IS NOT NULL` gives us true paid card sales.
CREATE OR REPLACE VIEW door_sale_summary AS
SELECT
  event_id,
  count(*) FILTER (WHERE action = 'sale_card' AND ticket_id IS NOT NULL)   AS card_count,
  coalesce(sum(amount_cents) FILTER (WHERE action = 'sale_card' AND ticket_id IS NOT NULL), 0) AS card_cents,
  count(*) FILTER (WHERE action = 'sale_cash')   AS cash_count,
  coalesce(sum(amount_cents) FILTER (WHERE action = 'sale_cash'), 0) AS cash_cents,
  count(*) FILTER (WHERE action = 'sale_comp')   AS comp_count,
  count(*) FILTER (WHERE action = 'void')        AS void_count,
  count(*) FILTER (WHERE over_capacity)          AS over_capacity_count
FROM door_events
GROUP BY event_id;
