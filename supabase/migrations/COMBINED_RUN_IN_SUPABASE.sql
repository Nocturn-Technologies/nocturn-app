-- ============================================================================
-- COMBINED MIGRATION v3 — Only core tables needed for features
-- Run in Supabase SQL Editor → Hit Run
-- ============================================================================

-- ============================================================================
-- 1. INVITATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collective_id UUID NOT NULL REFERENCES collectives(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  invited_by UUID REFERENCES auth.users(id),
  token UUID DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  UNIQUE(collective_id, email)
);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invitations' AND policyname = 'Allow all for authenticated') THEN
    CREATE POLICY "Allow all for authenticated" ON invitations
      FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Add type column (member vs collab)
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'member';

-- Update unique constraint to include type
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_collective_id_email_key;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'invitations_collective_id_email_type_key' AND table_name = 'invitations'
  ) THEN
    ALTER TABLE invitations ADD CONSTRAINT invitations_collective_id_email_type_key UNIQUE (collective_id, email, type);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations (token) WHERE status = 'pending';

-- ============================================================================
-- 2. REFERRAL CODE ON COLLECTIVES
-- ============================================================================

ALTER TABLE collectives ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

UPDATE collectives
SET referral_code = UPPER(LEFT(REPLACE(slug, '-', ''), 6)) || SUBSTR(gen_random_uuid()::TEXT, 1, 4)
WHERE referral_code IS NULL;

-- ============================================================================
-- 3. EVENT REACTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (emoji IN ('🔥', '💯', '🙌', '🎉', '💜')),
  fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_reactions_unique ON event_reactions(event_id, emoji, fingerprint);
CREATE INDEX IF NOT EXISTS idx_event_reactions_event ON event_reactions(event_id);

ALTER TABLE event_reactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_reactions' AND policyname = 'Anyone can read reactions') THEN
    CREATE POLICY "Anyone can read reactions" ON event_reactions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_reactions' AND policyname = 'Anyone can insert reactions') THEN
    CREATE POLICY "Anyone can insert reactions" ON event_reactions FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- 4. EXTRA COLUMNS ON EVENTS + EVENT_ARTISTS
-- ============================================================================

ALTER TABLE events ADD COLUMN IF NOT EXISTS bar_minimum NUMERIC(10,2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_deposit NUMERIC(10,2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_cost NUMERIC(10,2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS estimated_bar_revenue NUMERIC(10,2);

ALTER TABLE event_artists ADD COLUMN IF NOT EXISTS flight_cost NUMERIC(10,2);
ALTER TABLE event_artists ADD COLUMN IF NOT EXISTS hotel_cost NUMERIC(10,2);
ALTER TABLE event_artists ADD COLUMN IF NOT EXISTS transport_cost NUMERIC(10,2);
ALTER TABLE event_artists ADD COLUMN IF NOT EXISTS travel_notes TEXT;

-- ============================================================================
-- 5. USER TYPE
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type TEXT NOT NULL DEFAULT 'collective';

-- Drop old constraint if it exists, recreate with all types
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_type_check;
ALTER TABLE users ADD CONSTRAINT users_user_type_check
  CHECK (user_type IN ('collective', 'artist', 'venue', 'promoter', 'photographer', 'videographer', 'sound_production', 'lighting_production', 'sponsor', 'artist_manager', 'tour_manager', 'booking_agent', 'event_staff', 'mc_host', 'graphic_designer', 'pr_publicist'));

CREATE INDEX IF NOT EXISTS idx_users_user_type ON users (user_type);

-- ============================================================================
-- 6. EXTERNAL EVENTS + PROMO LINKS (affiliate /go/ links)
-- ============================================================================

CREATE TABLE IF NOT EXISTS external_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promoter_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  external_url TEXT NOT NULL,
  platform TEXT,
  event_date TIMESTAMPTZ,
  venue_name TEXT,
  flyer_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS promo_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promoter_id UUID NOT NULL REFERENCES users(id),
  event_id UUID REFERENCES events(id),
  external_event_id UUID REFERENCES external_events(id),
  token TEXT UNIQUE NOT NULL,
  click_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT one_event_type CHECK (
    (event_id IS NOT NULL AND external_event_id IS NULL) OR
    (event_id IS NULL AND external_event_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS promo_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_link_id UUID NOT NULL REFERENCES promo_links(id),
  clicked_at TIMESTAMPTZ DEFAULT now(),
  referrer TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_external_events_promoter ON external_events(promoter_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_promo_links_promoter ON promo_links(promoter_id);
CREATE INDEX IF NOT EXISTS idx_promo_links_token ON promo_links(token);
CREATE INDEX IF NOT EXISTS idx_promo_clicks_link ON promo_clicks(promo_link_id);

ALTER TABLE external_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_clicks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'external_events' AND policyname = 'Users can view own external events') THEN
    CREATE POLICY "Users can view own external events" ON external_events FOR SELECT USING (auth.uid() = promoter_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'external_events' AND policyname = 'Users can insert own external events') THEN
    CREATE POLICY "Users can insert own external events" ON external_events FOR INSERT WITH CHECK (auth.uid() = promoter_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'external_events' AND policyname = 'Users can update own external events') THEN
    CREATE POLICY "Users can update own external events" ON external_events FOR UPDATE USING (auth.uid() = promoter_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'external_events' AND policyname = 'Users can delete own external events') THEN
    CREATE POLICY "Users can delete own external events" ON external_events FOR DELETE USING (auth.uid() = promoter_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'promo_links' AND policyname = 'Users can view own promo links') THEN
    CREATE POLICY "Users can view own promo links" ON promo_links FOR SELECT USING (auth.uid() = promoter_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'promo_links' AND policyname = 'Users can insert own promo links') THEN
    CREATE POLICY "Users can insert own promo links" ON promo_links FOR INSERT WITH CHECK (auth.uid() = promoter_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'promo_links' AND policyname = 'Anyone can read promo links by token') THEN
    CREATE POLICY "Anyone can read promo links by token" ON promo_links FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'promo_clicks' AND policyname = 'Anyone can insert clicks') THEN
    CREATE POLICY "Anyone can insert clicks" ON promo_clicks FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'promo_clicks' AND policyname = 'Link owners can view clicks') THEN
    CREATE POLICY "Link owners can view clicks" ON promo_clicks FOR SELECT USING (
      promo_link_id IN (SELECT id FROM promo_links WHERE promoter_id = auth.uid())
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION increment_promo_click(p_link_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE promo_links SET click_count = click_count + 1 WHERE id = p_link_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. SETTLEMENT COLUMNS
-- ============================================================================

ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS collective_id uuid REFERENCES collectives(id),
  ADD COLUMN IF NOT EXISTS gross_revenue numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_revenue numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_fees numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_artist_fees numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunds_total numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS venue_fee numeric(10,2) DEFAULT 0;

-- ============================================================================
-- 8. TICKET LOCK FUNCTION
-- ============================================================================

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

-- ============================================================================
-- 9. TICKET IDEMPOTENCY
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_stripe_pi_unique
  ON tickets (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- ============================================================================
-- DONE! All migrations applied.
-- ============================================================================
