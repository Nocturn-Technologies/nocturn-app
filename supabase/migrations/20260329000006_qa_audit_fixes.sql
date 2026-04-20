-- Migration: QA Audit Round 4 Fixes
-- Created: 2026-03-29
-- Fixes: schema mismatches, capacity reservation, promo claiming, analytics, RLS

-- ============================================================================
-- 1. FIX PROMO_CODES SCHEMA MISMATCH (H3)
--    Initial schema uses uses_count/valid_from/valid_until
--    App code uses current_uses/is_active/expires_at
-- ============================================================================

-- Add current_uses as alias/replacement for uses_count
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS current_uses INTEGER DEFAULT 0;
-- Sync existing data from uses_count → current_uses
UPDATE promo_codes SET current_uses = COALESCE(uses_count, 0) WHERE current_uses = 0 AND uses_count > 0;

-- Add is_active column (app code filters by this)
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Add expires_at as alias for valid_until
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
-- Sync existing data from valid_until → expires_at
UPDATE promo_codes SET expires_at = valid_until WHERE expires_at IS NULL AND valid_until IS NOT NULL;

-- ============================================================================
-- 2. FIX ATTENDEE_PROFILES SCHEMA CONFLICT (H4)
--    Initial schema: keyed by user_id, columns: total_spend, first_event_at, etc.
--    Analytics code: keyed by (collective_id, email), columns: total_spent, etc.
--    Since the analytics migration uses CREATE TABLE IF NOT EXISTS, it was silently
--    skipped. We need to add the missing columns to the existing table.
-- ============================================================================

ALTER TABLE attendee_profiles ADD COLUMN IF NOT EXISTS collective_id UUID REFERENCES collectives(id) ON DELETE CASCADE;
ALTER TABLE attendee_profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE attendee_profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE attendee_profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE attendee_profiles ADD COLUMN IF NOT EXISTS total_spent NUMERIC(12,2) DEFAULT 0;
ALTER TABLE attendee_profiles ADD COLUMN IF NOT EXISTS total_tickets INTEGER DEFAULT 0;
ALTER TABLE attendee_profiles ADD COLUMN IF NOT EXISTS referral_count INTEGER DEFAULT 0;
ALTER TABLE attendee_profiles ADD COLUMN IF NOT EXISTS first_purchase_at TIMESTAMPTZ;
ALTER TABLE attendee_profiles ADD COLUMN IF NOT EXISTS last_purchase_at TIMESTAMPTZ;
ALTER TABLE attendee_profiles ADD COLUMN IF NOT EXISTS segment TEXT DEFAULT 'new';

-- Make user_id nullable (analytics inserts by email, not user_id)
ALTER TABLE attendee_profiles ALTER COLUMN user_id DROP NOT NULL;

-- Add unique constraint on (collective_id, email) if both are present
-- Can't use CREATE UNIQUE INDEX IF NOT EXISTS on a partial, so use DO block
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_attendee_profiles_collective_email'
  ) THEN
    CREATE UNIQUE INDEX idx_attendee_profiles_collective_email ON attendee_profiles(collective_id, email)
      WHERE collective_id IS NOT NULL AND email IS NOT NULL;
  END IF;
END $$;

-- Add missing indexes from event_analytics migration (idempotent)
CREATE INDEX IF NOT EXISTS idx_attendee_profiles_collective ON attendee_profiles(collective_id);
CREATE INDEX IF NOT EXISTS idx_attendee_profiles_segment ON attendee_profiles(collective_id, segment);
CREATE INDEX IF NOT EXISTS idx_attendee_profiles_email ON attendee_profiles(email);
CREATE INDEX IF NOT EXISTS idx_event_analytics_event ON event_analytics(event_id);

-- ============================================================================
-- 3. REPLACE claim_promo_code WITH ATOMIC VERSION (H5)
--    Supersedes the 20260327 non-locking version.
--    Uses FOR UPDATE lock and proper capacity validation.
--    Now uses current_uses column (not uses_count).
-- ============================================================================

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
-- 4. ADD UNIQUE PARTIAL INDEX ON tickets.stripe_payment_intent_id (C3 from audit)
--    Prevents duplicate tickets at the DB level regardless of app-level race conditions.
-- ============================================================================

-- Drop existing non-unique index if present (may have been created earlier)
DROP INDEX IF EXISTS idx_tickets_stripe_pi;

-- Create partial unique index (NULLs allowed for free tickets)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_stripe_pi_unique
  ON tickets (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- ============================================================================
-- 5. ENABLE RLS ON rate_limits TABLE (H8)
-- ============================================================================

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- No policies = only service-role can access (blocks authenticated/anon)
-- The rate_limits table is only accessed via admin client (service role)

-- ============================================================================
-- 6. ADD rate_limits CLEANUP FUNCTION (L2)
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM rate_limits WHERE created_at < NOW() - INTERVAL '1 hour';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ============================================================================
-- 7. UPDATE increment_analytics_counter WHITELIST (M2)
--    Ensure all valid analytics columns are whitelisted.
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_analytics_counter(
  p_event_id UUID,
  p_column TEXT,
  p_value NUMERIC DEFAULT 1
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Whitelist allowed column names to prevent SQL injection
  IF p_column NOT IN (
    'page_views', 'unique_visitors', 'tier_clicks',
    'checkout_starts', 'checkout_completions',
    'tickets_sold', 'tickets_refunded',
    'gross_revenue', 'net_revenue',
    'referral_count', 'promo_redemptions'
  ) THEN
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

-- ============================================================================
-- 8. FIX track_ticket_refund TO DECREMENT tickets_sold (already done in prior
--    migration, but re-create to ensure it's applied)
-- ============================================================================

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
