-- Migration: RLS & Schema Fixes
-- Date: 2026-03-27
-- Fixes missing columns, adds indexes, and tightens RLS policies

BEGIN;

-- ============================================================================
-- PART 1: Add missing columns to settlements table
-- ============================================================================

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS collective_id uuid REFERENCES collectives(id),
  ADD COLUMN IF NOT EXISTS gross_revenue numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_revenue numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_fees numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_artist_fees numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunds_total numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS venue_fee numeric(10,2) DEFAULT 0;

-- ============================================================================
-- PART 2: Add missing indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_event_tasks_event ON public.event_tasks (event_id);
CREATE INDEX IF NOT EXISTS idx_event_activity_event ON public.event_activity (event_id);
CREATE INDEX IF NOT EXISTS idx_event_expenses_event ON public.event_expenses (event_id);
CREATE INDEX IF NOT EXISTS idx_settlement_lines_settlement ON public.settlement_lines (settlement_id);
CREATE INDEX IF NOT EXISTS idx_guest_list_event ON public.guest_list (event_id);
CREATE INDEX IF NOT EXISTS idx_recordings_user ON public.recordings (user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations (token) WHERE status = 'pending';

-- ============================================================================
-- PART 3: Fix RLS policies
-- ============================================================================

-- --------------------------------------------------------------------------
-- 3.1 collective_members — INSERT/UPDATE/DELETE only by admins of that collective
-- --------------------------------------------------------------------------

DROP POLICY IF EXISTS "collective_members_insert" ON public.collective_members;
DROP POLICY IF EXISTS "collective_members_update" ON public.collective_members;
DROP POLICY IF EXISTS "collective_members_delete" ON public.collective_members;

CREATE POLICY "collective_members_insert"
  ON public.collective_members FOR INSERT
  TO authenticated
  WITH CHECK (
    collective_id IN (
      SELECT cm.collective_id FROM collective_members cm
      WHERE cm.user_id = auth.uid() AND cm.role = 'admin'
    )
  );

CREATE POLICY "collective_members_update"
  ON public.collective_members FOR UPDATE
  TO authenticated
  USING (
    collective_id IN (
      SELECT cm.collective_id FROM collective_members cm
      WHERE cm.user_id = auth.uid() AND cm.role = 'admin'
    )
  )
  WITH CHECK (
    collective_id IN (
      SELECT cm.collective_id FROM collective_members cm
      WHERE cm.user_id = auth.uid() AND cm.role = 'admin'
    )
  );

CREATE POLICY "collective_members_delete"
  ON public.collective_members FOR DELETE
  TO authenticated
  USING (
    collective_id IN (
      SELECT cm.collective_id FROM collective_members cm
      WHERE cm.user_id = auth.uid() AND cm.role = 'admin'
    )
  );

-- --------------------------------------------------------------------------
-- 3.2 messages — SELECT/INSERT scoped to channels owned by user's collective
--     UPDATE only own messages. Keep existing anon read policy as-is.
-- --------------------------------------------------------------------------

DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_update" ON public.messages;

CREATE POLICY "messages_select"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    channel_id IN (
      SELECT ch.id FROM channels ch
      JOIN collective_members cm ON cm.collective_id = ch.collective_id
      WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "messages_insert"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    channel_id IN (
      SELECT ch.id FROM channels ch
      JOIN collective_members cm ON cm.collective_id = ch.collective_id
      WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "messages_update"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- --------------------------------------------------------------------------
-- 3.3 channels — UPDATE scoped to user's collective
-- --------------------------------------------------------------------------

DROP POLICY IF EXISTS "channels_update" ON public.channels;

CREATE POLICY "channels_update"
  ON public.channels FOR UPDATE
  TO authenticated
  USING (
    collective_id IN (
      SELECT cm.collective_id FROM collective_members cm
      WHERE cm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    collective_id IN (
      SELECT cm.collective_id FROM collective_members cm
      WHERE cm.user_id = auth.uid()
    )
  );

-- --------------------------------------------------------------------------
-- 3.4 event_cards — INSERT/UPDATE scoped to events the user's collective owns
-- --------------------------------------------------------------------------

DROP POLICY IF EXISTS "event_cards_insert" ON public.event_cards;
DROP POLICY IF EXISTS "event_cards_update" ON public.event_cards;

CREATE POLICY "event_cards_insert"
  ON public.event_cards FOR INSERT
  TO authenticated
  WITH CHECK (
    event_id IN (
      SELECT e.id FROM events e
      JOIN collective_members cm ON cm.collective_id = e.collective_id
      WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "event_cards_update"
  ON public.event_cards FOR UPDATE
  TO authenticated
  USING (
    event_id IN (
      SELECT e.id FROM events e
      JOIN collective_members cm ON cm.collective_id = e.collective_id
      WHERE cm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    event_id IN (
      SELECT e.id FROM events e
      JOIN collective_members cm ON cm.collective_id = e.collective_id
      WHERE cm.user_id = auth.uid()
    )
  );

-- --------------------------------------------------------------------------
-- 3.5 event_tasks — ALL scoped to events the user's collective owns
-- --------------------------------------------------------------------------

DROP POLICY IF EXISTS "event_tasks_select" ON public.event_tasks;
DROP POLICY IF EXISTS "event_tasks_insert" ON public.event_tasks;
DROP POLICY IF EXISTS "event_tasks_update" ON public.event_tasks;
DROP POLICY IF EXISTS "event_tasks_delete" ON public.event_tasks;
DROP POLICY IF EXISTS "event_tasks_all" ON public.event_tasks;

CREATE POLICY "event_tasks_all"
  ON public.event_tasks FOR ALL
  TO authenticated
  USING (
    event_id IN (
      SELECT e.id FROM events e
      JOIN collective_members cm ON cm.collective_id = e.collective_id
      WHERE cm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    event_id IN (
      SELECT e.id FROM events e
      JOIN collective_members cm ON cm.collective_id = e.collective_id
      WHERE cm.user_id = auth.uid()
    )
  );

-- --------------------------------------------------------------------------
-- 3.6 event_activity — ALL scoped to events the user's collective owns
-- --------------------------------------------------------------------------

DROP POLICY IF EXISTS "event_activity_select" ON public.event_activity;
DROP POLICY IF EXISTS "event_activity_insert" ON public.event_activity;
DROP POLICY IF EXISTS "event_activity_update" ON public.event_activity;
DROP POLICY IF EXISTS "event_activity_delete" ON public.event_activity;
DROP POLICY IF EXISTS "event_activity_all" ON public.event_activity;

CREATE POLICY "event_activity_all"
  ON public.event_activity FOR ALL
  TO authenticated
  USING (
    event_id IN (
      SELECT e.id FROM events e
      JOIN collective_members cm ON cm.collective_id = e.collective_id
      WHERE cm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    event_id IN (
      SELECT e.id FROM events e
      JOIN collective_members cm ON cm.collective_id = e.collective_id
      WHERE cm.user_id = auth.uid()
    )
  );

-- --------------------------------------------------------------------------
-- 3.7 tickets — INSERT requires user_id = auth.uid() AND status = 'pending'
--     (service role bypasses RLS for webhook inserts)
-- --------------------------------------------------------------------------

DROP POLICY IF EXISTS "tickets_insert" ON public.tickets;

CREATE POLICY "tickets_insert"
  ON public.tickets FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND status = 'pending'
  );

-- --------------------------------------------------------------------------
-- 3.8 ticket_tiers — INSERT scoped to events the user's collective owns
-- --------------------------------------------------------------------------

DROP POLICY IF EXISTS "ticket_tiers_insert" ON public.ticket_tiers;

CREATE POLICY "ticket_tiers_insert"
  ON public.ticket_tiers FOR INSERT
  TO authenticated
  WITH CHECK (
    event_id IN (
      SELECT e.id FROM events e
      JOIN collective_members cm ON cm.collective_id = e.collective_id
      WHERE cm.user_id = auth.uid()
    )
  );

-- --------------------------------------------------------------------------
-- 3.9 artists — UPDATE scoped to artists booked by user's collective
-- --------------------------------------------------------------------------

DROP POLICY IF EXISTS "artists_update" ON public.artists;

CREATE POLICY "artists_update"
  ON public.artists FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT ea.artist_id FROM event_artists ea
      JOIN events e ON e.id = ea.event_id
      JOIN collective_members cm ON cm.collective_id = e.collective_id
      WHERE cm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    id IN (
      SELECT ea.artist_id FROM event_artists ea
      JOIN events e ON e.id = ea.event_id
      JOIN collective_members cm ON cm.collective_id = e.collective_id
      WHERE cm.user_id = auth.uid()
    )
  );

-- --------------------------------------------------------------------------
-- 3.10 event_artists — INSERT/UPDATE/DELETE scoped to events the user's
--      collective owns
-- --------------------------------------------------------------------------

DROP POLICY IF EXISTS "event_artists_insert" ON public.event_artists;
DROP POLICY IF EXISTS "event_artists_update" ON public.event_artists;
DROP POLICY IF EXISTS "event_artists_delete" ON public.event_artists;

CREATE POLICY "event_artists_insert"
  ON public.event_artists FOR INSERT
  TO authenticated
  WITH CHECK (
    event_id IN (
      SELECT e.id FROM events e
      JOIN collective_members cm ON cm.collective_id = e.collective_id
      WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "event_artists_update"
  ON public.event_artists FOR UPDATE
  TO authenticated
  USING (
    event_id IN (
      SELECT e.id FROM events e
      JOIN collective_members cm ON cm.collective_id = e.collective_id
      WHERE cm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    event_id IN (
      SELECT e.id FROM events e
      JOIN collective_members cm ON cm.collective_id = e.collective_id
      WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "event_artists_delete"
  ON public.event_artists FOR DELETE
  TO authenticated
  USING (
    event_id IN (
      SELECT e.id FROM events e
      JOIN collective_members cm ON cm.collective_id = e.collective_id
      WHERE cm.user_id = auth.uid()
    )
  );

COMMIT;
