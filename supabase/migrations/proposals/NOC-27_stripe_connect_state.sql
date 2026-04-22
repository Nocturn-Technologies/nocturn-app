-- ⚠ DRAFT MIGRATION PROPOSAL — DO NOT APPLY AS-IS
-- NOC-27: Where does Stripe Connect state live post-#93?
--
-- PR #93 dropped collectives.stripe_account_id + denorm columns.
-- Settings → Payouts currently 400s. Three options below. Andrew picks,
-- I open the code PR for src/app/actions/stripe-connect.ts + webhook.
--
-- Currency column MUST be enum-constrained per § 7 (not free TEXT).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- OPTION 1 — Revert columns to collectives (simplest restore)
-- ─────────────────────────────────────────────────────────────────────
-- CREATE TYPE IF NOT EXISTS stripe_currency AS ENUM ('usd','cad','gbp','eur');
--
-- ALTER TABLE public.collectives
--   ADD COLUMN IF NOT EXISTS stripe_account_id         TEXT UNIQUE,
--   ADD COLUMN IF NOT EXISTS stripe_charges_enabled    BOOLEAN NOT NULL DEFAULT false,
--   ADD COLUMN IF NOT EXISTS stripe_payouts_enabled    BOOLEAN NOT NULL DEFAULT false,
--   ADD COLUMN IF NOT EXISTS stripe_details_submitted  BOOLEAN NOT NULL DEFAULT false,
--   ADD COLUMN IF NOT EXISTS stripe_default_currency   stripe_currency DEFAULT 'usd',
--   ADD COLUMN IF NOT EXISTS stripe_status_updated_at  TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────────
-- OPTION 2 — collective_stripe_accounts sibling table (keeps collectives lean)
-- ─────────────────────────────────────────────────────────────────────
-- CREATE TYPE IF NOT EXISTS stripe_currency AS ENUM ('usd','cad','gbp','eur');
-- -- TIER: config
-- CREATE TABLE IF NOT EXISTS public.collective_stripe_accounts (
--   collective_id       UUID PRIMARY KEY REFERENCES public.collectives(id) ON DELETE CASCADE,
--   stripe_account_id   TEXT NOT NULL UNIQUE,
--   charges_enabled     BOOLEAN NOT NULL DEFAULT false,
--   payouts_enabled     BOOLEAN NOT NULL DEFAULT false,
--   details_submitted   BOOLEAN NOT NULL DEFAULT false,
--   default_currency    stripe_currency NOT NULL DEFAULT 'usd',
--   status_updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
--   created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
-- );
-- ALTER TABLE public.collective_stripe_accounts ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "csa_select" ON public.collective_stripe_accounts FOR SELECT TO authenticated
--   USING (collective_id IN (SELECT get_user_collectives()));
-- CREATE POLICY "csa_service" ON public.collective_stripe_accounts FOR ALL TO service_role
--   USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- OPTION 3 — party_stripe_accounts keyed on party_id (forward-compat)
-- ─────────────────────────────────────────────────────────────────────
-- Same table shape as Option 2 but PK is `party_id` referencing parties(id).
-- Lets future artists/venues attach their own Stripe accounts via the
-- party-centric identity model.

COMMIT;
