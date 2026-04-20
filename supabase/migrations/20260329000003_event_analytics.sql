-- Real-time event analytics cache, updated on each ticket action
CREATE TABLE IF NOT EXISTS event_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  page_views integer DEFAULT 0,
  unique_visitors integer DEFAULT 0,
  tier_clicks integer DEFAULT 0,
  checkout_starts integer DEFAULT 0,
  checkout_completions integer DEFAULT 0,
  tickets_sold integer DEFAULT 0,
  tickets_refunded integer DEFAULT 0,
  gross_revenue numeric(12,2) DEFAULT 0,
  net_revenue numeric(12,2) DEFAULT 0,
  avg_ticket_price numeric(10,2) DEFAULT 0,
  conversion_rate numeric(5,2) DEFAULT 0,
  capacity_percentage numeric(5,2) DEFAULT 0,
  referral_count integer DEFAULT 0,
  promo_redemptions integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(event_id)
);

-- Attendee segments for CRM
CREATE TABLE IF NOT EXISTS attendee_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collective_id uuid NOT NULL REFERENCES collectives(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  phone text,
  total_events integer DEFAULT 0,
  total_spent numeric(12,2) DEFAULT 0,
  total_tickets integer DEFAULT 0,
  referral_count integer DEFAULT 0,
  first_purchase_at timestamptz,
  last_purchase_at timestamptz,
  segment text DEFAULT 'new', -- 'vip', 'repeat', 'new', 'lapsed'
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(collective_id, email)
);

CREATE INDEX idx_attendee_profiles_collective ON attendee_profiles(collective_id);
CREATE INDEX idx_attendee_profiles_segment ON attendee_profiles(collective_id, segment);
CREATE INDEX idx_attendee_profiles_email ON attendee_profiles(email);
CREATE INDEX idx_event_analytics_event ON event_analytics(event_id);
