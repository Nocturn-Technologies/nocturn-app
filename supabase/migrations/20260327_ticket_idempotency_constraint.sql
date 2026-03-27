-- Add partial unique index on stripe_payment_intent_id to prevent duplicate ticket creation
-- Partial because stripe_payment_intent_id is null for free tickets
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_stripe_pi_unique
  ON tickets (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
