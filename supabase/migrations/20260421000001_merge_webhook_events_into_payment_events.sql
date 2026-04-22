-- Merge webhook_events into payment_events
--
-- webhook_events was a deduplication-only table (stripe_event_id UNIQUE, event_type,
-- processed flag). payment_events already stores stripe_event_id NOT NULL and serves
-- as the raw Stripe event log. Adding is_processed + processed_at here and a UNIQUE
-- constraint on stripe_event_id lets payment_events serve both purposes.
--
-- Rollback: supabase/migrations/20260421000001_rollback_merge_webhook_events.sql

-- 1. Extend payment_events with deduplication tracking columns
ALTER TABLE payment_events
  ADD COLUMN IF NOT EXISTS is_processed  BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS processed_at  TIMESTAMPTZ;

-- 2. Unique constraint enables INSERT-on-conflict dedup (replaces webhook_events role)
-- Note: constraint may already exist from a prior migration — safe to skip if so.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_events_stripe_event_id_key'
  ) THEN
    ALTER TABLE payment_events ADD CONSTRAINT payment_events_stripe_event_id_key UNIQUE (stripe_event_id);
  END IF;
END $$;

-- 3. Migrate any webhook_events rows not already present in payment_events
INSERT INTO payment_events (stripe_event_id, event_type, is_processed, processed_at, created_at)
SELECT
  we.stripe_event_id,
  we.event_type,
  we.processed,
  we.processed_at,
  we.created_at
FROM webhook_events we
WHERE we.stripe_event_id NOT IN (
  SELECT stripe_event_id FROM payment_events
)
ON CONFLICT (stripe_event_id) DO NOTHING;

-- 4. Drop the now-redundant table
DROP TABLE IF EXISTS webhook_events;
