-- Migration: Atomic analytics RPCs, invitations RLS fix, missing index, atomic fulfillment
-- Created: 2026-03-29

-- ============================================================================
-- 1. ATOMIC ANALYTICS INCREMENT RPCs
-- ============================================================================

-- Atomic increment for event_analytics counters
-- Column name is whitelisted to prevent SQL injection via dynamic column name
CREATE OR REPLACE FUNCTION increment_analytics_counter(
  p_event_id UUID,
  p_column TEXT,
  p_value NUMERIC DEFAULT 1
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Whitelist allowed column names to prevent SQL injection
  IF p_column NOT IN ('page_views', 'checkout_starts', 'checkout_completions', 'tickets_sold', 'tickets_refunded', 'gross_revenue', 'net_revenue') THEN
    RAISE EXCEPTION 'Invalid column name: %', p_column;
  END IF;

  -- Ensure row exists
  INSERT INTO event_analytics (event_id, updated_at)
  VALUES (p_event_id, NOW())
  ON CONFLICT (event_id) DO NOTHING;

  -- Atomic increment using dynamic SQL (column name is whitelisted above)
  EXECUTE format(
    'UPDATE event_analytics SET %I = COALESCE(%I, 0) + $1, updated_at = NOW() WHERE event_id = $2',
    p_column, p_column
  ) USING p_value, p_event_id;
END;
$$;

-- Atomic update for ticket sale analytics (multiple fields at once)
CREATE OR REPLACE FUNCTION track_ticket_sale(
  p_event_id UUID,
  p_quantity INTEGER,
  p_revenue NUMERIC
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_nocturn_fee NUMERIC;
  v_total_capacity INTEGER;
  v_new_sold INTEGER;
  v_new_gross NUMERIC;
  v_new_net NUMERIC;
  v_new_completions INTEGER;
  v_checkout_starts INTEGER;
BEGIN
  v_nocturn_fee := p_revenue * 0.07 + p_quantity * 0.50;

  -- Ensure row exists
  INSERT INTO event_analytics (event_id, updated_at)
  VALUES (p_event_id, NOW())
  ON CONFLICT (event_id) DO NOTHING;

  -- Atomic update
  UPDATE event_analytics SET
    tickets_sold = COALESCE(tickets_sold, 0) + p_quantity,
    gross_revenue = COALESCE(gross_revenue, 0) + p_revenue,
    net_revenue = GREATEST(0, COALESCE(net_revenue, 0) + (p_revenue - v_nocturn_fee)),
    checkout_completions = COALESCE(checkout_completions, 0) + 1,
    updated_at = NOW()
  WHERE event_id = p_event_id
  RETURNING tickets_sold, gross_revenue, checkout_completions, COALESCE(checkout_starts, 0)
  INTO v_new_sold, v_new_gross, v_new_completions, v_checkout_starts;

  -- Get total capacity for percentage calculation
  SELECT COALESCE(SUM(capacity), 0) INTO v_total_capacity
  FROM ticket_tiers WHERE event_id = p_event_id;

  -- Update derived fields
  UPDATE event_analytics SET
    avg_ticket_price = CASE WHEN v_new_sold > 0 THEN v_new_gross / v_new_sold ELSE 0 END,
    conversion_rate = CASE WHEN v_checkout_starts > 0 THEN LEAST(100, (v_new_completions::NUMERIC / v_checkout_starts) * 100) ELSE 0 END,
    capacity_percentage = CASE WHEN v_total_capacity > 0 THEN LEAST(100, (v_new_sold::NUMERIC / v_total_capacity) * 100) ELSE 0 END
  WHERE event_id = p_event_id;
END;
$$;

-- Atomic track ticket refund
CREATE OR REPLACE FUNCTION track_ticket_refund(
  p_event_id UUID,
  p_quantity INTEGER,
  p_amount NUMERIC
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_nocturn_fee NUMERIC;
  v_new_sold INTEGER;
  v_new_gross NUMERIC;
BEGIN
  v_nocturn_fee := p_amount * 0.07 + p_quantity * 0.50;

  -- Ensure row exists
  INSERT INTO event_analytics (event_id, updated_at)
  VALUES (p_event_id, NOW())
  ON CONFLICT (event_id) DO NOTHING;

  UPDATE event_analytics SET
    tickets_sold = GREATEST(0, COALESCE(tickets_sold, 0) - p_quantity),
    tickets_refunded = COALESCE(tickets_refunded, 0) + p_quantity,
    gross_revenue = GREATEST(0, COALESCE(gross_revenue, 0) - p_amount),
    net_revenue = GREATEST(0, COALESCE(net_revenue, 0) - (p_amount - v_nocturn_fee)),
    updated_at = NOW()
  WHERE event_id = p_event_id
  RETURNING tickets_sold, gross_revenue
  INTO v_new_sold, v_new_gross;

  UPDATE event_analytics SET
    avg_ticket_price = CASE WHEN v_new_sold > 0 THEN v_new_gross / v_new_sold ELSE 0 END
  WHERE event_id = p_event_id;
END;
$$;

-- ============================================================================
-- 2. FIX INVITATIONS RLS
-- ============================================================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Allow all for authenticated" ON invitations;

-- Collective admins can manage invitations for their collectives
CREATE POLICY "Collective admins can manage invitations"
ON invitations FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM collective_members
    WHERE collective_members.collective_id = invitations.collective_id
    AND collective_members.user_id = auth.uid()
    AND collective_members.deleted_at IS NULL
    AND collective_members.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM collective_members
    WHERE collective_members.collective_id = invitations.collective_id
    AND collective_members.user_id = auth.uid()
    AND collective_members.deleted_at IS NULL
    AND collective_members.role IN ('owner', 'admin')
  )
);

-- Invitees can read their own invitation (by token lookup via service role, but this allows email-based)
CREATE POLICY "Users can read invitations sent to them"
ON invitations FOR SELECT
TO authenticated
USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- ============================================================================
-- 3. ADD MISSING INDEX ON tickets.ticket_tier_id
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tickets_tier_id ON tickets (ticket_tier_id);

-- ============================================================================
-- 4. ATOMIC FULFILLMENT FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION fulfill_tickets_atomic(
  p_payment_intent_id TEXT,
  p_event_id UUID,
  p_tier_id UUID,
  p_quantity INTEGER,
  p_price_paid NUMERIC,
  p_currency TEXT,
  p_buyer_email TEXT DEFAULT NULL,
  p_referrer_token UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS TABLE(id UUID, ticket_token UUID)
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_count INTEGER;
BEGIN
  -- Acquire advisory lock on payment intent hash (prevents concurrent fulfillment)
  PERFORM pg_advisory_xact_lock(hashtext(p_payment_intent_id));

  -- Idempotency check within the lock
  SELECT COUNT(*) INTO v_existing_count
  FROM tickets
  WHERE stripe_payment_intent_id = p_payment_intent_id;

  IF v_existing_count > 0 THEN
    -- Already fulfilled — return existing tickets
    RETURN QUERY
    SELECT t.id, t.ticket_token
    FROM tickets t
    WHERE t.stripe_payment_intent_id = p_payment_intent_id;
    RETURN;
  END IF;

  -- Insert tickets
  RETURN QUERY
  INSERT INTO tickets (
    event_id, ticket_tier_id, user_id, status, price_paid, currency,
    stripe_payment_intent_id, ticket_token, referred_by, metadata
  )
  SELECT
    p_event_id, p_tier_id, NULL, 'paid', p_price_paid, p_currency,
    p_payment_intent_id, gen_random_uuid(), p_referrer_token, p_metadata
  FROM generate_series(1, p_quantity)
  RETURNING tickets.id, tickets.ticket_token;
END;
$$;

-- ============================================================================
-- 4b. CLAIM PROMO CODE (quantity-aware, replaces increment_promo_uses)
-- ============================================================================

-- Atomically increment promo code current_uses by the given quantity.
-- Returns the updated promo code row. Raises exception if max_uses exceeded.
CREATE OR REPLACE FUNCTION claim_promo_code(
  p_code_id UUID,
  p_quantity INTEGER DEFAULT 1
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_max_uses INTEGER;
  v_current_uses INTEGER;
BEGIN
  -- Lock the row to prevent concurrent over-claiming
  SELECT max_uses, COALESCE(current_uses, 0)
  INTO v_max_uses, v_current_uses
  FROM promo_codes
  WHERE id = p_code_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promo code not found: %', p_code_id;
  END IF;

  -- Check capacity (null max_uses = unlimited)
  IF v_max_uses IS NOT NULL AND (v_current_uses + p_quantity) > v_max_uses THEN
    RAISE EXCEPTION 'Promo code capacity exceeded (current: %, max: %, requested: %)',
      v_current_uses, v_max_uses, p_quantity;
  END IF;

  UPDATE promo_codes
  SET current_uses = COALESCE(current_uses, 0) + p_quantity
  WHERE id = p_code_id;
END;
$$;

-- ============================================================================
-- 5. RATE LIMITS TABLE (persistent across serverless cold starts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key_created ON rate_limits (key, created_at);

-- ============================================================================
-- 6. ADD MISSING COLUMNS TO EXISTING TABLES (idempotent)
-- ============================================================================

-- tickets: ensure qr_code and attendee_name columns exist
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS qr_code TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS attendee_name TEXT;

-- tickets: ensure user_id is nullable (for guest purchases)
ALTER TABLE tickets ALTER COLUMN user_id DROP NOT NULL;

-- collectives: ensure stripe_account_id column exists (for Stripe Connect)
ALTER TABLE collectives ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;
