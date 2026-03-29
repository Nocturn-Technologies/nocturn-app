-- Atomic capacity check for ticket purchases.
-- Uses advisory lock to prevent race conditions on concurrent purchases.
-- Called by: create-payment-intent, checkout, and webhook routes.
CREATE OR REPLACE FUNCTION check_and_reserve_capacity(
  p_tier_id uuid,
  p_quantity integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_capacity integer;
  v_sold integer;
  v_remaining integer;
BEGIN
  -- Acquire advisory lock on tier ID (blocks concurrent requests for same tier)
  PERFORM pg_advisory_xact_lock(hashtext(p_tier_id::text));

  -- Get tier capacity
  SELECT capacity INTO v_capacity FROM ticket_tiers WHERE id = p_tier_id;
  IF v_capacity IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tier not found');
  END IF;

  -- Count sold tickets
  SELECT count(*) INTO v_sold
  FROM tickets
  WHERE ticket_tier_id = p_tier_id
  AND status IN ('paid', 'checked_in', 'reserved');

  v_remaining := v_capacity - v_sold;

  IF v_remaining < p_quantity THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not enough tickets available',
      'remaining', v_remaining
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'remaining', v_remaining - p_quantity
  );
END;
$$;
