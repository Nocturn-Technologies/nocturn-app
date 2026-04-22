-- Rollback: restore webhook_events and revert payment_events changes

CREATE TABLE IF NOT EXISTS webhook_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT        NOT NULL UNIQUE,
  event_type      TEXT        NOT NULL,
  processed       BOOLEAN     NOT NULL DEFAULT false,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Restore data from payment_events back to webhook_events
INSERT INTO webhook_events (stripe_event_id, event_type, processed, processed_at, created_at)
SELECT stripe_event_id, event_type, is_processed, processed_at, created_at
FROM payment_events
ON CONFLICT (stripe_event_id) DO NOTHING;

ALTER TABLE payment_events
  DROP CONSTRAINT IF EXISTS payment_events_stripe_event_id_key,
  DROP COLUMN IF EXISTS is_processed,
  DROP COLUMN IF EXISTS processed_at;
