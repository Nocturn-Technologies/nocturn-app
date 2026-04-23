-- Rollback for 20260422000002_add_collectives_stripe_account_id.sql
-- Linear: NOC-39

BEGIN;

DROP INDEX IF EXISTS idx_collectives_stripe_account_id;

ALTER TABLE public.collectives
  DROP COLUMN IF EXISTS stripe_account_id;

COMMIT;
