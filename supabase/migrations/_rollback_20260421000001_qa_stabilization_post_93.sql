-- Rollback for 20260421000001_qa_stabilization_post_93.sql
-- Per docs/DB_Data_Governance.md § 8: every destructive migration ships a
-- rollback. Run this to fully revert the forward migration.
--
-- WARNING: re-applying NOT NULL on messages.user_id will fail if any rows
-- with NULL user_id were written between forward + rollback (AI bot posts).
-- Clean those up first or accept the failure as a signal to re-investigate.

-- 1. Drop the Stripe Connect sibling table + its policies (CASCADE handles
--    the policies; no other tables reference this so the cascade is contained).
DROP POLICY IF EXISTS "csa_service_role" ON public.collective_stripe_accounts;
DROP POLICY IF EXISTS "csa_select" ON public.collective_stripe_accounts;
DROP TABLE IF EXISTS public.collective_stripe_accounts;

-- 2. The general-channel backfill is intentionally NOT undone — channels
--    are config-tier rows, deleting them by INSERT-time would also drop
--    organic general channels created by `createCollective`. If you really
--    want to remove them, identify by `created_at` window matching the
--    migration apply time and verify per-collective.

-- 3. Restore NOT NULL on messages.user_id. Will fail if any AI/system
--    messages were inserted with NULL user_id while the forward migration
--    was active. Clean those up first:
--      DELETE FROM public.messages WHERE user_id IS NULL;
--    or attribute them to a system user before re-applying the constraint.
ALTER TABLE public.messages ALTER COLUMN user_id SET NOT NULL;
