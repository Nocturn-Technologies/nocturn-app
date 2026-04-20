-- ═══════════════════════════════════════════════════════════════════════
-- Host mode: free RSVP events, organizer updates, "host" user type
-- ═══════════════════════════════════════════════════════════════════════
-- Enables Partiful-style free events on Nocturn:
--   1. events.event_mode — 'ticketed' | 'rsvp' | 'hybrid' (default 'ticketed')
--   2. rsvps table — yes/maybe/no RSVPs for free events
--   3. event_updates table — organizer posts that email attendees
--   4. users.user_type — adds 'host' to the allowed set

-- ─── 1. events.event_mode ─────────────────────────────────────────────
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_mode TEXT NOT NULL DEFAULT 'ticketed';

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_mode_check;
ALTER TABLE events ADD CONSTRAINT events_event_mode_check
  CHECK (event_mode IN ('ticketed', 'rsvp', 'hybrid'));

CREATE INDEX IF NOT EXISTS idx_events_event_mode ON events (event_mode);

-- Backfill: any existing is_free=true event gets rsvp mode
UPDATE events SET event_mode = 'rsvp' WHERE is_free = true AND event_mode = 'ticketed';

-- ─── 2. rsvps table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  full_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('yes', 'maybe', 'no')),
  plus_ones INTEGER NOT NULL DEFAULT 0 CHECK (plus_ones >= 0 AND plus_ones <= 10),
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Either logged-in user OR email required
  CONSTRAINT rsvps_user_or_email CHECK (user_id IS NOT NULL OR email IS NOT NULL),
  -- One RSVP per user per event (if logged in)
  CONSTRAINT rsvps_unique_user UNIQUE (event_id, user_id),
  -- One RSVP per email per event (if guest)
  CONSTRAINT rsvps_unique_email UNIQUE (event_id, email)
);

CREATE INDEX IF NOT EXISTS idx_rsvps_event_id ON rsvps (event_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_user_id ON rsvps (user_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_event_status ON rsvps (event_id, status);

-- RLS
ALTER TABLE rsvps ENABLE ROW LEVEL SECURITY;

-- Anyone can insert an RSVP (public events)
DROP POLICY IF EXISTS "rsvps_insert_public" ON rsvps;
CREATE POLICY "rsvps_insert_public" ON rsvps
  FOR INSERT WITH CHECK (true);

-- Users can update/delete their own RSVPs
DROP POLICY IF EXISTS "rsvps_update_own" ON rsvps;
CREATE POLICY "rsvps_update_own" ON rsvps
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "rsvps_delete_own" ON rsvps;
CREATE POLICY "rsvps_delete_own" ON rsvps
  FOR DELETE USING (auth.uid() = user_id);

-- Collective members can read all RSVPs for their events
DROP POLICY IF EXISTS "rsvps_select_collective" ON rsvps;
CREATE POLICY "rsvps_select_collective" ON rsvps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM events e
      JOIN collective_members cm ON cm.collective_id = e.collective_id
      WHERE e.id = rsvps.event_id
        AND cm.user_id = auth.uid()
        AND cm.deleted_at IS NULL
    )
  );

-- Users can read their own RSVPs
DROP POLICY IF EXISTS "rsvps_select_own" ON rsvps;
CREATE POLICY "rsvps_select_own" ON rsvps
  FOR SELECT USING (auth.uid() = user_id);

-- Public aggregate view — no PII, just counts
DROP VIEW IF EXISTS event_rsvp_counts;
CREATE VIEW event_rsvp_counts AS
  SELECT
    event_id,
    status,
    COUNT(*) AS count,
    COALESCE(SUM(plus_ones), 0) AS plus_ones_total
  FROM rsvps
  GROUP BY event_id, status;

GRANT SELECT ON event_rsvp_counts TO anon, authenticated;

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_rsvps_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rsvps_set_updated_at ON rsvps;
CREATE TRIGGER rsvps_set_updated_at
  BEFORE UPDATE ON rsvps
  FOR EACH ROW
  EXECUTE FUNCTION set_rsvps_updated_at();

-- ─── 3. event_updates table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) > 0 AND length(body) <= 2000),
  email_sent BOOLEAN NOT NULL DEFAULT false,
  emailed_at TIMESTAMPTZ,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_updates_event_id ON event_updates (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_updates_author ON event_updates (author_id);

-- RLS
ALTER TABLE event_updates ENABLE ROW LEVEL SECURITY;

-- Public read — anyone can see updates for published events
DROP POLICY IF EXISTS "event_updates_select_public" ON event_updates;
CREATE POLICY "event_updates_select_public" ON event_updates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_updates.event_id
        AND e.status = 'published'
        AND e.deleted_at IS NULL
    )
  );

-- Only collective members can insert
DROP POLICY IF EXISTS "event_updates_insert_collective" ON event_updates;
CREATE POLICY "event_updates_insert_collective" ON event_updates
  FOR INSERT WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM events e
      JOIN collective_members cm ON cm.collective_id = e.collective_id
      WHERE e.id = event_updates.event_id
        AND cm.user_id = auth.uid()
        AND cm.deleted_at IS NULL
    )
  );

-- Author can update/delete their own posts
DROP POLICY IF EXISTS "event_updates_update_author" ON event_updates;
CREATE POLICY "event_updates_update_author" ON event_updates
  FOR UPDATE USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "event_updates_delete_author" ON event_updates;
CREATE POLICY "event_updates_delete_author" ON event_updates
  FOR DELETE USING (auth.uid() = author_id);

-- ─── 4. users.user_type — add 'host' ──────────────────────────────────
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_type_check;
ALTER TABLE users ADD CONSTRAINT users_user_type_check
  CHECK (user_type IN (
    'collective', 'promoter', 'host',
    'artist', 'venue', 'photographer', 'videographer',
    'sound_production', 'lighting_production', 'sponsor',
    'artist_manager', 'tour_manager', 'booking_agent',
    'event_staff', 'mc_host', 'graphic_designer', 'pr_publicist'
  ));
