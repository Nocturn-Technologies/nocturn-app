-- Full entity architecture redesign — schema changes only.
-- Prod data is intentionally dropped (approved by co-founder).
-- Data will be re-entered through the app against the new schema.
--
-- Three-tier data model:
--   Master data        — parties, party_contact_methods, party_roles
--   Configuration data — ticket_tiers, promo_codes, channels (minor changes only)
--   Transactional data — ticket_events, event_status_log, promo_code_usage (new)

-- ============================================================
-- STEP 1: ENUMS
-- ============================================================

CREATE TYPE party_type AS ENUM ('person', 'organization', 'venue');

CREATE TYPE contact_method_type AS ENUM (
  'email', 'phone', 'instagram', 'soundcloud', 'spotify', 'website', 'twitter'
);

CREATE TYPE party_role_type AS ENUM (
  'artist', 'collective', 'venue_operator', 'platform_user', 'contact'
);

CREATE TYPE ticket_event_type AS ENUM (
  'purchased', 'transferred', 'checked_in', 'refunded', 'voided'
);

CREATE TYPE event_status_type AS ENUM (
  'draft', 'published', 'cancelled', 'wrapped'
);

-- ============================================================
-- STEP 2: MASTER DATA TABLES
-- ============================================================

CREATE TABLE public.parties (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         party_type NOT NULL,
  display_name TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.party_contact_methods (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id   UUID NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  type       contact_method_type NOT NULL,
  value      TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (party_id, type)
);

CREATE TABLE public.party_roles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id      UUID NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  role          party_role_type NOT NULL,
  collective_id UUID REFERENCES public.collectives(id) ON DELETE CASCADE,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (party_id, role, collective_id)
);

CREATE INDEX idx_parties_type ON public.parties (type);
CREATE INDEX idx_party_contact_methods_party_id ON public.party_contact_methods (party_id);
CREATE INDEX idx_party_contact_methods_lookup ON public.party_contact_methods (party_id, type);
CREATE INDEX idx_party_roles_party_id ON public.party_roles (party_id);
CREATE INDEX idx_party_roles_collective ON public.party_roles (collective_id) WHERE collective_id IS NOT NULL;
CREATE INDEX idx_party_roles_role ON public.party_roles (role);

-- ============================================================
-- STEP 3: TRANSACTIONAL LIFECYCLE TABLES
-- ============================================================

CREATE TABLE public.ticket_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  event_type  ticket_event_type NOT NULL,
  party_id    UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata    JSONB
);

CREATE INDEX idx_ticket_events_ticket_id ON public.ticket_events (ticket_id);
CREATE INDEX idx_ticket_events_party_id  ON public.ticket_events (party_id) WHERE party_id IS NOT NULL;
CREATE INDEX idx_ticket_events_timeline  ON public.ticket_events (ticket_id, occurred_at);

CREATE TABLE public.event_status_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  status      event_status_type NOT NULL,
  changed_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note        TEXT
);

CREATE INDEX idx_event_status_log_event ON public.event_status_log (event_id, occurred_at);

CREATE TABLE public.promo_code_usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  ticket_id     UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  party_id      UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  used_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (promo_code_id, ticket_id)
);

CREATE INDEX idx_promo_code_usage_code ON public.promo_code_usage (promo_code_id);

-- ============================================================
-- STEP 4: ADD party_id FKs TO EXISTING TABLES
-- IF EXISTS guards allow this to run on partially-populated schemas (e.g. QA).
-- ============================================================

ALTER TABLE IF EXISTS public.artists          ADD COLUMN IF NOT EXISTS party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.collectives       ADD COLUMN IF NOT EXISTS party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.venues            ADD COLUMN IF NOT EXISTS party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.contacts          ADD COLUMN IF NOT EXISTS party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.users             ADD COLUMN IF NOT EXISTS party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.marketplace_profiles ADD COLUMN IF NOT EXISTS party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.collective_members   ADD COLUMN IF NOT EXISTS party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.event_artists        ADD COLUMN IF NOT EXISTS party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.events               ADD COLUMN IF NOT EXISTS venue_party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_artists_party_id          ON public.artists (party_id) WHERE party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_collectives_party_id      ON public.collectives (party_id) WHERE party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venues_party_id           ON public.venues (party_id) WHERE party_id IS NOT NULL;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='contacts') THEN CREATE INDEX IF NOT EXISTS idx_contacts_party_id ON public.contacts (party_id) WHERE party_id IS NOT NULL; END IF; END $$;
CREATE INDEX IF NOT EXISTS idx_users_party_id            ON public.users (party_id) WHERE party_id IS NOT NULL;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='marketplace_profiles') THEN CREATE INDEX IF NOT EXISTS idx_mp_party_id ON public.marketplace_profiles (party_id) WHERE party_id IS NOT NULL; END IF; END $$;
CREATE INDEX IF NOT EXISTS idx_collective_members_party  ON public.collective_members (party_id) WHERE party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_artists_party_id    ON public.event_artists (party_id) WHERE party_id IS NOT NULL;

-- ============================================================
-- STEP 5: DROP REDUNDANT SOCIAL COLUMNS
-- Replaced by party_contact_methods.
-- ============================================================

ALTER TABLE IF EXISTS public.artists          DROP COLUMN IF EXISTS instagram, DROP COLUMN IF EXISTS soundcloud;
ALTER TABLE IF EXISTS public.collectives       DROP COLUMN IF EXISTS instagram, DROP COLUMN IF EXISTS website;
ALTER TABLE IF EXISTS public.venues            DROP COLUMN IF EXISTS instagram, DROP COLUMN IF EXISTS website;
ALTER TABLE IF EXISTS public.contacts          DROP COLUMN IF EXISTS instagram;
ALTER TABLE IF EXISTS public.marketplace_profiles DROP COLUMN IF EXISTS instagram_handle,
                                                  DROP COLUMN IF EXISTS soundcloud_url,
                                                  DROP COLUMN IF EXISTS website_url;

-- Drop usage counter — replaced by promo_code_usage table
ALTER TABLE IF EXISTS public.promo_codes DROP COLUMN IF EXISTS times_used;

-- ============================================================
-- STEP 6: DIRECT MESSAGE CHANNEL SUPPORT
-- Make collective_id nullable so direct channels have no collective owner.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'channels' AND column_name = 'collective_id') THEN
    ALTER TABLE public.channels ALTER COLUMN collective_id DROP NOT NULL;
  END IF;
END $$;

-- ============================================================
-- STEP 7: updated_at TRIGGER FOR parties
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_parties_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER parties_updated_at
  BEFORE UPDATE ON public.parties
  FOR EACH ROW EXECUTE FUNCTION public.update_parties_updated_at();

-- ============================================================
-- STEP 8: RLS
-- ============================================================

ALTER TABLE public.parties              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_contact_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_roles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_status_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_code_usage     ENABLE ROW LEVEL SECURITY;

-- parties: visible when the party has a platform_user role (public) OR shares a collective with the user
CREATE POLICY "parties_select" ON public.parties FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.party_roles pr WHERE pr.party_id = parties.id AND pr.role = 'platform_user')
    OR
    EXISTS (
      SELECT 1 FROM public.party_roles pr
      JOIN public.collective_members cm ON cm.collective_id = pr.collective_id
      WHERE pr.party_id = parties.id AND cm.user_id = auth.uid() AND cm.deleted_at IS NULL
    )
  );

CREATE POLICY "parties_service_role" ON public.parties
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- party_contact_methods: follows party visibility
CREATE POLICY "party_contact_methods_select" ON public.party_contact_methods FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.parties p WHERE p.id = party_contact_methods.party_id
    )
  );

CREATE POLICY "party_contact_methods_service_role" ON public.party_contact_methods
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- party_roles: collective-scoped roles visible to that collective's members; null-collective roles visible to all
CREATE POLICY "party_roles_select" ON public.party_roles FOR SELECT TO authenticated
  USING (
    collective_id IS NULL
    OR collective_id IN (SELECT get_user_collectives())
  );

CREATE POLICY "party_roles_service_role" ON public.party_roles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ticket_events: visible to collective members of the ticket's event
CREATE POLICY "ticket_events_select" ON public.ticket_events FOR SELECT TO authenticated
  USING (
    ticket_id IN (
      SELECT t.id FROM public.tickets t
      JOIN public.events e ON e.id = t.event_id
      WHERE e.collective_id IN (SELECT get_user_collectives())
    )
  );

CREATE POLICY "ticket_events_service_role" ON public.ticket_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- event_status_log: visible to collective members of the event
CREATE POLICY "event_status_log_select" ON public.event_status_log FOR SELECT TO authenticated
  USING (event_id IN (SELECT e.id FROM public.events e WHERE e.collective_id IN (SELECT get_user_collectives())));

CREATE POLICY "event_status_log_service_role" ON public.event_status_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- promo_code_usage: visible to collective members of the promo code's event
CREATE POLICY "promo_code_usage_select" ON public.promo_code_usage FOR SELECT TO authenticated
  USING (
    promo_code_id IN (
      SELECT pc.id FROM public.promo_codes pc
      JOIN public.events e ON e.id = pc.event_id
      WHERE e.collective_id IN (SELECT get_user_collectives())
    )
  );

CREATE POLICY "promo_code_usage_service_role" ON public.promo_code_usage
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- STEP 9: REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_events;
