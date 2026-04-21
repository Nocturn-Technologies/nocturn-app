-- Post-#93 stabilization: infra the QA rebuild didn't include but the app
-- relies on. Already applied to QA via Supabase MCP while debugging; this
-- file exists so fresh environments (new preview branches, eventual prod
-- rebuild) pick up the same state.

-- ─── messages.user_id: allow NULL for AI bot posts ─────────────────────
-- The entity rebuild made user_id NOT NULL, but ai-chat.ts + system
-- messages legitimately have no human author. Rather than seeding a fake
-- `auth.users` row for the AI bot (which would cascade into a bunch of
-- auth edge cases), the column is nullable. The FK to users.id is kept
-- for human authors.
ALTER TABLE public.messages ALTER COLUMN user_id DROP NOT NULL;

-- ─── collective_stripe_accounts: Stripe Connect state, out of collectives ───
-- PR #93 dropped stripe_account_id + all the denorm stripe_* columns from
-- the `collectives` table as part of the rebuild. The app code still needs
-- somewhere to persist the Connect account id + cached charges_enabled /
-- payouts_enabled / details_submitted so the Settings → Payouts card
-- doesn't fire a Stripe API call on every render. This table is the
-- replacement — one row per collective that has gone through Connect
-- onboarding; no row = never connected.
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

ALTER TABLE public.collective_stripe_accounts ENABLE ROW LEVEL SECURITY;

-- Authenticated member of the collective can read. No INSERT/UPDATE policy
-- for authenticated; writes go through the service role in
-- `src/app/actions/stripe-connect.ts`.
DROP POLICY IF EXISTS "csa_select" ON public.collective_stripe_accounts;
CREATE POLICY "csa_select" ON public.collective_stripe_accounts
  FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()));

DROP POLICY IF EXISTS "csa_service_role" ON public.collective_stripe_accounts;
CREATE POLICY "csa_service_role" ON public.collective_stripe_accounts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── Backfill: seed a `general` channel for every collective missing one ───
-- `createCollective` now seeds one up-front (see src/app/actions/auth.ts),
-- but collectives that existed before this change land on an empty
-- Messages page until the backfill runs.
INSERT INTO public.channels (collective_id, name, type, created_at)
SELECT c.id, 'general', 'general', now()
FROM public.collectives c
WHERE NOT EXISTS (
  SELECT 1 FROM public.channels ch
  WHERE ch.collective_id = c.id AND ch.type = 'general'
)
ON CONFLICT DO NOTHING;
