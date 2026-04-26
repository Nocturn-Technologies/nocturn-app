-- Keep events.is_published in sync with events.status ('published' ⇔ true).
--
-- Context (S02 from the QA e2e audit):
--   events carries TWO columns that mean the same thing:
--     - status TEXT  ('draft' | 'published' | 'completed' | ...)
--     - is_published BOOLEAN
--   Today both the app's publishEvent() action and onboarding-event insert
--   write them in sync, but nothing at the DB level enforces it. A future
--   migration or server action that forgets to update one of them will
--   drift silently — some dashboards will show the event as "live" while
--   others hide it.
--
-- Phase A (this PR): add a trigger that keeps them aligned on every
--   INSERT/UPDATE. Safe, non-destructive, backward-compatible.
--
-- Phase B (separate ticket, after this has baked): drop events.is_published
--   entirely. status is the source of truth; is_published can be computed
--   from status = 'published'. Drop lands after a grep + Sentry sweep
--   confirms nothing reads is_published directly. Per §8 two-step drops.
--
-- Trigger behavior:
--   - If a write changes `status` but not `is_published`, derive
--     `is_published = (status = 'published')`.
--   - If a write changes `is_published` but not `status`, leave status
--     alone (the caller's intent is ambiguous — is_published=true with
--     status='draft' is nonsensical but we log it rather than silently
--     overwrite either side).
--   - If a write changes both and they disagree, the `status` value wins
--     (status is the source of truth per the decision above).
--
-- Governance:
--   §1  Config tier (events is config)
--   §4  Derived column alignment — is_published is a boolean view of
--       status; ideally not stored, but while it is, it must track
--   §7  No new table/column; adds a trigger + function
--   §8  Non-destructive; is_published stays in schema; rollback drops
--       the trigger + function only
--
-- Linear: NOC-XX (S02 events is_published sync)

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_events_is_published()
RETURNS TRIGGER AS $$
BEGIN
  -- Rule 1: if status changed and is_published wasn't explicitly touched
  -- on this write, keep is_published aligned to the new status.
  IF TG_OP = 'INSERT' THEN
    NEW.is_published := (NEW.status = 'published');
    RETURN NEW;
  END IF;

  -- UPDATE path
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- status is the source of truth — rewrite is_published regardless
    NEW.is_published := (NEW.status = 'published');
  ELSIF NEW.is_published IS DISTINCT FROM OLD.is_published THEN
    -- Caller is trying to flip is_published without touching status.
    -- Log a warning (visible in Supabase logs) and coerce back to the
    -- status-derived value so the two columns can't disagree.
    RAISE WARNING
      'events.is_published write ignored: caller flipped is_published=%s on event % without changing status (%s). Update status instead.',
      NEW.is_published, NEW.id, NEW.status;
    NEW.is_published := (NEW.status = 'published');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.sync_events_is_published() IS
  'Trigger function for events. Keeps is_published in sync with status (published ⇔ true). Status is source of truth. Phase A of S02; Phase B drops is_published.';

DROP TRIGGER IF EXISTS trg_events_is_published_sync ON public.events;

CREATE TRIGGER trg_events_is_published_sync
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.sync_events_is_published();

-- Backfill any existing drift in case someone got out of sync manually.
UPDATE public.events
   SET is_published = (status = 'published')
 WHERE is_published IS DISTINCT FROM (status = 'published');

COMMIT;
