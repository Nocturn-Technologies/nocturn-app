-- Fix: The unique constraint on stripe_payment_intent_id prevents buying multiple tickets
-- in a single purchase (all tickets share the same PI). Drop the unique index and replace
-- with a regular index for lookup performance. Idempotency is handled at the application
-- level (checking existing ticket count before inserting).

DROP INDEX IF EXISTS idx_tickets_stripe_pi_unique;

-- Non-unique index for fast lookups by payment intent ID
CREATE INDEX IF NOT EXISTS idx_tickets_stripe_pi
  ON tickets (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
