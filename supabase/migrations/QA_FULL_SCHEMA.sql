-- ============================================================================
-- NOCTURN — FULL CLEAN-SLATE SCHEMA
-- Run once on a fresh QA Supabase project (vtkvhdaadobigtojmztg).
-- Three-tier model: Master Data / Configuration Data / Transactional Data
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $func$ BEGIN CREATE TYPE party_type AS ENUM ('person','organization','venue'); EXCEPTION WHEN duplicate_object THEN NULL; END $func$;
DO $func$ BEGIN CREATE TYPE contact_method_type AS ENUM ('email','phone','instagram','soundcloud','spotify','website','twitter'); EXCEPTION WHEN duplicate_object THEN NULL; END $func$;
DO $func$ BEGIN CREATE TYPE party_role_type AS ENUM ('artist','collective','venue_operator','platform_user','contact'); EXCEPTION WHEN duplicate_object THEN NULL; END $func$;
DO $func$ BEGIN CREATE TYPE ticket_event_type AS ENUM ('purchased','transferred','checked_in','refunded','voided'); EXCEPTION WHEN duplicate_object THEN NULL; END $func$;
DO $func$ BEGIN CREATE TYPE event_status_type AS ENUM ('draft','published','cancelled','wrapped'); EXCEPTION WHEN duplicate_object THEN NULL; END $func$;
DO $func$ BEGIN CREATE TYPE order_status AS ENUM ('pending','paid','failed','refunded','partially_refunded'); EXCEPTION WHEN duplicate_object THEN NULL; END $func$;

-- ============================================================================
-- MASTER DATA: PARTIES
-- Universal identity record for every person, org, or venue in the system.
-- Never hard-deleted.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.parties (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         party_type NOT NULL,
  display_name TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parties_type ON public.parties(type);

ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_parties_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $func$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$func$;

DROP TRIGGER IF EXISTS parties_updated_at ON public.parties;
CREATE TRIGGER parties_updated_at
  BEFORE UPDATE ON public.parties
  FOR EACH ROW EXECUTE FUNCTION public.update_parties_updated_at();

-- ============================================================================
-- MASTER DATA: PARTY CONTACT METHODS
-- All contact info (email, phone, socials) lives here, keyed to a party.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.party_contact_methods (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id   UUID NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  type       contact_method_type NOT NULL,
  value      TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (party_id, type)
);

CREATE INDEX IF NOT EXISTS idx_party_contact_methods_party_id ON public.party_contact_methods(party_id);
CREATE INDEX IF NOT EXISTS idx_party_contact_methods_lookup ON public.party_contact_methods(party_id, type);

ALTER TABLE public.party_contact_methods ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CONFIGURATION: COLLECTIVES
-- An operational music collective. Links to a party for its identity.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.collectives (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id    UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  city        TEXT,
  bio         TEXT,
  logo_url    TEXT,
  cover_url   TEXT,
  vibe        TEXT,
  genre_tags  TEXT[] DEFAULT '{}',
  is_approved BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collectives_slug ON public.collectives(slug);
CREATE INDEX IF NOT EXISTS idx_collectives_party_id ON public.collectives(party_id) WHERE party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_collectives_approved ON public.collectives(is_approved) WHERE is_approved = true;

ALTER TABLE public.collectives ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- MASTER DATA: PARTY ROLES
-- A party can have multiple roles (artist, venue_operator, platform_user, etc.)
-- collective_id is set for roles scoped to a collective (e.g. collective member).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.party_roles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id      UUID NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  role          party_role_type NOT NULL,
  collective_id UUID REFERENCES public.collectives(id) ON DELETE CASCADE,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (party_id, role, collective_id)
);

CREATE INDEX IF NOT EXISTS idx_party_roles_party_id ON public.party_roles(party_id);
CREATE INDEX IF NOT EXISTS idx_party_roles_collective ON public.party_roles(collective_id) WHERE collective_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_party_roles_role ON public.party_roles(role);

ALTER TABLE public.party_roles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CONFIGURATION: USERS
-- App user accounts. id = auth.users.id. Links to a party for identity.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  party_id      UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  collective_id UUID REFERENCES public.collectives(id) ON DELETE SET NULL,
  email         TEXT NOT NULL,
  full_name     TEXT,
  avatar_url    TEXT,
  phone         TEXT,
  city          TEXT,
  bio           TEXT,
  is_approved   BOOLEAN NOT NULL DEFAULT false,
  is_denied     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_collective_id ON public.users(collective_id) WHERE collective_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_party_id ON public.users(party_id) WHERE party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CONFIGURATION: COLLECTIVE MEMBERS
-- Who belongs to which collective.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.collective_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collective_id UUID NOT NULL REFERENCES public.collectives(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  party_id      UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  role          TEXT NOT NULL DEFAULT 'member',
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  UNIQUE (collective_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_collective_members_collective_id ON public.collective_members(collective_id);
CREATE INDEX IF NOT EXISTS idx_collective_members_user_id ON public.collective_members(user_id);
CREATE INDEX IF NOT EXISTS idx_collective_members_party ON public.collective_members(party_id) WHERE party_id IS NOT NULL;

ALTER TABLE public.collective_members ENABLE ROW LEVEL SECURITY;

-- Core RLS helper — must exist before any policies that call it
CREATE OR REPLACE FUNCTION public.get_user_collectives()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER AS $func$
  SELECT collective_id FROM public.collective_members
  WHERE user_id = auth.uid() AND deleted_at IS NULL;
$func$;

CREATE OR REPLACE FUNCTION public.has_collective_role(p_collective_id UUID, p_role TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $func$
  SELECT EXISTS (
    SELECT 1 FROM public.collective_members
    WHERE collective_id = p_collective_id
      AND user_id = auth.uid()
      AND role = p_role
      AND deleted_at IS NULL
  );
$func$;

-- ============================================================================
-- MASTER DATA: ARTIST PROFILES
-- Artist-specific profile data. Replaces the old artists table.
-- One record per artist party. Never hard-deleted (use deleted_at).
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

CREATE OR REPLACE FUNCTION public.update_artist_profiles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $func$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$func$;

DROP TRIGGER IF EXISTS artist_profiles_updated_at ON public.artist_profiles;
CREATE TRIGGER artist_profiles_updated_at
  BEFORE UPDATE ON public.artist_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_artist_profiles_updated_at();

-- ============================================================================
-- MASTER DATA: VENUE PROFILES
-- Venue-specific profile data. Replaces the old venues table.
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

-- ============================================================================
-- MASTER DATA: ATTENDEE PROFILES
-- Engagement cache per person per collective. Tracks spend + event history.
-- user_id is nullable — guest checkouts have no account.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.attendee_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id      UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  user_id       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  collective_id UUID NOT NULL REFERENCES public.collectives(id) ON DELETE CASCADE,
  full_name     TEXT,
  email         TEXT,
  total_events  INTEGER NOT NULL DEFAULT 0,
  total_spend   NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_tickets INTEGER NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ,
  last_seen_at  TIMESTAMPTZ,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendee_profiles_collective_id ON public.attendee_profiles(collective_id);
CREATE INDEX IF NOT EXISTS idx_attendee_profiles_party_id ON public.attendee_profiles(party_id) WHERE party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendee_profiles_user_id ON public.attendee_profiles(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendee_profiles_email ON public.attendee_profiles(collective_id, email) WHERE email IS NOT NULL;

ALTER TABLE public.attendee_profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CONFIGURATION: EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collective_id  UUID NOT NULL REFERENCES public.collectives(id) ON DELETE CASCADE,
  venue_party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  slug           TEXT,
  description    TEXT,
  flyer_url      TEXT,
  starts_at      TIMESTAMPTZ NOT NULL,
  ends_at        TIMESTAMPTZ,
  doors_at       TIMESTAMPTZ,
  venue_name     TEXT,
  venue_address  TEXT,
  city           TEXT,
  capacity       INTEGER,
  status         TEXT NOT NULL DEFAULT 'draft',
  is_published   BOOLEAN NOT NULL DEFAULT false,
  is_free        BOOLEAN NOT NULL DEFAULT false,
  min_age        INTEGER,
  vibe_tags      TEXT[] DEFAULT '{}',
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_collective_id ON public.events(collective_id);
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON public.events(starts_at);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);
CREATE INDEX IF NOT EXISTS idx_events_venue_party_id ON public.events(venue_party_id) WHERE venue_party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_slug ON public.events(slug) WHERE slug IS NOT NULL;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CONFIGURATION: TICKET TIERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ticket_tiers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  price         NUMERIC(10,2) NOT NULL DEFAULT 0,
  capacity      INTEGER,
  tickets_sold  INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sale_start_at TIMESTAMPTZ,
  sale_end_at   TIMESTAMPTZ,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_tiers_event_id ON public.ticket_tiers(event_id);

ALTER TABLE public.ticket_tiers ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CONFIGURATION: PROMO CODES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.promo_codes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  code           TEXT NOT NULL,
  discount_type  TEXT NOT NULL DEFAULT 'percent',
  discount_value NUMERIC(10,2) NOT NULL,
  max_uses       INTEGER,
  starts_at      TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, code)
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_event_id ON public.promo_codes(event_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON public.promo_codes(code);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CONFIGURATION: EVENT ARTISTS (lineup)
-- party_id links to an artist_profiles party. name is denormalized for display.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_artists (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  party_id   UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  role       TEXT,
  set_time   TEXT,
  set_length INTEGER,
  fee        NUMERIC(10,2),
  notes      TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_artists_event_id ON public.event_artists(event_id);
CREATE INDEX IF NOT EXISTS idx_event_artists_party_id ON public.event_artists(party_id) WHERE party_id IS NOT NULL;

ALTER TABLE public.event_artists ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TRANSACTIONAL: ORDERS
-- Permanent purchase record. Never updated after creation (status transitions only).
-- ============================================================================

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

-- ============================================================================
-- TRANSACTIONAL: ORDER LINES
-- Line items per order. One row per tier per order.
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

-- ============================================================================
-- TRANSACTIONAL: TICKETS
-- Issued access rights. One row per seat. Holder changes on transfer.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_line_id   UUID REFERENCES public.order_lines(id) ON DELETE RESTRICT,
  tier_id         UUID NOT NULL REFERENCES public.ticket_tiers(id) ON DELETE RESTRICT,
  event_id        UUID NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  holder_party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  qr_code         TEXT UNIQUE,
  status          TEXT NOT NULL DEFAULT 'valid',
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_tier_id ON public.tickets(tier_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON public.tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_order_line_id ON public.tickets(order_line_id);
CREATE INDEX IF NOT EXISTS idx_tickets_holder_party_id ON public.tickets(holder_party_id) WHERE holder_party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_qr_code ON public.tickets(qr_code) WHERE qr_code IS NOT NULL;

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TRANSACTIONAL: TICKET EVENTS (lifecycle audit log)
-- Immutable record of every state change on a ticket.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ticket_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  event_type  ticket_event_type NOT NULL,
  party_id    UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata    JSONB
);

CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_id ON public.ticket_events(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_events_party_id ON public.ticket_events(party_id) WHERE party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_events_timeline ON public.ticket_events(ticket_id, occurred_at);

ALTER TABLE public.ticket_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TRANSACTIONAL: PAYMENT EVENTS (raw Stripe webhook log)
-- Source of truth for all payment activity.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payment_events (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                 UUID REFERENCES public.events(id) ON DELETE SET NULL,
  order_id                 UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  stripe_event_id          TEXT UNIQUE NOT NULL,
  stripe_payment_intent_id TEXT,
  event_type               TEXT NOT NULL,
  amount                   NUMERIC(10,2),
  currency                 TEXT,
  status                   TEXT,
  customer_email           TEXT,
  metadata                 JSONB,
  raw_payload              JSONB,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_event_id ON public.payment_events(event_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_order_id ON public.payment_events(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_stripe_pi ON public.payment_events(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_type ON public.payment_events(event_type);
CREATE INDEX IF NOT EXISTS idx_payment_events_created ON public.payment_events(created_at DESC);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TRANSACTIONAL: PROMO CODE USAGE
-- Replaces the old times_used counter. Immutable usage log.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.promo_code_usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  ticket_id     UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  party_id      UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  used_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (promo_code_id, ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_promo_code_usage_code ON public.promo_code_usage(promo_code_id);

ALTER TABLE public.promo_code_usage ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TRANSACTIONAL: EVENT STATUS LOG
-- Audit trail of event status transitions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_status_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  status      event_status_type NOT NULL,
  changed_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note        TEXT
);

CREATE INDEX IF NOT EXISTS idx_event_status_log_event ON public.event_status_log(event_id, occurred_at);

ALTER TABLE public.event_status_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TRANSACTIONAL: SETTLEMENTS
-- Financial summary per event. Derived from paid orders.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.settlements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  collective_id UUID NOT NULL REFERENCES public.collectives(id) ON DELETE RESTRICT,
  status        TEXT NOT NULL DEFAULT 'draft',
  total_revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
  platform_fee  NUMERIC(10,2) NOT NULL DEFAULT 0,
  stripe_fee    NUMERIC(10,2) NOT NULL DEFAULT 0,
  net_payout    NUMERIC(10,2) NOT NULL DEFAULT 0,
  finalized_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlements_event_id ON public.settlements(event_id);
CREATE INDEX IF NOT EXISTS idx_settlements_collective_id ON public.settlements(collective_id);

ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TRANSACTIONAL: SETTLEMENT LINES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.settlement_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES public.settlements(id) ON DELETE CASCADE,
  order_id      UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  ticket_id     UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  description   TEXT,
  amount        NUMERIC(10,2) NOT NULL,
  type          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_lines_settlement_id ON public.settlement_lines(settlement_id);

ALTER TABLE public.settlement_lines ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TRANSACTIONAL: PAYOUTS
-- Disbursements to collectives.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payouts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES public.settlements(id) ON DELETE RESTRICT,
  collective_id UUID NOT NULL REFERENCES public.collectives(id) ON DELETE RESTRICT,
  amount        NUMERIC(10,2) NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'cad',
  status        TEXT NOT NULL DEFAULT 'pending',
  method        TEXT,
  reference     TEXT,
  notes         TEXT,
  paid_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payouts_settlement_id ON public.payouts(settlement_id);
CREATE INDEX IF NOT EXISTS idx_payouts_collective_id ON public.payouts(collective_id);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CONFIGURATION: CHANNELS (team messaging)
-- collective_id nullable — supports direct message channels too.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.channels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collective_id UUID REFERENCES public.collectives(id) ON DELETE CASCADE,
  name          TEXT,
  type          TEXT NOT NULL DEFAULT 'group',
  created_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channels_collective_id ON public.channels(collective_id) WHERE collective_id IS NOT NULL;

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TRANSACTIONAL: MESSAGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  party_id   UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON public.messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON public.messages(channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.messages(user_id);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CONFIGURATION: CHANNEL MEMBERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.channel_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_members_channel_id ON public.channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_user_id ON public.channel_members(user_id);

ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CONFIGURATION: INVITATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collective_id UUID NOT NULL REFERENCES public.collectives(id) ON DELETE CASCADE,
  invited_by    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',
  token         TEXT UNIQUE NOT NULL,
  accepted_at   TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_collective_id ON public.invitations(collective_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations(email);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CONFIGURATION: SAVED VENUES
-- User's bookmarked venue profiles. References parties (type='venue').
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.saved_venues (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  venue_party_id UUID REFERENCES public.parties(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, venue_party_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_venues_user_id ON public.saved_venues(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_venues_venue_party_id ON public.saved_venues(venue_party_id);

ALTER TABLE public.saved_venues ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CONFIGURATION: EVENT EXPENSES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  description TEXT,
  amount      NUMERIC(10,2) NOT NULL,
  is_paid     BOOLEAN NOT NULL DEFAULT false,
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_expenses_event_id ON public.event_expenses(event_id);

ALTER TABLE public.event_expenses ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CONFIGURATION: EVENT TASKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  assigned_to  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'todo',
  due_at       TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_tasks_event_id ON public.event_tasks(event_id);

ALTER TABLE public.event_tasks ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TRANSACTIONAL: RECORDINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.recordings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  collective_id UUID NOT NULL REFERENCES public.collectives(id) ON DELETE CASCADE,
  title         TEXT,
  storage_path  TEXT NOT NULL,
  duration_secs INTEGER,
  transcript    TEXT,
  summary       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recordings_user_id ON public.recordings(user_id);
CREATE INDEX IF NOT EXISTS idx_recordings_collective_id ON public.recordings(collective_id);

ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CONFIGURATION: EMAIL CAMPAIGNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID REFERENCES public.events(id) ON DELETE CASCADE,
  collective_id UUID NOT NULL REFERENCES public.collectives(id) ON DELETE CASCADE,
  subject       TEXT NOT NULL,
  body          TEXT NOT NULL,
  sent_to       INTEGER NOT NULL DEFAULT 0,
  sent_at       TIMESTAMPTZ,
  created_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_event_id ON public.email_campaigns(event_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_collective_id ON public.email_campaigns(collective_id);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TRANSACTIONAL: EVENT ANALYTICS
-- Counters only. Incremented via function, never directly updated.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_analytics (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL UNIQUE REFERENCES public.events(id) ON DELETE CASCADE,
  page_views        INTEGER NOT NULL DEFAULT 0,
  unique_visitors   INTEGER NOT NULL DEFAULT 0,
  ticket_page_views INTEGER NOT NULL DEFAULT 0,
  shares            INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_analytics_event_id ON public.event_analytics(event_id);

ALTER TABLE public.event_analytics ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TRANSACTIONAL: EVENT ACTIVITY FEED
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  party_id    UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  description TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_activity_event_id ON public.event_activity(event_id);
CREATE INDEX IF NOT EXISTS idx_event_activity_created ON public.event_activity(event_id, created_at DESC);

ALTER TABLE public.event_activity ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CONFIGURATION: TICKET WAITLIST
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ticket_waitlist (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id      UUID NOT NULL REFERENCES public.ticket_tiers(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  name         TEXT,
  party_id     UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  notified_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tier_id, email)
);

CREATE INDEX IF NOT EXISTS idx_ticket_waitlist_tier_id ON public.ticket_waitlist(tier_id);

ALTER TABLE public.ticket_waitlist ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CONFIGURATION: GUEST LIST
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.guest_list (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  added_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  email      TEXT,
  party_id   UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  plus_ones  INTEGER NOT NULL DEFAULT 0,
  checked_in BOOLEAN NOT NULL DEFAULT false,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_list_event_id ON public.guest_list(event_id);

ALTER TABLE public.guest_list ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CONFIGURATION: EXTERNAL EVENTS (competitive intel)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.external_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collective_id UUID REFERENCES public.collectives(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  source        TEXT,
  source_url    TEXT,
  venue_name    TEXT,
  city          TEXT,
  starts_at     TIMESTAMPTZ,
  ticket_price  NUMERIC(10,2),
  metadata      JSONB,
  scraped_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_events_collective_id ON public.external_events(collective_id);
CREATE INDEX IF NOT EXISTS idx_external_events_starts_at ON public.external_events(starts_at);

ALTER TABLE public.external_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CONFIGURATION: PROMO LINKS + CLICKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.promo_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  code       TEXT NOT NULL UNIQUE,
  label      TEXT,
  clicks     INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promo_links_event_id ON public.promo_links(event_id);
CREATE INDEX IF NOT EXISTS idx_promo_links_code ON public.promo_links(code);

ALTER TABLE public.promo_links ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.promo_clicks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_link_id UUID NOT NULL REFERENCES public.promo_links(id) ON DELETE CASCADE,
  referrer      TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promo_clicks_promo_link_id ON public.promo_clicks(promo_link_id);

ALTER TABLE public.promo_clicks ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CONFIGURATION: EVENT CARDS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_cards (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  content    JSONB NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_cards_event_id ON public.event_cards(event_id);

ALTER TABLE public.event_cards ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CONFIGURATION: PLAYBOOK TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.playbook_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collective_id UUID REFERENCES public.collectives(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  is_global     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_playbook_templates_collective_id ON public.playbook_templates(collective_id);

ALTER TABLE public.playbook_templates ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.playbook_task_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.playbook_templates(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  due_offset  INTEGER,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_playbook_task_templates_template_id ON public.playbook_task_templates(template_id);

ALTER TABLE public.playbook_task_templates ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SYSTEM: RATE LIMITS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT NOT NULL UNIQUE,
  count      INTEGER NOT NULL DEFAULT 1,
  window_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON public.rate_limits(key);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.rate_limits(window_end);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SYSTEM: AUDIT LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  collective_id UUID REFERENCES public.collectives(id) ON DELETE SET NULL,
  event_id      UUID REFERENCES public.events(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  table_name    TEXT,
  record_id     UUID,
  old_data      JSONB,
  new_data      JSONB,
  ip_address    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_id ON public.audit_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SYSTEM: WEBHOOK EVENTS (Stripe deduplication)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type      TEXT NOT NULL,
  processed       BOOLEAN NOT NULL DEFAULT false,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_stripe_id ON public.webhook_events(stripe_event_id);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SYSTEM: WAITLIST ENTRIES (pre-launch signup)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.waitlist_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  name       TEXT,
  city       TEXT,
  referral   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS public.check_and_reserve_capacity(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.acquire_ticket_lock(UUID);
DROP FUNCTION IF EXISTS public.fulfill_tickets_atomic(UUID, UUID, INTEGER, UUID, UUID);
DROP FUNCTION IF EXISTS public.increment_analytics_counter(UUID, TEXT);
DROP FUNCTION IF EXISTS public.increment_attendee_profile(UUID, UUID, TEXT, TEXT, INTEGER, NUMERIC);
DROP FUNCTION IF EXISTS public.track_ticket_sale(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.track_ticket_refund(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.claim_promo_code(TEXT, UUID);
DROP FUNCTION IF EXISTS public.increment_promo_click(TEXT);

-- Atomic capacity check + reserve
CREATE OR REPLACE FUNCTION public.check_and_reserve_capacity(
  p_tier_id UUID,
  p_quantity INTEGER
) RETURNS BOOLEAN LANGUAGE plpgsql AS $func$
DECLARE
  v_capacity INTEGER;
  v_sold     INTEGER;
BEGIN
  SELECT capacity, tickets_sold INTO v_capacity, v_sold
  FROM public.ticket_tiers WHERE id = p_tier_id FOR UPDATE;
  IF v_capacity IS NULL THEN RETURN TRUE; END IF;
  IF v_sold + p_quantity > v_capacity THEN RETURN FALSE; END IF;
  UPDATE public.ticket_tiers SET tickets_sold = tickets_sold + p_quantity WHERE id = p_tier_id;
  RETURN TRUE;
END;
$func$;

-- Advisory lock per tier (prevents double-sell race)
CREATE OR REPLACE FUNCTION public.acquire_ticket_lock(p_tier_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $func$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_tier_id::text));
END;
$func$;

-- Issue tickets atomically
CREATE OR REPLACE FUNCTION public.fulfill_tickets_atomic(
  p_tier_id        UUID,
  p_order_line_id  UUID,
  p_quantity       INTEGER,
  p_holder_party_id UUID,
  p_event_id       UUID
) RETURNS SETOF public.tickets LANGUAGE plpgsql AS $func$
DECLARE
  v_ticket public.tickets;
  i        INTEGER;
BEGIN
  PERFORM public.acquire_ticket_lock(p_tier_id);
  IF NOT public.check_and_reserve_capacity(p_tier_id, p_quantity) THEN
    RAISE EXCEPTION 'Insufficient capacity for tier %', p_tier_id;
  END IF;
  FOR i IN 1..p_quantity LOOP
    INSERT INTO public.tickets (order_line_id, tier_id, event_id, holder_party_id, qr_code, status)
    VALUES (p_order_line_id, p_tier_id, p_event_id, p_holder_party_id, gen_random_uuid()::text, 'valid')
    RETURNING * INTO v_ticket;
    RETURN NEXT v_ticket;
  END LOOP;
END;
$func$;

-- Increment event analytics counter by field name
CREATE OR REPLACE FUNCTION public.increment_analytics_counter(
  p_event_id UUID,
  p_field    TEXT
) RETURNS VOID LANGUAGE plpgsql AS $func$
BEGIN
  INSERT INTO public.event_analytics (event_id) VALUES (p_event_id)
  ON CONFLICT (event_id) DO NOTHING;
  EXECUTE format(
    'UPDATE public.event_analytics SET %I = %I + 1, updated_at = now() WHERE event_id = $1',
    p_field, p_field
  ) USING p_event_id;
END;
$func$;

-- Upsert attendee profile stats
CREATE OR REPLACE FUNCTION public.increment_attendee_profile(
  p_collective_id UUID,
  p_party_id      UUID,
  p_email         TEXT,
  p_name          TEXT,
  p_ticket_count  INTEGER,
  p_spend         NUMERIC
) RETURNS VOID LANGUAGE plpgsql AS $func$
BEGIN
  -- Try to update existing record by party_id first
  IF p_party_id IS NOT NULL THEN
    UPDATE public.attendee_profiles SET
      total_tickets = total_tickets + p_ticket_count,
      total_spend   = total_spend + p_spend,
      total_events  = total_events + 1,
      last_seen_at  = now(),
      updated_at    = now()
    WHERE collective_id = p_collective_id AND party_id = p_party_id;
    IF FOUND THEN RETURN; END IF;
  END IF;
  -- Fall back to email match
  IF p_email IS NOT NULL THEN
    UPDATE public.attendee_profiles SET
      total_tickets = total_tickets + p_ticket_count,
      total_spend   = total_spend + p_spend,
      total_events  = total_events + 1,
      last_seen_at  = now(),
      updated_at    = now(),
      party_id      = COALESCE(party_id, p_party_id)
    WHERE collective_id = p_collective_id AND email = p_email;
    IF FOUND THEN RETURN; END IF;
  END IF;
  -- Insert new
  INSERT INTO public.attendee_profiles (
    collective_id, party_id, email, full_name,
    total_tickets, total_spend, total_events,
    first_seen_at, last_seen_at
  ) VALUES (
    p_collective_id, p_party_id, p_email, p_name,
    p_ticket_count, p_spend, 1,
    now(), now()
  );
END;
$func$;

CREATE OR REPLACE FUNCTION public.track_ticket_sale(p_tier_id UUID, p_quantity INTEGER)
RETURNS VOID LANGUAGE plpgsql AS $func$
BEGIN
  UPDATE public.ticket_tiers SET tickets_sold = tickets_sold + p_quantity WHERE id = p_tier_id;
END;
$func$;

CREATE OR REPLACE FUNCTION public.track_ticket_refund(p_tier_id UUID, p_quantity INTEGER)
RETURNS VOID LANGUAGE plpgsql AS $func$
BEGIN
  UPDATE public.ticket_tiers
  SET tickets_sold = GREATEST(0, tickets_sold - p_quantity)
  WHERE id = p_tier_id;
END;
$func$;

CREATE OR REPLACE FUNCTION public.claim_promo_code(p_code TEXT, p_event_id UUID)
RETURNS public.promo_codes LANGUAGE plpgsql AS $func$
DECLARE
  v_promo       public.promo_codes;
  v_usage_count INTEGER;
BEGIN
  SELECT * INTO v_promo FROM public.promo_codes
  WHERE code = p_code AND event_id = p_event_id AND is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (expires_at IS NULL OR expires_at > now())
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Promo code not found or expired'; END IF;
  IF v_promo.max_uses IS NOT NULL THEN
    SELECT COUNT(*) INTO v_usage_count
    FROM public.promo_code_usage WHERE promo_code_id = v_promo.id;
    IF v_usage_count >= v_promo.max_uses THEN
      RAISE EXCEPTION 'Promo code max uses reached';
    END IF;
  END IF;
  RETURN v_promo;
END;
$func$;

CREATE OR REPLACE FUNCTION public.increment_promo_click(p_code TEXT)
RETURNS VOID LANGUAGE plpgsql AS $func$
BEGIN
  UPDATE public.promo_links SET clicks = clicks + 1 WHERE code = p_code;
END;
$func$;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- parties
CREATE POLICY "parties_select" ON public.parties FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.party_roles pr WHERE pr.party_id = parties.id AND pr.role = 'platform_user')
    OR EXISTS (
      SELECT 1 FROM public.party_roles pr
      JOIN public.collective_members cm ON cm.collective_id = pr.collective_id
      WHERE pr.party_id = parties.id AND cm.user_id = auth.uid() AND cm.deleted_at IS NULL
    )
  );
CREATE POLICY "parties_service_role" ON public.parties FOR ALL TO service_role USING (true) WITH CHECK (true);

-- party_contact_methods
CREATE POLICY "party_contact_methods_select" ON public.party_contact_methods FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parties p WHERE p.id = party_contact_methods.party_id));
CREATE POLICY "party_contact_methods_service_role" ON public.party_contact_methods FOR ALL TO service_role USING (true) WITH CHECK (true);

-- party_roles
CREATE POLICY "party_roles_select" ON public.party_roles FOR SELECT TO authenticated
  USING (collective_id IS NULL OR collective_id IN (SELECT get_user_collectives()));
CREATE POLICY "party_roles_service_role" ON public.party_roles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- collectives
CREATE POLICY "collectives_select" ON public.collectives FOR SELECT TO authenticated USING (true);
CREATE POLICY "collectives_service_role" ON public.collectives FOR ALL TO service_role USING (true) WITH CHECK (true);

-- users
CREATE POLICY "users_select_own" ON public.users FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "users_select_collective" ON public.users FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()));
CREATE POLICY "users_update_own" ON public.users FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "users_service_role" ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);

-- collective_members
CREATE POLICY "collective_members_select" ON public.collective_members FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()));
CREATE POLICY "collective_members_service_role" ON public.collective_members FOR ALL TO service_role USING (true) WITH CHECK (true);

-- artist_profiles (public read if active)
CREATE POLICY "artist_profiles_public_select" ON public.artist_profiles
  FOR SELECT USING (is_active = true AND deleted_at IS NULL);
CREATE POLICY "artist_profiles_service_role" ON public.artist_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- venue_profiles (public read if active)
CREATE POLICY "venue_profiles_public_select" ON public.venue_profiles
  FOR SELECT USING (is_active = true);
CREATE POLICY "venue_profiles_service_role" ON public.venue_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- attendee_profiles
CREATE POLICY "attendee_profiles_select" ON public.attendee_profiles FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()));
CREATE POLICY "attendee_profiles_service_role" ON public.attendee_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- events
CREATE POLICY "events_select_published" ON public.events FOR SELECT USING (is_published = true);
CREATE POLICY "events_select_collective" ON public.events FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()));
CREATE POLICY "events_service_role" ON public.events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ticket_tiers
CREATE POLICY "ticket_tiers_select_public" ON public.ticket_tiers FOR SELECT
  USING (event_id IN (SELECT id FROM public.events WHERE is_published = true));
CREATE POLICY "ticket_tiers_select_collective" ON public.ticket_tiers FOR SELECT TO authenticated
  USING (event_id IN (SELECT id FROM public.events WHERE collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "ticket_tiers_service_role" ON public.ticket_tiers FOR ALL TO service_role USING (true) WITH CHECK (true);

-- promo_codes
CREATE POLICY "promo_codes_select" ON public.promo_codes FOR SELECT TO authenticated
  USING (event_id IN (SELECT id FROM public.events WHERE collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "promo_codes_service_role" ON public.promo_codes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- event_artists
CREATE POLICY "event_artists_select_public" ON public.event_artists FOR SELECT
  USING (event_id IN (SELECT id FROM public.events WHERE is_published = true));
CREATE POLICY "event_artists_select_collective" ON public.event_artists FOR SELECT TO authenticated
  USING (event_id IN (SELECT id FROM public.events WHERE collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "event_artists_service_role" ON public.event_artists FOR ALL TO service_role USING (true) WITH CHECK (true);

-- orders
CREATE POLICY "orders_select" ON public.orders FOR SELECT TO authenticated
  USING (event_id IN (SELECT e.id FROM public.events e WHERE e.collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "orders_service_role" ON public.orders FOR ALL TO service_role USING (true) WITH CHECK (true);

-- order_lines
CREATE POLICY "order_lines_select" ON public.order_lines FOR SELECT TO authenticated
  USING (order_id IN (
    SELECT o.id FROM public.orders o
    JOIN public.events e ON e.id = o.event_id
    WHERE e.collective_id IN (SELECT get_user_collectives())
  ));
CREATE POLICY "order_lines_service_role" ON public.order_lines FOR ALL TO service_role USING (true) WITH CHECK (true);

-- tickets
CREATE POLICY "tickets_select" ON public.tickets FOR SELECT TO authenticated
  USING (event_id IN (SELECT e.id FROM public.events e WHERE e.collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "tickets_service_role" ON public.tickets FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ticket_events
CREATE POLICY "ticket_events_select" ON public.ticket_events FOR SELECT TO authenticated
  USING (ticket_id IN (
    SELECT t.id FROM public.tickets t
    JOIN public.events e ON e.id = t.event_id
    WHERE e.collective_id IN (SELECT get_user_collectives())
  ));
CREATE POLICY "ticket_events_service_role" ON public.ticket_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- payment_events
CREATE POLICY "payment_events_select" ON public.payment_events FOR SELECT TO authenticated
  USING (event_id IN (SELECT e.id FROM public.events e WHERE e.collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "payment_events_service_role" ON public.payment_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- promo_code_usage
CREATE POLICY "promo_code_usage_select" ON public.promo_code_usage FOR SELECT TO authenticated
  USING (promo_code_id IN (
    SELECT pc.id FROM public.promo_codes pc
    JOIN public.events e ON e.id = pc.event_id
    WHERE e.collective_id IN (SELECT get_user_collectives())
  ));
CREATE POLICY "promo_code_usage_service_role" ON public.promo_code_usage FOR ALL TO service_role USING (true) WITH CHECK (true);

-- event_status_log
CREATE POLICY "event_status_log_select" ON public.event_status_log FOR SELECT TO authenticated
  USING (event_id IN (SELECT e.id FROM public.events e WHERE e.collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "event_status_log_service_role" ON public.event_status_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- settlements
CREATE POLICY "settlements_select" ON public.settlements FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()));
CREATE POLICY "settlements_service_role" ON public.settlements FOR ALL TO service_role USING (true) WITH CHECK (true);

-- settlement_lines
CREATE POLICY "settlement_lines_select" ON public.settlement_lines FOR SELECT TO authenticated
  USING (settlement_id IN (
    SELECT s.id FROM public.settlements s WHERE s.collective_id IN (SELECT get_user_collectives())
  ));
CREATE POLICY "settlement_lines_service_role" ON public.settlement_lines FOR ALL TO service_role USING (true) WITH CHECK (true);

-- payouts
CREATE POLICY "payouts_select" ON public.payouts FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()));
CREATE POLICY "payouts_service_role" ON public.payouts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- channels
CREATE POLICY "channels_select" ON public.channels FOR SELECT TO authenticated
  USING (
    collective_id IN (SELECT get_user_collectives())
    OR id IN (SELECT channel_id FROM public.channel_members WHERE user_id = auth.uid())
  );
CREATE POLICY "channels_service_role" ON public.channels FOR ALL TO service_role USING (true) WITH CHECK (true);

-- messages
CREATE POLICY "messages_select" ON public.messages FOR SELECT TO authenticated
  USING (channel_id IN (
    SELECT c.id FROM public.channels c WHERE c.collective_id IN (SELECT get_user_collectives())
    UNION
    SELECT channel_id FROM public.channel_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "messages_insert" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "messages_service_role" ON public.messages FOR ALL TO service_role USING (true) WITH CHECK (true);

-- channel_members
CREATE POLICY "channel_members_select" ON public.channel_members FOR SELECT TO authenticated
  USING (channel_id IN (SELECT channel_id FROM public.channel_members WHERE user_id = auth.uid()));
CREATE POLICY "channel_members_service_role" ON public.channel_members FOR ALL TO service_role USING (true) WITH CHECK (true);

-- invitations
CREATE POLICY "invitations_select" ON public.invitations FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()));
CREATE POLICY "invitations_service_role" ON public.invitations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- saved_venues
CREATE POLICY "saved_venues_select" ON public.saved_venues FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "saved_venues_insert" ON public.saved_venues FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "saved_venues_delete" ON public.saved_venues FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "saved_venues_service_role" ON public.saved_venues FOR ALL TO service_role USING (true) WITH CHECK (true);

-- event_expenses
CREATE POLICY "event_expenses_select" ON public.event_expenses FOR SELECT TO authenticated
  USING (event_id IN (SELECT e.id FROM public.events e WHERE e.collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "event_expenses_service_role" ON public.event_expenses FOR ALL TO service_role USING (true) WITH CHECK (true);

-- event_tasks
CREATE POLICY "event_tasks_select" ON public.event_tasks FOR SELECT TO authenticated
  USING (event_id IN (SELECT e.id FROM public.events e WHERE e.collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "event_tasks_service_role" ON public.event_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- recordings
CREATE POLICY "recordings_select" ON public.recordings FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()));
CREATE POLICY "recordings_service_role" ON public.recordings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- email_campaigns
CREATE POLICY "email_campaigns_select" ON public.email_campaigns FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()));
CREATE POLICY "email_campaigns_service_role" ON public.email_campaigns FOR ALL TO service_role USING (true) WITH CHECK (true);

-- event_analytics (public + collective)
CREATE POLICY "event_analytics_public" ON public.event_analytics FOR SELECT USING (true);
CREATE POLICY "event_analytics_service_role" ON public.event_analytics FOR ALL TO service_role USING (true) WITH CHECK (true);

-- event_activity
CREATE POLICY "event_activity_select" ON public.event_activity FOR SELECT TO authenticated
  USING (event_id IN (SELECT e.id FROM public.events e WHERE e.collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "event_activity_service_role" ON public.event_activity FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ticket_waitlist
CREATE POLICY "ticket_waitlist_select" ON public.ticket_waitlist FOR SELECT TO authenticated
  USING (tier_id IN (
    SELECT tt.id FROM public.ticket_tiers tt
    JOIN public.events e ON e.id = tt.event_id
    WHERE e.collective_id IN (SELECT get_user_collectives())
  ));
CREATE POLICY "ticket_waitlist_service_role" ON public.ticket_waitlist FOR ALL TO service_role USING (true) WITH CHECK (true);

-- guest_list
CREATE POLICY "guest_list_select" ON public.guest_list FOR SELECT TO authenticated
  USING (event_id IN (SELECT e.id FROM public.events e WHERE e.collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "guest_list_service_role" ON public.guest_list FOR ALL TO service_role USING (true) WITH CHECK (true);

-- external_events
CREATE POLICY "external_events_select" ON public.external_events FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()) OR collective_id IS NULL);
CREATE POLICY "external_events_service_role" ON public.external_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- promo_links
CREATE POLICY "promo_links_select" ON public.promo_links FOR SELECT TO authenticated
  USING (event_id IN (SELECT e.id FROM public.events e WHERE e.collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "promo_links_service_role" ON public.promo_links FOR ALL TO service_role USING (true) WITH CHECK (true);

-- promo_clicks
CREATE POLICY "promo_clicks_select" ON public.promo_clicks FOR SELECT TO authenticated
  USING (promo_link_id IN (
    SELECT pl.id FROM public.promo_links pl
    JOIN public.events e ON e.id = pl.event_id
    WHERE e.collective_id IN (SELECT get_user_collectives())
  ));
CREATE POLICY "promo_clicks_service_role" ON public.promo_clicks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- event_cards
CREATE POLICY "event_cards_select_public" ON public.event_cards FOR SELECT
  USING (event_id IN (SELECT id FROM public.events WHERE is_published = true));
CREATE POLICY "event_cards_select_collective" ON public.event_cards FOR SELECT TO authenticated
  USING (event_id IN (SELECT e.id FROM public.events e WHERE e.collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "event_cards_service_role" ON public.event_cards FOR ALL TO service_role USING (true) WITH CHECK (true);

-- playbook_templates
CREATE POLICY "playbook_templates_select" ON public.playbook_templates FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()) OR is_global = true);
CREATE POLICY "playbook_templates_service_role" ON public.playbook_templates FOR ALL TO service_role USING (true) WITH CHECK (true);

-- playbook_task_templates
CREATE POLICY "playbook_task_templates_select" ON public.playbook_task_templates FOR SELECT TO authenticated
  USING (template_id IN (
    SELECT id FROM public.playbook_templates
    WHERE collective_id IN (SELECT get_user_collectives()) OR is_global = true
  ));
CREATE POLICY "playbook_task_templates_service_role" ON public.playbook_task_templates FOR ALL TO service_role USING (true) WITH CHECK (true);

-- rate_limits (service role only)
CREATE POLICY "rate_limits_service_role" ON public.rate_limits FOR ALL TO service_role USING (true) WITH CHECK (true);

-- audit_logs
CREATE POLICY "audit_logs_select" ON public.audit_logs FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()));
CREATE POLICY "audit_logs_service_role" ON public.audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- webhook_events (service role only)
CREATE POLICY "webhook_events_service_role" ON public.webhook_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- waitlist_entries (service role only)
CREATE POLICY "waitlist_entries_service_role" ON public.waitlist_entries FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- REALTIME
-- ============================================================================

DO $func$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;        EXCEPTION WHEN duplicate_object THEN NULL; END $func$;
DO $func$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_events; EXCEPTION WHEN duplicate_object THEN NULL; END $func$;
DO $func$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;      EXCEPTION WHEN duplicate_object THEN NULL; END $func$;
DO $func$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.event_activity; EXCEPTION WHEN duplicate_object THEN NULL; END $func$;
