DROP FUNCTION IF EXISTS acquire_ticket_lock(uuid);

CREATE OR REPLACE FUNCTION acquire_ticket_lock(p_tier_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_tier_id::text));
  RETURN TRUE;
END;
$$;
