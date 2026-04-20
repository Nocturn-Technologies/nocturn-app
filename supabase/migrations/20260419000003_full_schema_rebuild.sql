-- ============================================================================
-- FULL SCHEMA REBUILD
-- Run in QA Supabase SQL editor (vtkvhdaadobigtojmztg) after QA_BOOTSTRAP.sql.
-- Idempotent — safe to run multiple times.
-- ============================================================================

-- ============================================================================
-- STEP 1: ARTIST PROFILES (replaces artists table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.artist_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id        UUID NOT NULL UNIQUE REFERENCES public.parties(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL UNIQUE,
  bio             TEXT,
  genre           TEXT[] DEFAULT '{}',
  photo_url       TEXT,
  cover_photo_url TEXT,
  booking_email   TEXT,
  default_fee     NUMERIC(10,2),
  spotify         TEXT,
  services        TEXT[] DEFAULT '{}',
  rate_range      TEXT,
  availability    TEXT,
  portfolio_urls  TEXT[] DEFAULT '{}',
  past_venues     TEXT[] DEFAULT '{}',
  is_verified     BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_artist_profiles_party_id ON public.artist_profiles(party_id);
CREATE INDEX IF NOT EXISTS idx_artist_profiles_slug ON public.artist_profiles(slug);
CREATE INDEX IF NOT EXISTS idx_artist_profiles_active ON public.artist_profiles(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_artist_profiles_genre ON public.artist_profiles USING GIN(genre);

ALTER TABLE public.artist_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'artist_profiles' AND policyname = 'Anyone can view active artist profiles') THEN
    CREATE POLICY "Anyone can view active artist profiles" ON public.artist_profiles
      FOR SELECT USING (is_active = true AND deleted_at IS NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'artist_profiles' AND policyname = 'Service role manages artist profiles') THEN
    CREATE POLICY "Service role manages artist profiles" ON public.artist_profiles
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_artist_profiles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'artist_profiles_updated_at') THEN
    CREATE TRIGGER artist_profiles_updated_at
      BEFORE UPDATE ON public.artist_profiles
      FOR EACH ROW EXECUTE FUNCTION public.update_artist_profiles_updated_at();
  END IF;
END $$;

-- ============================================================================
-- STEP 2: VENUE PROFILES (replaces venues table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.venue_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id        UUID NOT NULL UNIQUE REFERENCES public.parties(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  city            TEXT,
  address         TEXT,
  capacity        INTEGER,
  amenities       TEXT[] DEFAULT '{}',
  photo_url       TEXT,
  cover_photo_url TEXT,
  is_verified     BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_profiles_party_id ON public.venue_profiles(party_id);
CREATE INDEX IF NOT EXISTS idx_venue_profiles_slug ON public.venue_profiles(slug);
CREATE INDEX IF NOT EXISTS idx_venue_profiles_city ON public.venue_profiles(city);
CREATE INDEX IF NOT EXISTS idx_venue_profiles_active ON public.venue_profiles(is_active) WHERE is_active = true;

ALTER TABLE public.venue_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'venue_profiles' AND policyname = 'Anyone can view active venue profiles') THEN
    CREATE POLICY "Anyone can view active venue profiles" ON public.venue_profiles
      FOR SELECT USING (is_active = true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'venue_profiles' AND policyname = 'Service role manages venue profiles') THEN
    CREATE POLICY "Service role manages venue profiles" ON public.venue_profiles
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- STEP 3: ORDERS (permanent purchase records)
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'pending', 'paid', 'failed', 'refunded', 'partially_refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.orders (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id                 UUID NOT NULL REFERENCES public.parties(id) ON DELETE RESTRICT,
  event_id                 UUID NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  stripe_payment_intent_id TEXT,
  promo_code_id            UUID REFERENCES public.promo_codes(id) ON DELETE SET NULL,
  subtotal                 NUMERIC(10,2) NOT NULL DEFAULT 0,
  platform_fee             NUMERIC(10,2) NOT NULL DEFAULT 0,
  stripe_fee               NUMERIC(10,2) NOT NULL DEFAULT 0,
  total                    NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency                 TEXT NOT NULL DEFAULT 'cad',
  status                   order_status NOT NULL DEFAULT 'pending',
  metadata                 JSONB,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_party_id ON public.orders(party_id);
CREATE INDEX IF NOT EXISTS idx_orders_event_id ON public.orders(event_id);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_pi ON public.orders(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON public.orders(created_at DESC);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'Collective members can view event orders') THEN
    CREATE POLICY "Collective members can view event orders" ON public.orders
      FOR SELECT USING (
        event_id IN (
          SELECT e.id FROM public.events e
          WHERE e.collective_id IN (SELECT get_user_collectives())
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'Service role manages orders') THEN
    CREATE POLICY "Service role manages orders" ON public.orders
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- STEP 4: ORDER LINES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  tier_id           UUID NOT NULL REFERENCES public.ticket_tiers(id) ON DELETE RESTRICT,
  quantity          INTEGER NOT NULL,
  unit_price        NUMERIC(10,2) NOT NULL,
  subtotal          NUMERIC(10,2) NOT NULL,
  refunded_quantity INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_lines_order_id ON public.order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_order_lines_tier_id ON public.order_lines(tier_id);

ALTER TABLE public.order_lines ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_lines' AND policyname = 'Collective members can view order lines') THEN
    CREATE POLICY "Collective members can view order lines" ON public.order_lines
      FOR SELECT USING (
        order_id IN (
          SELECT o.id FROM public.orders o
          JOIN public.events e ON e.id = o.event_id
          WHERE e.collective_id IN (SELECT get_user_collectives())
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_lines' AND policyname = 'Service role manages order lines') THEN
    CREATE POLICY "Service role manages order lines" ON public.order_lines
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- STEP 5: MODIFY TICKETS — add order_line_id and party_id (holder)
-- ============================================================================

ALTER TABLE IF EXISTS public.tickets
  ADD COLUMN IF NOT EXISTS order_line_id UUID REFERENCES public.order_lines(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS holder_party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_order_line_id ON public.tickets(order_line_id);
CREATE INDEX IF NOT EXISTS idx_tickets_holder_party_id ON public.tickets(holder_party_id) WHERE holder_party_id IS NOT NULL;

-- ============================================================================
-- STEP 6: MODIFY ATTENDEE PROFILES — add party_id
-- ============================================================================

ALTER TABLE IF EXISTS public.attendee_profiles
  ADD COLUMN IF NOT EXISTS party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendee_profiles_party_id ON public.attendee_profiles(party_id) WHERE party_id IS NOT NULL;

-- ============================================================================
-- STEP 7: MODIFY EVENT_ARTISTS — party_id is now primary, drop artist_id FK
-- ============================================================================

DO $$
BEGIN
  -- Drop the FK constraint on artist_id so we can later drop the artists table
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'event_artists_artist_id_fkey'
      AND table_name = 'event_artists'
  ) THEN
    ALTER TABLE public.event_artists DROP CONSTRAINT event_artists_artist_id_fkey;
  END IF;
END $$;

-- Make artist_id nullable (orphaned data, safe to NULL out since QA has no prod data)
ALTER TABLE IF EXISTS public.event_artists
  ALTER COLUMN artist_id DROP NOT NULL;

-- ============================================================================
-- STEP 8: MODIFY SAVED_VENUES — add venue_party_id, drop venue_id FK
-- ============================================================================

ALTER TABLE IF EXISTS public.saved_venues
  ADD COLUMN IF NOT EXISTS venue_party_id UUID REFERENCES public.parties(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'saved_venues_venue_id_fkey'
      AND table_name = 'saved_venues'
  ) THEN
    ALTER TABLE public.saved_venues DROP CONSTRAINT saved_venues_venue_id_fkey;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.saved_venues DROP COLUMN IF EXISTS venue_id;

CREATE INDEX IF NOT EXISTS idx_saved_venues_venue_party_id ON public.saved_venues(venue_party_id);

-- ============================================================================
-- STEP 9: DROP REPLACED TABLES
-- contacts, marketplace_profiles/inquiries/saved all replaced by party model
-- artists and venues replaced by artist_profiles/venue_profiles
-- ============================================================================

-- Drop in dependency order (child tables first)
DROP TABLE IF EXISTS public.marketplace_saved CASCADE;
DROP TABLE IF EXISTS public.marketplace_inquiries CASCADE;
DROP TABLE IF EXISTS public.marketplace_profiles CASCADE;
DROP TABLE IF EXISTS public.contacts CASCADE;

-- Drop artists and venues (replaced by artist_profiles/venue_profiles)
-- event_artists.artist_id FK was already dropped in step 7
DROP TABLE IF EXISTS public.artists CASCADE;
DROP TABLE IF EXISTS public.venues CASCADE;

-- ============================================================================
-- STEP 10: REALTIME
-- ============================================================================

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
