-- ============================================================================
-- QA FULL BOOTSTRAP
-- Run this in the QA Supabase SQL editor (vtkvhdaadobigtojmztg).
-- Brings QA to full schema parity with prod, then applies entity architecture.
-- Every statement is idempotent — safe to run multiple times.
-- ============================================================================

-- ============================================================================
-- STEP 1: MISSING ENUM VALUES
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'owner' AND enumtypid = 'collective_role'::regtype) THEN
    ALTER TYPE collective_role ADD VALUE 'owner';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'upcoming' AND enumtypid = 'event_status'::regtype) THEN
    ALTER TYPE event_status ADD VALUE 'upcoming';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'settled' AND enumtypid = 'event_status'::regtype) THEN
    ALTER TYPE event_status ADD VALUE 'settled';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'sent' AND enumtypid = 'settlement_status'::regtype) THEN
    ALTER TYPE settlement_status ADD VALUE 'sent';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'free' AND enumtypid = 'ticket_status'::regtype) THEN
    ALTER TYPE ticket_status ADD VALUE 'free';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'pending' AND enumtypid = 'ticket_status'::regtype) THEN
    ALTER TYPE ticket_status ADD VALUE 'pending';
  END IF;
END $$;

-- Entity architecture enums (no-op if entity arch migration already ran)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'party_type') THEN
    CREATE TYPE party_type AS ENUM ('person', 'organization', 'venue');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_method_type') THEN
    CREATE TYPE contact_method_type AS ENUM ('email', 'phone', 'instagram', 'soundcloud', 'spotify', 'website', 'twitter');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'party_role_type') THEN
    CREATE TYPE party_role_type AS ENUM ('artist', 'collective', 'venue_operator', 'platform_user', 'contact');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_event_type') THEN
    CREATE TYPE ticket_event_type AS ENUM ('purchased', 'transferred', 'checked_in', 'refunded', 'voided');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_status_type') THEN
    CREATE TYPE event_status_type AS ENUM ('draft', 'published', 'cancelled', 'wrapped');
  END IF;
END $$;

-- ============================================================================
-- STEP 2: ENTITY ARCHITECTURE — MASTER DATA TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.parties (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         party_type NOT NULL,
  display_name TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.party_contact_methods (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id   UUID NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  type       contact_method_type NOT NULL,
  value      TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (party_id, type)
);

CREATE TABLE IF NOT EXISTS public.party_roles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id      UUID NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  role          party_role_type NOT NULL,
  collective_id UUID REFERENCES public.collectives(id) ON DELETE CASCADE,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (party_id, role, collective_id)
);

CREATE INDEX IF NOT EXISTS idx_parties_type ON public.parties (type);
CREATE INDEX IF NOT EXISTS idx_party_contact_methods_party_id ON public.party_contact_methods (party_id);
CREATE INDEX IF NOT EXISTS idx_party_contact_methods_lookup ON public.party_contact_methods (party_id, type);
CREATE INDEX IF NOT EXISTS idx_party_roles_party_id ON public.party_roles (party_id);
CREATE INDEX IF NOT EXISTS idx_party_roles_collective ON public.party_roles (collective_id) WHERE collective_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_party_roles_role ON public.party_roles (role);

ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_contact_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_roles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parties' AND policyname = 'parties_select') THEN
    CREATE POLICY "parties_select" ON public.parties FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM public.party_roles pr WHERE pr.party_id = parties.id AND pr.role = 'platform_user')
      OR EXISTS (
        SELECT 1 FROM public.party_roles pr
        JOIN public.collective_members cm ON cm.collective_id = pr.collective_id
        WHERE pr.party_id = parties.id AND cm.user_id = auth.uid() AND cm.deleted_at IS NULL
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parties' AND policyname = 'parties_service_role') THEN
    CREATE POLICY "parties_service_role" ON public.parties FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'party_contact_methods' AND policyname = 'party_contact_methods_select') THEN
    CREATE POLICY "party_contact_methods_select" ON public.party_contact_methods FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM public.parties p WHERE p.id = party_contact_methods.party_id)
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'party_contact_methods' AND policyname = 'party_contact_methods_service_role') THEN
    CREATE POLICY "party_contact_methods_service_role" ON public.party_contact_methods FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'party_roles' AND policyname = 'party_roles_select') THEN
    CREATE POLICY "party_roles_select" ON public.party_roles FOR SELECT TO authenticated USING (
      collective_id IS NULL OR collective_id IN (SELECT get_user_collectives())
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'party_roles' AND policyname = 'party_roles_service_role') THEN
    CREATE POLICY "party_roles_service_role" ON public.party_roles FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- parties updated_at trigger
CREATE OR REPLACE FUNCTION public.update_parties_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'parties_updated_at') THEN
    CREATE TRIGGER parties_updated_at
      BEFORE UPDATE ON public.parties
      FOR EACH ROW EXECUTE FUNCTION public.update_parties_updated_at();
  END IF;
END $$;

-- ============================================================================
-- STEP 3: ENTITY ARCHITECTURE — TRANSACTIONAL TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ticket_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  event_type  ticket_event_type NOT NULL,
  party_id    UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata    JSONB
);

CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_id ON public.ticket_events (ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_events_party_id ON public.ticket_events (party_id) WHERE party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_events_timeline ON public.ticket_events (ticket_id, occurred_at);

ALTER TABLE public.ticket_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ticket_events' AND policyname = 'ticket_events_select') THEN
    CREATE POLICY "ticket_events_select" ON public.ticket_events FOR SELECT TO authenticated USING (
      ticket_id IN (
        SELECT t.id FROM public.tickets t
        JOIN public.events e ON e.id = t.event_id
        WHERE e.collective_id IN (SELECT get_user_collectives())
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ticket_events' AND policyname = 'ticket_events_service_role') THEN
    CREATE POLICY "ticket_events_service_role" ON public.ticket_events FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_events;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.event_status_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  status      event_status_type NOT NULL,
  changed_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note        TEXT
);

CREATE INDEX IF NOT EXISTS idx_event_status_log_event ON public.event_status_log (event_id, occurred_at);

ALTER TABLE public.event_status_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_status_log' AND policyname = 'event_status_log_select') THEN
    CREATE POLICY "event_status_log_select" ON public.event_status_log FOR SELECT TO authenticated USING (
      event_id IN (SELECT e.id FROM public.events e WHERE e.collective_id IN (SELECT get_user_collectives()))
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_status_log' AND policyname = 'event_status_log_service_role') THEN
    CREATE POLICY "event_status_log_service_role" ON public.event_status_log FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.promo_code_usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  ticket_id     UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  party_id      UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  used_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (promo_code_id, ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_promo_code_usage_code ON public.promo_code_usage (promo_code_id);

ALTER TABLE public.promo_code_usage ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'promo_code_usage' AND policyname = 'promo_code_usage_select') THEN
    CREATE POLICY "promo_code_usage_select" ON public.promo_code_usage FOR SELECT TO authenticated USING (
      promo_code_id IN (
        SELECT pc.id FROM public.promo_codes pc
        JOIN public.events e ON e.id = pc.event_id
        WHERE e.collective_id IN (SELECT get_user_collectives())
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'promo_code_usage' AND policyname = 'promo_code_usage_service_role') THEN
    CREATE POLICY "promo_code_usage_service_role" ON public.promo_code_usage FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- STEP 4: ENTITY ARCHITECTURE — party_id FKs ON EXISTING TABLES
-- ============================================================================

ALTER TABLE IF EXISTS public.artists          ADD COLUMN IF NOT EXISTS party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.collectives       ADD COLUMN IF NOT EXISTS party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.venues            ADD COLUMN IF NOT EXISTS party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.contacts          ADD COLUMN IF NOT EXISTS party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.users             ADD COLUMN IF NOT EXISTS party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.marketplace_profiles ADD COLUMN IF NOT EXISTS party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.collective_members   ADD COLUMN IF NOT EXISTS party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.event_artists        ADD COLUMN IF NOT EXISTS party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.events               ADD COLUMN IF NOT EXISTS venue_party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_artists_party_id         ON public.artists (party_id) WHERE party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_collectives_party_id     ON public.collectives (party_id) WHERE party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venues_party_id          ON public.venues (party_id) WHERE party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_party_id           ON public.users (party_id) WHERE party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_collective_members_party ON public.collective_members (party_id) WHERE party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_artists_party_id   ON public.event_artists (party_id) WHERE party_id IS NOT NULL;

-- ============================================================================
-- STEP 5: ENTITY ARCHITECTURE — DROP OLD SOCIAL COLUMNS
-- ============================================================================

ALTER TABLE IF EXISTS public.artists    DROP COLUMN IF EXISTS instagram, DROP COLUMN IF EXISTS soundcloud;
ALTER TABLE IF EXISTS public.collectives DROP COLUMN IF EXISTS instagram, DROP COLUMN IF EXISTS website;
ALTER TABLE IF EXISTS public.venues     DROP COLUMN IF EXISTS instagram, DROP COLUMN IF EXISTS website;
ALTER TABLE IF EXISTS public.contacts   DROP COLUMN IF EXISTS instagram;
ALTER TABLE IF EXISTS public.marketplace_profiles
  DROP COLUMN IF EXISTS instagram_handle,
  DROP COLUMN IF EXISTS soundcloud_url,
  DROP COLUMN IF EXISTS website_url;
ALTER TABLE IF EXISTS public.promo_codes DROP COLUMN IF EXISTS times_used;

-- Make channels.collective_id nullable (direct DM support)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'channels' AND column_name = 'collective_id'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.channels ALTER COLUMN collective_id DROP NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- STEP 6: CHANNELS + MESSAGES (chat infrastructure)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.channels (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collective_id         UUID REFERENCES public.collectives(id) ON DELETE CASCADE,
  event_id              UUID REFERENCES public.events(id) ON DELETE SET NULL,
  partner_collective_id UUID REFERENCES public.collectives(id) ON DELETE SET NULL,
  name                  TEXT NOT NULL,
  type                  TEXT NOT NULL DEFAULT 'general',
  metadata              JSONB,
  created_at            TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'channels' AND policyname = 'Members can view collective channels') THEN
    CREATE POLICY "Members can view collective channels" ON public.channels
      FOR SELECT USING (
        collective_id IN (
          SELECT collective_id FROM public.collective_members
          WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'channels' AND policyname = 'Service role manages channels') THEN
    CREATE POLICY "Service role manages channels" ON public.channels
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content    TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'text',
  metadata   JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON public.messages (channel_id, created_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'Channel members can view messages') THEN
    CREATE POLICY "Channel members can view messages" ON public.messages
      FOR SELECT USING (
        channel_id IN (
          SELECT ch.id FROM public.channels ch
          JOIN public.collective_members cm ON cm.collective_id = ch.collective_id
          WHERE cm.user_id = auth.uid() AND cm.deleted_at IS NULL
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'Service role manages messages') THEN
    CREATE POLICY "Service role manages messages" ON public.messages
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- channel_members
CREATE TABLE IF NOT EXISTS public.channel_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member',
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ,
  is_online    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_members_channel_id ON public.channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_user_id ON public.channel_members(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_online ON public.channel_members(channel_id, is_online) WHERE is_online = true;

ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'channel_members' AND policyname = 'Members can view channel members') THEN
    CREATE POLICY "Members can view channel members" ON public.channel_members
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.channel_members cm WHERE cm.channel_id = channel_members.channel_id AND cm.user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'channel_members' AND policyname = 'Members can update own membership') THEN
    CREATE POLICY "Members can update own membership" ON public.channel_members
      FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'channel_members' AND policyname = 'Service role manages members') THEN
    CREATE POLICY "Service role manages members" ON public.channel_members
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_members;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- STEP 7: CONTACTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.contacts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collective_id          UUID NOT NULL REFERENCES public.collectives(id) ON DELETE CASCADE,
  contact_type           TEXT NOT NULL DEFAULT 'fan',
  email                  TEXT,
  phone                  TEXT,
  full_name              TEXT,
  role                   TEXT,
  source                 TEXT NOT NULL DEFAULT 'manual',
  source_detail          TEXT,
  user_id                UUID REFERENCES public.users(id),
  artist_id              UUID REFERENCES public.artists(id),
  marketplace_profile_id UUID,
  party_id               UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  tags                   TEXT[] DEFAULT '{}',
  notes                  TEXT,
  follow_up_at           TIMESTAMPTZ,
  segment                TEXT NOT NULL DEFAULT 'general',
  vip_status             BOOLEAN NOT NULL DEFAULT false,
  total_events           INTEGER,
  total_spend            NUMERIC(10,2),
  total_tickets          INTEGER NOT NULL DEFAULT 0,
  first_seen_at          TIMESTAMPTZ DEFAULT now(),
  last_seen_at           TIMESTAMPTZ DEFAULT now(),
  metadata               JSONB DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at             TIMESTAMPTZ,
  CONSTRAINT uq_contact_email_collective UNIQUE (collective_id, email)
);

CREATE INDEX IF NOT EXISTS idx_contacts_collective_type ON public.contacts(collective_id, contact_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON public.contacts USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON public.contacts(email);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contacts' AND policyname = 'Members can view collective contacts') THEN
    CREATE POLICY "Members can view collective contacts" ON public.contacts
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.collective_members
          WHERE collective_members.collective_id = contacts.collective_id
            AND collective_members.user_id = auth.uid()
            AND collective_members.deleted_at IS NULL
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contacts' AND policyname = 'Service role manages contacts') THEN
    CREATE POLICY "Service role manages contacts" ON public.contacts
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- STEP 8: MARKETPLACE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.marketplace_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  party_id        UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  user_type       TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  bio             TEXT,
  avatar_url      TEXT,
  cover_photo_url TEXT,
  city            TEXT,
  spotify_url     TEXT,
  genres          TEXT[] DEFAULT '{}',
  services        TEXT[] DEFAULT '{}',
  rate_range      TEXT,
  availability    TEXT,
  portfolio_urls  TEXT[] DEFAULT '{}',
  past_venues     TEXT[] DEFAULT '{}',
  is_verified     BOOLEAN DEFAULT false,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_profiles_type ON public.marketplace_profiles(user_type);
CREATE INDEX IF NOT EXISTS idx_marketplace_profiles_city ON public.marketplace_profiles(city);
CREATE INDEX IF NOT EXISTS idx_marketplace_profiles_genres ON public.marketplace_profiles USING GIN(genres);
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_profiles_user ON public.marketplace_profiles(user_id);

ALTER TABLE public.marketplace_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'marketplace_profiles' AND policyname = 'Anyone can view active profiles') THEN
    CREATE POLICY "Anyone can view active profiles" ON public.marketplace_profiles FOR SELECT USING (is_active = true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'marketplace_profiles' AND policyname = 'Users can insert own profile') THEN
    CREATE POLICY "Users can insert own profile" ON public.marketplace_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'marketplace_profiles' AND policyname = 'Users can update own profile') THEN
    CREATE POLICY "Users can update own profile" ON public.marketplace_profiles FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'marketplace_profiles' AND policyname = 'Service role manages marketplace profiles') THEN
    CREATE POLICY "Service role manages marketplace profiles" ON public.marketplace_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.marketplace_inquiries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id  UUID NOT NULL REFERENCES public.users(id),
  to_profile_id UUID NOT NULL REFERENCES public.marketplace_profiles(id),
  event_id      UUID REFERENCES public.events(id),
  message       TEXT,
  inquiry_type  TEXT NOT NULL DEFAULT 'contact',
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inquiries_to ON public.marketplace_inquiries(to_profile_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_from ON public.marketplace_inquiries(from_user_id);

ALTER TABLE public.marketplace_inquiries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'marketplace_inquiries' AND policyname = 'Service role manages inquiries') THEN
    CREATE POLICY "Service role manages inquiries" ON public.marketplace_inquiries FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.marketplace_saved (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.marketplace_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, profile_id)
);

ALTER TABLE public.marketplace_saved ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'marketplace_saved' AND policyname = 'Users can manage own saves') THEN
    CREATE POLICY "Users can manage own saves" ON public.marketplace_saved FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================================
-- STEP 9: PAYMENT EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payment_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type        TEXT NOT NULL,
  payment_intent_id TEXT,
  event_id          UUID REFERENCES public.events(id),
  tier_id           UUID REFERENCES public.ticket_tiers(id),
  quantity          INTEGER,
  amount_cents      INTEGER,
  currency          TEXT DEFAULT 'usd',
  buyer_email       TEXT,
  error_message     TEXT,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_pi ON public.payment_events(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_type ON public.payment_events(event_type);
CREATE INDEX IF NOT EXISTS idx_payment_events_created ON public.payment_events(created_at DESC);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payment_events' AND policyname = 'Service role manages payment events') THEN
    CREATE POLICY "Service role manages payment events" ON public.payment_events FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- STEP 10: EXTERNAL EVENTS + PROMO LINKS + PROMO CLICKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.external_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promoter_id  UUID NOT NULL REFERENCES public.users(id),
  title        TEXT NOT NULL,
  external_url TEXT NOT NULL,
  platform     TEXT,
  event_date   TIMESTAMPTZ,
  venue_name   TEXT,
  flyer_url    TEXT,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

ALTER TABLE public.external_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'external_events' AND policyname = 'Service role manages external events') THEN
    CREATE POLICY "Service role manages external events" ON public.external_events FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.promo_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promoter_id       UUID NOT NULL REFERENCES public.users(id),
  event_id          UUID REFERENCES public.events(id),
  external_event_id UUID REFERENCES public.external_events(id),
  token             TEXT UNIQUE NOT NULL,
  click_count       INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.promo_links ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'promo_links' AND policyname = 'Service role manages promo links') THEN
    CREATE POLICY "Service role manages promo links" ON public.promo_links FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.promo_clicks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_link_id UUID NOT NULL REFERENCES public.promo_links(id),
  clicked_at    TIMESTAMPTZ DEFAULT now(),
  referrer      TEXT,
  user_agent    TEXT
);

ALTER TABLE public.promo_clicks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'promo_clicks' AND policyname = 'Service role manages promo clicks') THEN
    CREATE POLICY "Service role manages promo clicks" ON public.promo_clicks FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.increment_promo_click(p_link_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.promo_links SET click_count = click_count + 1 WHERE id = p_link_id;
END;
$$;

-- ============================================================================
-- STEP 11: EVENT ANALYTICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_analytics (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  page_views           INTEGER,
  unique_visitors      INTEGER,
  checkout_starts      INTEGER,
  checkout_completions INTEGER,
  conversion_rate      NUMERIC(5,2),
  tickets_sold         INTEGER,
  tickets_refunded     INTEGER,
  gross_revenue        NUMERIC(10,2),
  net_revenue          NUMERIC(10,2),
  avg_ticket_price     NUMERIC(10,2),
  promo_redemptions    INTEGER,
  referral_count       INTEGER,
  tier_clicks          INTEGER,
  capacity_percentage  NUMERIC(5,2),
  currency             TEXT NOT NULL DEFAULT 'cad',
  updated_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id)
);

ALTER TABLE public.event_analytics ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_analytics' AND policyname = 'Service role manages event analytics') THEN
    CREATE POLICY "Service role manages event analytics" ON public.event_analytics FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.increment_analytics_counter(
  p_event_id UUID,
  p_field TEXT,
  p_value NUMERIC DEFAULT 1
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.event_analytics (event_id, updated_at)
  VALUES (p_event_id, now())
  ON CONFLICT (event_id) DO NOTHING;

  EXECUTE format(
    'UPDATE public.event_analytics SET %I = COALESCE(%I, 0) + $1, updated_at = now() WHERE event_id = $2',
    p_field, p_field
  ) USING p_value, p_event_id;
END;
$$;

-- ============================================================================
-- STEP 12: RECORDINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.recordings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collective_id    UUID NOT NULL REFERENCES public.collectives(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES public.users(id),
  title            TEXT,
  audio_url        TEXT NOT NULL,
  duration_seconds INTEGER,
  transcript       TEXT,
  summary          TEXT,
  action_items     TEXT,
  key_decisions    TEXT,
  status           TEXT,
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'recordings' AND policyname = 'Members can view collective recordings') THEN
    CREATE POLICY "Members can view collective recordings" ON public.recordings
      FOR SELECT USING (collective_id IN (SELECT collective_id FROM public.collective_members WHERE user_id = auth.uid() AND deleted_at IS NULL));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'recordings' AND policyname = 'Service role manages recordings') THEN
    CREATE POLICY "Service role manages recordings" ON public.recordings FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- STEP 13: SAVED VENUES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.saved_venues (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collective_id UUID NOT NULL REFERENCES public.collectives(id) ON DELETE CASCADE,
  venue_id      UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  notes         TEXT,
  rating        INTEGER,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(collective_id, venue_id)
);

ALTER TABLE public.saved_venues ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'saved_venues' AND policyname = 'Members can manage saved venues') THEN
    CREATE POLICY "Members can manage saved venues" ON public.saved_venues
      FOR ALL USING (collective_id IN (SELECT collective_id FROM public.collective_members WHERE user_id = auth.uid() AND deleted_at IS NULL));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'saved_venues' AND policyname = 'Service role manages saved venues') THEN
    CREATE POLICY "Service role manages saved venues" ON public.saved_venues FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- STEP 14: WAITLIST ENTRIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.waitlist_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  tier_id     UUID REFERENCES public.ticket_tiers(id) ON DELETE SET NULL,
  email       TEXT NOT NULL,
  name        TEXT,
  phone       TEXT,
  status      TEXT,
  notified_at TIMESTAMPTZ,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'waitlist_entries' AND policyname = 'Service role manages waitlist entries') THEN
    CREATE POLICY "Service role manages waitlist entries" ON public.waitlist_entries FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- STEP 15: RATE LIMITS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rate_limits' AND policyname = 'Service role manages rate limits') THEN
    CREATE POLICY "Service role manages rate limits" ON public.rate_limits FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- STEP 16: GUEST LIST
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.guest_list (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  plus_ones     INTEGER,
  notes         TEXT,
  status        TEXT,
  checked_in_at TIMESTAMPTZ,
  added_by      UUID REFERENCES public.users(id),
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.guest_list ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'guest_list' AND policyname = 'Members can manage guest list') THEN
    CREATE POLICY "Members can manage guest list" ON public.guest_list
      FOR ALL USING (
        event_id IN (
          SELECT e.id FROM public.events e
          JOIN public.collective_members cm ON cm.collective_id = e.collective_id
          WHERE cm.user_id = auth.uid() AND cm.deleted_at IS NULL
        )
      );
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'guest_list' AND policyname = 'Service role manages guest list') THEN
    CREATE POLICY "Service role manages guest list" ON public.guest_list FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- STEP 17: PLAYBOOK TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.playbook_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collective_id UUID REFERENCES public.collectives(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  category      TEXT,
  tasks         JSONB,
  is_global     BOOLEAN DEFAULT false,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

ALTER TABLE public.playbook_templates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'playbook_templates' AND policyname = 'Service role manages playbook templates') THEN
    CREATE POLICY "Service role manages playbook templates" ON public.playbook_templates FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.playbook_task_templates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id           UUID NOT NULL REFERENCES public.playbook_templates(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  description           TEXT,
  default_assignee_role TEXT,
  due_offset_hours      INTEGER,
  position              INTEGER,
  metadata              JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.playbook_task_templates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'playbook_task_templates' AND policyname = 'Service role manages playbook task templates') THEN
    CREATE POLICY "Service role manages playbook task templates" ON public.playbook_task_templates FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- STEP 18: EVENT TASKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  assigned_to  UUID REFERENCES public.users(id),
  status       TEXT,
  priority     TEXT,
  due_at       TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

ALTER TABLE public.event_tasks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_tasks' AND policyname = 'Members can manage event tasks') THEN
    CREATE POLICY "Members can manage event tasks" ON public.event_tasks
      FOR ALL USING (
        event_id IN (
          SELECT e.id FROM public.events e
          JOIN public.collective_members cm ON cm.collective_id = e.collective_id
          WHERE cm.user_id = auth.uid() AND cm.deleted_at IS NULL
        )
      );
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_tasks' AND policyname = 'Service role manages event tasks') THEN
    CREATE POLICY "Service role manages event tasks" ON public.event_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- STEP 19: EXPENSES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  collective_id UUID NOT NULL REFERENCES public.collectives(id) ON DELETE CASCADE,
  amount        NUMERIC(10,2) NOT NULL,
  category      TEXT NOT NULL,
  description   TEXT,
  paid_by       TEXT,
  receipt_url   TEXT,
  currency      TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expenses' AND policyname = 'Members can manage expenses') THEN
    CREATE POLICY "Members can manage expenses" ON public.expenses
      FOR ALL USING (collective_id IN (SELECT collective_id FROM public.collective_members WHERE user_id = auth.uid() AND deleted_at IS NULL));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expenses' AND policyname = 'Service role manages expenses') THEN
    CREATE POLICY "Service role manages expenses" ON public.expenses FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- STEP 20: EVENT ACTIVITY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  description TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.event_activity ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_activity' AND policyname = 'Service role manages event activity') THEN
    CREATE POLICY "Service role manages event activity" ON public.event_activity FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- STEP 21: EVENT CARDS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_cards (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title      TEXT,
  content    TEXT,
  card_type  TEXT NOT NULL,
  position   INTEGER,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.event_cards ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_cards' AND policyname = 'Service role manages event cards') THEN
    CREATE POLICY "Service role manages event cards" ON public.event_cards FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- STEP 22: SETTLEMENT LINES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.settlement_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES public.settlements(id) ON DELETE CASCADE,
  description   TEXT NOT NULL,
  amount        NUMERIC(10,2) NOT NULL,
  category      TEXT,
  currency      TEXT NOT NULL DEFAULT 'cad',
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.settlement_lines ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'settlement_lines' AND policyname = 'Service role manages settlement lines') THEN
    CREATE POLICY "Service role manages settlement lines" ON public.settlement_lines FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- RPCs (claim_promo_code, fulfill_tickets_atomic, check_and_reserve_capacity)
-- are applied separately from the individual migration files.
