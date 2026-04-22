-- Add collectives.stripe_account_id — single reference key for Stripe Connect.
--
-- Per Andrew's NOC-27 review + Shawn's MSB regulatory argument:
--
--   Andrew's NOC-27 framing: "the right model is storing one reference
--   key only (account ID) and fetching everything else live from Stripe's
--   API. No caching, no denormalized status columns."
--
--   Shawn's MSB argument: manual payouts = Nocturn holds customer funds +
--   remits to third parties = Money Services Business classification.
--   FinCEN registration + state money-transmitter licensing in ~48 states
--   + federal felony exposure under 18 USC § 1960. Stripe Connect shifts
--   the regulated party to Stripe.
--
-- This migration is the minimum schema surface needed to support Connect
-- (OAuth returns an account_id, we store only that). All status fields —
-- charges_enabled, payouts_enabled, requirements, disabled_reason,
-- default_currency — are fetched live from Stripe API at request time.
-- Zero caching, zero drift, zero secondary source of truth.
--
-- Governance references:
--   §1  Config tier (collective-level setting)
--   §2  Q6 — setting on existing config table → new column
--   §4  Stripe's platform data is derived/live, not cached
--   §8  additive, backward-compatible, rollback included
--
-- Linear: NOC-39

BEGIN;

ALTER TABLE public.collectives
  ADD COLUMN stripe_account_id TEXT;

COMMENT ON COLUMN public.collectives.stripe_account_id IS
  'Stripe Connect account ID (acct_xxx). OAuth-populated on onboarding. All other state (charges_enabled, payouts_enabled, requirements, etc.) is fetched live from Stripe API at request time — never cached. See NOC-39.';

-- Partial index — only collectives with Connect active need lookup
CREATE INDEX idx_collectives_stripe_account_id
  ON public.collectives(stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

COMMIT;
