-- ⚠ DRAFT MIGRATION PROPOSAL — § 8 two-step finish
-- NOC-28: Drop ticket_waitlist (duplicate of waitlist_entries)
--
-- PR #93 intent (per your own commit message) was to drop ticket_waitlist
-- and keep waitlist_entries. The drop migration was never written. QA has
-- both tables; ticket_waitlist has 0 rows. Prod keeps ticket_waitlist
-- (presumably with data) until prod runs the entity rebuild.
--
-- Verified pre-conditions (2026-04-21):
--   ✓ 0 rows in ticket_waitlist on QA (vtkvhdaadobigtojmztg)
--   — app-code grep for 'ticket_waitlist' should return 0 hits; confirm
--   — no FK from other tables references ticket_waitlist

BEGIN;

-- DROP TABLE IF EXISTS public.ticket_waitlist;

COMMIT;

-- ROLLBACK (paired file): restore from supabase/migrations/QA_FULL_SCHEMA.sql
-- snapshot by re-executing the CREATE TABLE block for ticket_waitlist.
