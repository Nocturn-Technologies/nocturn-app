-- ⚠ DRAFT — DO NOT APPLY WITHOUT ANDREW'S REVIEW (per docs/DB_Data_Governance.md § 2 + § 8).
-- This file proposes infra the QA rebuild didn't include but the app relies on.
-- Two of the three changes have OPEN governance questions that Andrew needs
-- to resolve before this lands on QA. The previous out-of-band MCP DDL has
-- been rolled back; this file is the proper PR-flow path.
--
-- Open questions for Andrew:
--   1. `messages.user_id DROP NOT NULL`: AI bot posts have no human author.
--      Alternative shapes: (a) seed a system party + system user row and
--      attribute AI messages to it (preserves NOT NULL), (b) add `is_system`
--      bool to messages, (c) accept nullable as proposed below. Pick one.
--   2. `collective_stripe_accounts`: should this be `party_stripe_accounts`
--      keyed on `party_id` to match the party-centric model? Adopting
--      `collective_id` here would close off attaching Stripe accounts to
--      non-collective parties (artists, venues) later.
--   3. The general-channel backfill is idempotent and additive — leaving
--      the question only on whether existing collectives should auto-get
--      one or whether operators should opt in via the UI.

-- ─── messages.user_id ─────────────────────────────────────────────────
-- AI bot + system messages have no human author; current NOT NULL constraint
-- forces a fake auth.users seed. Proposing nullable; FK to users.id stays.
-- ⚠ Pending Andrew (open question 1).
ALTER TABLE public.messages ALTER COLUMN user_id DROP NOT NULL;

-- ─── collective_stripe_accounts ───────────────────────────────────────
-- TIER: config (one row per collective that completed Connect onboarding;
-- mutable as Stripe webhook updates flow through; no row = never connected).
--
-- Why a separate table at all (DB_Data_Governance § 2 Q1):
--   PR #93 deliberately removed Stripe denorm columns from `collectives`.
--   Restoring them reverts the rebuild. A sibling table preserves the lean
--   `collectives` shape and isolates Stripe-specific churn.
--
-- Why store the denorm fields (§ 4 "Store in DB"):
--   charges_enabled/payouts_enabled/details_submitted are read on every
--   Settings → Payouts mount; recomputing via a Stripe API call per render
--   is the wrong tradeoff. Webhook (`account.updated`) keeps them fresh.
--
-- ⚠ Pending Andrew (open question 2): keying.
CREATE TABLE IF NOT EXISTS public.collective_stripe_accounts (
  collective_id UUID PRIMARY KEY REFERENCES public.collectives(id) ON DELETE CASCADE,
  stripe_account_id TEXT NOT NULL,
  charges_enabled BOOLEAN NOT NULL DEFAULT false,
  payouts_enabled BOOLEAN NOT NULL DEFAULT false,
  details_submitted BOOLEAN NOT NULL DEFAULT false,
  default_currency TEXT DEFAULT 'usd',
  status_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- collective_id is the PK so it's already indexed; no separate FK index needed.

ALTER TABLE public.collective_stripe_accounts ENABLE ROW LEVEL SECURITY;

-- Authenticated members of the collective can SELECT. Writes go through the
-- service role in src/app/actions/stripe-connect.ts (matches existing
-- pattern for collective-scoped tables).
DROP POLICY IF EXISTS "csa_select" ON public.collective_stripe_accounts;
CREATE POLICY "csa_select" ON public.collective_stripe_accounts
  FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()));

DROP POLICY IF EXISTS "csa_service_role" ON public.collective_stripe_accounts;
CREATE POLICY "csa_service_role" ON public.collective_stripe_accounts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── Backfill: general channel per collective ─────────────────────────
-- Idempotent additive backfill — `createCollective` now seeds a `general`
-- channel up-front (src/app/actions/auth.ts). Existing collectives land on
-- an empty Messages page until this runs.
-- ⚠ Pending Andrew (open question 3): auto-backfill vs. opt-in via UI.
INSERT INTO public.channels (collective_id, name, type, created_at)
SELECT c.id, 'general', 'general', now()
FROM public.collectives c
WHERE NOT EXISTS (
  SELECT 1 FROM public.channels ch
  WHERE ch.collective_id = c.id AND ch.type = 'general'
)
ON CONFLICT DO NOTHING;
