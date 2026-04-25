-- ═══════════════════════════════════════════════════════════════════════
-- NOC-50: Recreate rsvps table on QA after entity-architecture rebuild
-- ═══════════════════════════════════════════════════════════════════════
--
-- Tier: config (mutable until activity begins — RSVPs change status)
--
-- The original rsvps table from 20260410000001_host_rsvps_updates.sql was
-- dropped (or never recreated) by the 20260419000003 entity-architecture
-- rebuild, even though the migration tracker still shows the host_rsvps
-- migration as applied. The application code in src/app/actions/rsvps.ts
-- still references the table — every RSVP submit on QA fails with
-- "Failed to submit RSVP" until this lands.
--
-- Differences from the original schema:
--   1. Added `phone TEXT` column to support the phone-optional UX from
--      PR #141 (writes either trimmed phone or NULL).
--   2. Added `holder_party_id UUID REFERENCES parties(id)` to align with
--      the entity-architecture parties model. Used as the upsert conflict
--      key for logged-in users; email stays as the conflict key for guests.
--   3. Kept all original RLS policies + indexes.
--
-- Governance references:
--   §1  Tier declared above (config — mutable status)
--   §3  Identity via parties model (holder_party_id, not duplicate user table)
--   §7  Checklist: tier ✅ RLS ✅ created_at ✅ FK indexes ✅ rollback ✅
--   §9  snake_case, _at suffix on timestamps, party_id semantic FK name
--
-- Rollback: 20260426000001_recreate_rsvps_table.rollback.sql
-- Linear: NOC-50

BEGIN;

-- ─── Table ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,

  -- Identity: either a logged-in user (via parties) or a guest (via email).
  -- The user_or_email check below enforces at least one.
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  holder_party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  email TEXT,
  full_name TEXT,
  phone TEXT, -- Optional per PR #141 — operators can collect SMS later.

  status TEXT NOT NULL CHECK (status IN ('yes', 'maybe', 'no')),
  plus_ones INTEGER NOT NULL DEFAULT 0 CHECK (plus_ones >= 0 AND plus_ones <= 10),
  message TEXT,

  -- Used by the email deep-link flow so a guest can change their RSVP
  -- without logging in. Random 32-byte hex token.
  access_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex') UNIQUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Either a registered user (via auth + party) or a guest with an email.
  -- Submitting with no identity at all isn't allowed.
  CONSTRAINT rsvps_user_or_email CHECK (
    user_id IS NOT NULL OR holder_party_id IS NOT NULL OR email IS NOT NULL
  ),

  -- One RSVP per logged-in party per event (used by the upsert in submitRsvp
  -- when holder_party_id is set).
  CONSTRAINT rsvps_unique_party UNIQUE (event_id, holder_party_id),
  -- One RSVP per email per event for guests (used when holder_party_id is null).
  CONSTRAINT rsvps_unique_email UNIQUE (event_id, email)
);

-- ─── Indexes ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rsvps_event_id ON public.rsvps (event_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_user_id ON public.rsvps (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rsvps_holder_party_id ON public.rsvps (holder_party_id) WHERE holder_party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rsvps_event_status ON public.rsvps (event_id, status);

-- ─── Updated-at trigger ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS rsvps_updated_at ON public.rsvps;
CREATE TRIGGER rsvps_updated_at
  BEFORE UPDATE ON public.rsvps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── Row-Level Security ─────────────────────────────────────────────────
ALTER TABLE public.rsvps ENABLE ROW LEVEL SECURITY;

-- Anyone (logged-in or anonymous) can submit an RSVP. Guests provide email,
-- members hit the upsert via party id. Server actions use the admin client
-- so RLS on insert is permissive — the action validates inputs.
DROP POLICY IF EXISTS "rsvps_insert_public" ON public.rsvps;
CREATE POLICY "rsvps_insert_public" ON public.rsvps
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Logged-in users can update or delete their own RSVPs by user_id match.
DROP POLICY IF EXISTS "rsvps_update_own" ON public.rsvps;
CREATE POLICY "rsvps_update_own" ON public.rsvps
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "rsvps_delete_own" ON public.rsvps;
CREATE POLICY "rsvps_delete_own" ON public.rsvps
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Collective members (any role) can read all RSVPs for events their
-- collective owns. Used to power the dashboard guest list.
DROP POLICY IF EXISTS "rsvps_select_collective" ON public.rsvps;
CREATE POLICY "rsvps_select_collective" ON public.rsvps
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.collective_members cm ON cm.collective_id = e.collective_id
      WHERE e.id = rsvps.event_id
        AND cm.user_id = auth.uid()
        AND cm.deleted_at IS NULL
    )
  );

-- Anonymous + authenticated users can read public RSVP counts for any event
-- (powers the "X going" badge on the public event page). The action layer
-- aggregates and strips PII before returning.
DROP POLICY IF EXISTS "rsvps_select_counts_public" ON public.rsvps;
CREATE POLICY "rsvps_select_counts_public" ON public.rsvps
  FOR SELECT TO anon
  USING (true);

COMMIT;
