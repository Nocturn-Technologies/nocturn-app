-- Add events.timezone column so each event can render in its own local TZ.
--
-- Context (S01 from the QA e2e audit):
--   Events store starts_at as TIMESTAMPTZ (UTC). The app currently assumes
--   America/Toronto everywhere it renders a date/time. That's fine for the
--   first cohort of Toronto collectives, but:
--     - a touring promoter running dates in Montreal / NYC / LA sees wrong
--       door times on their own dashboard
--     - the public event page renders in buyer-local TZ, which mismatches
--       the operator's "start at 10 PM local" intent
--     - the round-2 audit surfaced "Sat Apr 25 10 PM" (public) vs
--       "Sun Apr 26 2 AM UTC" (operator dashboard) for the same event
--
-- Fix shape:
--   events.timezone TEXT NULL DEFAULT 'America/Toronto'
--
-- Why nullable / default:
--   All existing rows get the default, so no backfill step is needed.
--   Keeping it nullable avoids a hard NOT NULL constraint while the app
--   code is still converging on using the column; a follow-up migration
--   can tighten to NOT NULL once every createEvent/updateEvent path sets
--   it explicitly.
--
-- Governance:
--   §1  Config tier (operator-configurable per-event setting)
--   §2  Q6 — setting on existing config table → new column (not a new table)
--   §7  Additive only; no RLS change needed (column inherits events' RLS);
--       rollback committed alongside
--   §8  Non-destructive; no drops; safe to apply on live QA
--
-- App usage (lands in a follow-up PR, not this migration):
--   - lib/date.ts helpers accept an optional timezone param that reads
--     events.timezone instead of the hard-coded DEFAULT_TIMEZONE
--   - createEvent/updateEvent persist the operator's choice from the
--     wizard (new dropdown in Details step, defaults to collective.city
--     inferred IANA zone)
--
-- Linear: NOC-XX (S01 events.timezone)

BEGIN;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Toronto';

COMMENT ON COLUMN public.events.timezone IS
  'IANA timezone identifier (e.g. America/Toronto, America/New_York) used when rendering starts_at / ends_at / doors_at for both operator dashboard and public event page. Defaults to America/Toronto for backward compatibility with the first-cohort Toronto collectives. Set explicitly per event at create/edit time.';

COMMIT;
