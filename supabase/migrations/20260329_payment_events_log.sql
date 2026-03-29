CREATE TABLE IF NOT EXISTS payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL, -- 'payment_created', 'payment_succeeded', 'tickets_fulfilled', 'fulfillment_failed', 'refund_issued', 'refund_failed', 'capacity_exceeded'
  payment_intent_id text,
  event_id uuid REFERENCES events(id),
  tier_id uuid REFERENCES ticket_tiers(id),
  quantity integer,
  amount_cents integer,
  currency text DEFAULT 'usd',
  buyer_email text,
  error_message text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_payment_events_pi ON payment_events(payment_intent_id);
CREATE INDEX idx_payment_events_type ON payment_events(event_type);
CREATE INDEX idx_payment_events_created ON payment_events(created_at DESC);
