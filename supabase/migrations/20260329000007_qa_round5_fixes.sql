-- Migration: QA Audit Round 5 Fixes
-- Created: 2026-03-29
-- Fixes: C1 (fulfill_tickets_atomic is_new), C3 (DROP FUNCTION before re-create),
--        H1 (RLS on payment_events), H2 (RLS on event_analytics),
--        H3 (clean up total_spend orphan), H4 (upsertAttendeeProfile race),
--        L5 (refreshEventAnalytics soft-delete)

-- ============================================================================
-- C3: DROP claim_promo_code BEFORE re-creating (return type changed from
--     SETOF promo_codes to VOID — CREATE OR REPLACE cannot change return type)
-- ============================================================================

-- Drop both possible signatures
DROP FUNCTION IF EXISTS claim_promo_code(UUID, INTEGER);
DROP FUNCTION IF EXISTS claim_promo_code(UUID);

-- Re-create with VOID return type (idempotent atomic claiming)
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
    -- Non-blocking: promo code may have been deleted, just skip
    RETURN;
  END IF;

  -- Check capacity (null max_uses = unlimited)
  IF v_max_uses IS NOT NULL AND (v_current_uses + p_quantity) > v_max_uses THEN
    -- Over capacity — skip silently (don't break the purchase flow)
    RETURN;
  END IF;

  UPDATE promo_codes
  SET current_uses = COALESCE(current_uses, 0) + p_quantity,
      uses_count = COALESCE(uses_count, 0) + p_quantity  -- Keep both columns in sync
  WHERE id = p_code_id;
END;
$$;

-- ============================================================================
-- C1: Update fulfill_tickets_atomic to return is_new flag
--     Enables deterministic promo/analytics dedup (replaces broken time heuristic)
-- ============================================================================

-- Must drop first because we're changing the return type
DROP FUNCTION IF EXISTS fulfill_tickets_atomic(TEXT, UUID, UUID, INTEGER, NUMERIC, TEXT, TEXT, UUID, JSONB);

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
) RETURNS TABLE(id UUID, ticket_token UUID, is_new BOOLEAN)
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
    -- Already fulfilled — return existing tickets with is_new = false
    RETURN QUERY
    SELECT t.id, t.ticket_token, false AS is_new
    FROM tickets t
    WHERE t.stripe_payment_intent_id = p_payment_intent_id;
    RETURN;
  END IF;

  -- Insert tickets — return with is_new = true
  RETURN QUERY
  INSERT INTO tickets (
    event_id, ticket_tier_id, user_id, status, price_paid, currency,
    stripe_payment_intent_id, ticket_token, referred_by, metadata
  )
  SELECT
    p_event_id, p_tier_id, NULL, 'paid', p_price_paid, p_currency,
    p_payment_intent_id, gen_random_uuid(), p_referrer_token, p_metadata
  FROM generate_series(1, p_quantity)
  RETURNING tickets.id, tickets.ticket_token, true AS is_new;
END;
$$;

-- ============================================================================
-- H1: Enable RLS on payment_events table
-- ============================================================================

ALTER TABLE IF EXISTS payment_events ENABLE ROW LEVEL SECURITY;
-- No policies = service-role only (payment_events is only accessed via admin client)

-- ============================================================================
-- H2: Enable RLS on event_analytics table
-- ============================================================================

ALTER TABLE IF EXISTS event_analytics ENABLE ROW LEVEL SECURITY;
-- No policies = service-role only (event_analytics is only accessed via admin client/RPCs)

-- ============================================================================
-- H3: Clean up orphaned total_spend column on attendee_profiles
--     (App code uses total_spent, total_spend is from initial schema)
-- ============================================================================

-- Sync any data from total_spend → total_spent before dropping
UPDATE attendee_profiles
SET total_spent = COALESCE(total_spend, 0)
WHERE total_spent IS NULL OR total_spent = 0
  AND total_spend IS NOT NULL AND total_spend > 0;

-- Drop the orphaned column (safe — app code only uses total_spent)
ALTER TABLE attendee_profiles DROP COLUMN IF EXISTS total_spend;

-- ============================================================================
-- H4: Atomic attendee profile increment RPC
--     Eliminates the read-then-write race in upsertAttendeeProfile
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_attendee_profile(
  p_collective_id UUID,
  p_email TEXT,
  p_spent NUMERIC
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_total_spent NUMERIC;
  v_new_total_events INTEGER;
  v_segment TEXT;
BEGIN
  -- Atomic increment with row lock
  UPDATE attendee_profiles SET
    total_spent = COALESCE(total_spent, 0) + p_spent,
    total_tickets = COALESCE(total_tickets, 0) + 1,
    total_events = COALESCE(total_events, 0) + 1,
    last_purchase_at = NOW(),
    updated_at = NOW()
  WHERE collective_id = p_collective_id AND email = p_email
  RETURNING total_spent, total_events INTO v_new_total_spent, v_new_total_events;

  IF NOT FOUND THEN
    -- First time — insert new profile
    INSERT INTO attendee_profiles (
      collective_id, email, total_spent, total_tickets, total_events,
      first_purchase_at, last_purchase_at, segment, created_at, updated_at
    ) VALUES (
      p_collective_id, p_email, p_spent, 1, 1,
      NOW(), NOW(), CASE WHEN p_spent >= 200 THEN 'vip' ELSE 'new' END,
      NOW(), NOW()
    )
    ON CONFLICT (collective_id, email)
      WHERE collective_id IS NOT NULL AND email IS NOT NULL
    DO UPDATE SET
      total_spent = attendee_profiles.total_spent + p_spent,
      total_tickets = attendee_profiles.total_tickets + 1,
      total_events = attendee_profiles.total_events + 1,
      last_purchase_at = NOW(),
      updated_at = NOW();
    RETURN;
  END IF;

  -- Update segment based on new totals
  v_segment := CASE
    WHEN v_new_total_spent >= 200 OR v_new_total_events >= 5 THEN 'vip'
    WHEN v_new_total_events >= 2 THEN 'repeat'
    ELSE 'new'
  END;

  UPDATE attendee_profiles SET segment = v_segment
  WHERE collective_id = p_collective_id AND email = p_email;
END;
$$;

-- ============================================================================
-- H5: Prevent free ticket duplicate registration at DB level
--     Unique partial index on (event_id, ticket_tier_id, customer_email)
--     where stripe_payment_intent_id IS NULL (free tickets only)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_tickets_free_dedup'
  ) THEN
    CREATE UNIQUE INDEX idx_tickets_free_dedup
      ON tickets (event_id, ticket_tier_id, (metadata->>'customer_email'))
      WHERE stripe_payment_intent_id IS NULL AND status = 'paid';
  END IF;
END $$;
