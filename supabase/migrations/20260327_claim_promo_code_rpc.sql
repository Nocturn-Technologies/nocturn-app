CREATE OR REPLACE FUNCTION claim_promo_code(p_code_id UUID, p_quantity INTEGER)
RETURNS SETOF promo_codes
LANGUAGE sql
AS $$
  UPDATE promo_codes
  SET current_uses = current_uses + p_quantity
  WHERE id = p_code_id
    AND (max_uses IS NULL OR current_uses + p_quantity <= max_uses)
  RETURNING *;
$$;
