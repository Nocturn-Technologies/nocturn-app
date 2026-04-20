-- ============================================================================
-- NOCTURN — RLS POLICIES
-- Run after QA_FULL_SCHEMA.sql. Safe to re-run (drops before creating).
-- ============================================================================

-- parties
DROP POLICY IF EXISTS "parties_select" ON public.parties;
DROP POLICY IF EXISTS "parties_service_role" ON public.parties;
CREATE POLICY "parties_select" ON public.parties FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.party_roles pr WHERE pr.party_id = parties.id AND pr.role = 'platform_user')
    OR EXISTS (
      SELECT 1 FROM public.party_roles pr
      JOIN public.collective_members cm ON cm.collective_id = pr.collective_id
      WHERE pr.party_id = parties.id AND cm.user_id = auth.uid() AND cm.deleted_at IS NULL
    )
  );
CREATE POLICY "parties_service_role" ON public.parties FOR ALL TO service_role USING (true) WITH CHECK (true);

-- party_contact_methods
DROP POLICY IF EXISTS "party_contact_methods_select" ON public.party_contact_methods;
DROP POLICY IF EXISTS "party_contact_methods_service_role" ON public.party_contact_methods;
CREATE POLICY "party_contact_methods_select" ON public.party_contact_methods FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parties p WHERE p.id = party_contact_methods.party_id));
CREATE POLICY "party_contact_methods_service_role" ON public.party_contact_methods FOR ALL TO service_role USING (true) WITH CHECK (true);

-- party_roles
DROP POLICY IF EXISTS "party_roles_select" ON public.party_roles;
DROP POLICY IF EXISTS "party_roles_service_role" ON public.party_roles;
CREATE POLICY "party_roles_select" ON public.party_roles FOR SELECT TO authenticated
  USING (collective_id IS NULL OR collective_id IN (SELECT get_user_collectives()));
CREATE POLICY "party_roles_service_role" ON public.party_roles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- collectives
DROP POLICY IF EXISTS "collectives_select" ON public.collectives;
DROP POLICY IF EXISTS "collectives_service_role" ON public.collectives;
CREATE POLICY "collectives_select" ON public.collectives FOR SELECT TO authenticated USING (true);
CREATE POLICY "collectives_service_role" ON public.collectives FOR ALL TO service_role USING (true) WITH CHECK (true);

-- users
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_select_collective" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_service_role" ON public.users;
CREATE POLICY "users_select_own" ON public.users FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "users_select_collective" ON public.users FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()));
CREATE POLICY "users_update_own" ON public.users FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "users_service_role" ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);

-- collective_members
DROP POLICY IF EXISTS "collective_members_select" ON public.collective_members;
DROP POLICY IF EXISTS "collective_members_service_role" ON public.collective_members;
CREATE POLICY "collective_members_select" ON public.collective_members FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()));
CREATE POLICY "collective_members_service_role" ON public.collective_members FOR ALL TO service_role USING (true) WITH CHECK (true);

-- artist_profiles
DROP POLICY IF EXISTS "artist_profiles_public_select" ON public.artist_profiles;
DROP POLICY IF EXISTS "artist_profiles_service_role" ON public.artist_profiles;
CREATE POLICY "artist_profiles_public_select" ON public.artist_profiles
  FOR SELECT USING (is_active = true AND deleted_at IS NULL);
CREATE POLICY "artist_profiles_service_role" ON public.artist_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- venue_profiles
DROP POLICY IF EXISTS "venue_profiles_public_select" ON public.venue_profiles;
DROP POLICY IF EXISTS "venue_profiles_service_role" ON public.venue_profiles;
CREATE POLICY "venue_profiles_public_select" ON public.venue_profiles
  FOR SELECT USING (is_active = true);
CREATE POLICY "venue_profiles_service_role" ON public.venue_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- attendee_profiles
DROP POLICY IF EXISTS "attendee_profiles_select" ON public.attendee_profiles;
DROP POLICY IF EXISTS "attendee_profiles_service_role" ON public.attendee_profiles;
CREATE POLICY "attendee_profiles_select" ON public.attendee_profiles FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()));
CREATE POLICY "attendee_profiles_service_role" ON public.attendee_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- events
DROP POLICY IF EXISTS "events_select_published" ON public.events;
DROP POLICY IF EXISTS "events_select_collective" ON public.events;
DROP POLICY IF EXISTS "events_service_role" ON public.events;
CREATE POLICY "events_select_published" ON public.events FOR SELECT USING (is_published = true);
CREATE POLICY "events_select_collective" ON public.events FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()));
CREATE POLICY "events_service_role" ON public.events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ticket_tiers
DROP POLICY IF EXISTS "ticket_tiers_select_public" ON public.ticket_tiers;
DROP POLICY IF EXISTS "ticket_tiers_select_collective" ON public.ticket_tiers;
DROP POLICY IF EXISTS "ticket_tiers_service_role" ON public.ticket_tiers;
CREATE POLICY "ticket_tiers_select_public" ON public.ticket_tiers FOR SELECT
  USING (event_id IN (SELECT id FROM public.events WHERE is_published = true));
CREATE POLICY "ticket_tiers_select_collective" ON public.ticket_tiers FOR SELECT TO authenticated
  USING (event_id IN (SELECT id FROM public.events WHERE collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "ticket_tiers_service_role" ON public.ticket_tiers FOR ALL TO service_role USING (true) WITH CHECK (true);

-- promo_codes
DROP POLICY IF EXISTS "promo_codes_select" ON public.promo_codes;
DROP POLICY IF EXISTS "promo_codes_service_role" ON public.promo_codes;
CREATE POLICY "promo_codes_select" ON public.promo_codes FOR SELECT TO authenticated
  USING (event_id IN (SELECT id FROM public.events WHERE collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "promo_codes_service_role" ON public.promo_codes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- event_artists
DROP POLICY IF EXISTS "event_artists_select_public" ON public.event_artists;
DROP POLICY IF EXISTS "event_artists_select_collective" ON public.event_artists;
DROP POLICY IF EXISTS "event_artists_service_role" ON public.event_artists;
CREATE POLICY "event_artists_select_public" ON public.event_artists FOR SELECT
  USING (event_id IN (SELECT id FROM public.events WHERE is_published = true));
CREATE POLICY "event_artists_select_collective" ON public.event_artists FOR SELECT TO authenticated
  USING (event_id IN (SELECT id FROM public.events WHERE collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "event_artists_service_role" ON public.event_artists FOR ALL TO service_role USING (true) WITH CHECK (true);

-- orders
DROP POLICY IF EXISTS "orders_select" ON public.orders;
DROP POLICY IF EXISTS "orders_service_role" ON public.orders;
CREATE POLICY "orders_select" ON public.orders FOR SELECT TO authenticated
  USING (event_id IN (SELECT e.id FROM public.events e WHERE e.collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "orders_service_role" ON public.orders FOR ALL TO service_role USING (true) WITH CHECK (true);

-- order_lines
DROP POLICY IF EXISTS "order_lines_select" ON public.order_lines;
DROP POLICY IF EXISTS "order_lines_service_role" ON public.order_lines;
CREATE POLICY "order_lines_select" ON public.order_lines FOR SELECT TO authenticated
  USING (order_id IN (
    SELECT o.id FROM public.orders o
    JOIN public.events e ON e.id = o.event_id
    WHERE e.collective_id IN (SELECT get_user_collectives())
  ));
CREATE POLICY "order_lines_service_role" ON public.order_lines FOR ALL TO service_role USING (true) WITH CHECK (true);

-- tickets
DROP POLICY IF EXISTS "tickets_select" ON public.tickets;
DROP POLICY IF EXISTS "tickets_service_role" ON public.tickets;
CREATE POLICY "tickets_select" ON public.tickets FOR SELECT TO authenticated
  USING (event_id IN (SELECT e.id FROM public.events e WHERE e.collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "tickets_service_role" ON public.tickets FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ticket_events
DROP POLICY IF EXISTS "ticket_events_select" ON public.ticket_events;
DROP POLICY IF EXISTS "ticket_events_service_role" ON public.ticket_events;
CREATE POLICY "ticket_events_select" ON public.ticket_events FOR SELECT TO authenticated
  USING (ticket_id IN (
    SELECT t.id FROM public.tickets t
    JOIN public.events e ON e.id = t.event_id
    WHERE e.collective_id IN (SELECT get_user_collectives())
  ));
CREATE POLICY "ticket_events_service_role" ON public.ticket_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- payment_events
DROP POLICY IF EXISTS "payment_events_select" ON public.payment_events;
DROP POLICY IF EXISTS "payment_events_service_role" ON public.payment_events;
CREATE POLICY "payment_events_select" ON public.payment_events FOR SELECT TO authenticated
  USING (event_id IN (SELECT e.id FROM public.events e WHERE e.collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "payment_events_service_role" ON public.payment_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- promo_code_usage
DROP POLICY IF EXISTS "promo_code_usage_select" ON public.promo_code_usage;
DROP POLICY IF EXISTS "promo_code_usage_service_role" ON public.promo_code_usage;
CREATE POLICY "promo_code_usage_select" ON public.promo_code_usage FOR SELECT TO authenticated
  USING (promo_code_id IN (
    SELECT pc.id FROM public.promo_codes pc
    JOIN public.events e ON e.id = pc.event_id
    WHERE e.collective_id IN (SELECT get_user_collectives())
  ));
CREATE POLICY "promo_code_usage_service_role" ON public.promo_code_usage FOR ALL TO service_role USING (true) WITH CHECK (true);

-- event_status_log
DROP POLICY IF EXISTS "event_status_log_select" ON public.event_status_log;
DROP POLICY IF EXISTS "event_status_log_service_role" ON public.event_status_log;
CREATE POLICY "event_status_log_select" ON public.event_status_log FOR SELECT TO authenticated
  USING (event_id IN (SELECT e.id FROM public.events e WHERE e.collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "event_status_log_service_role" ON public.event_status_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- settlements
DROP POLICY IF EXISTS "settlements_select" ON public.settlements;
DROP POLICY IF EXISTS "settlements_service_role" ON public.settlements;
CREATE POLICY "settlements_select" ON public.settlements FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()));
CREATE POLICY "settlements_service_role" ON public.settlements FOR ALL TO service_role USING (true) WITH CHECK (true);

-- settlement_lines
DROP POLICY IF EXISTS "settlement_lines_select" ON public.settlement_lines;
DROP POLICY IF EXISTS "settlement_lines_service_role" ON public.settlement_lines;
CREATE POLICY "settlement_lines_select" ON public.settlement_lines FOR SELECT TO authenticated
  USING (settlement_id IN (
    SELECT s.id FROM public.settlements s WHERE s.collective_id IN (SELECT get_user_collectives())
  ));
CREATE POLICY "settlement_lines_service_role" ON public.settlement_lines FOR ALL TO service_role USING (true) WITH CHECK (true);

-- payouts
DROP POLICY IF EXISTS "payouts_select" ON public.payouts;
DROP POLICY IF EXISTS "payouts_service_role" ON public.payouts;
CREATE POLICY "payouts_select" ON public.payouts FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()));
CREATE POLICY "payouts_service_role" ON public.payouts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- channels
DROP POLICY IF EXISTS "channels_select" ON public.channels;
DROP POLICY IF EXISTS "channels_service_role" ON public.channels;
CREATE POLICY "channels_select" ON public.channels FOR SELECT TO authenticated
  USING (
    collective_id IN (SELECT get_user_collectives())
    OR id IN (SELECT channel_id FROM public.channel_members WHERE user_id = auth.uid())
  );
CREATE POLICY "channels_service_role" ON public.channels FOR ALL TO service_role USING (true) WITH CHECK (true);

-- messages
DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_service_role" ON public.messages;
CREATE POLICY "messages_select" ON public.messages FOR SELECT TO authenticated
  USING (channel_id IN (
    SELECT c.id FROM public.channels c WHERE c.collective_id IN (SELECT get_user_collectives())
    UNION
    SELECT channel_id FROM public.channel_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "messages_insert" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "messages_service_role" ON public.messages FOR ALL TO service_role USING (true) WITH CHECK (true);

-- channel_members
DROP POLICY IF EXISTS "channel_members_select" ON public.channel_members;
DROP POLICY IF EXISTS "channel_members_service_role" ON public.channel_members;
CREATE POLICY "channel_members_select" ON public.channel_members FOR SELECT TO authenticated
  USING (channel_id IN (SELECT channel_id FROM public.channel_members WHERE user_id = auth.uid()));
CREATE POLICY "channel_members_service_role" ON public.channel_members FOR ALL TO service_role USING (true) WITH CHECK (true);

-- invitations
DROP POLICY IF EXISTS "invitations_select" ON public.invitations;
DROP POLICY IF EXISTS "invitations_service_role" ON public.invitations;
CREATE POLICY "invitations_select" ON public.invitations FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()));
CREATE POLICY "invitations_service_role" ON public.invitations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- saved_venues
DROP POLICY IF EXISTS "saved_venues_select" ON public.saved_venues;
DROP POLICY IF EXISTS "saved_venues_insert" ON public.saved_venues;
DROP POLICY IF EXISTS "saved_venues_delete" ON public.saved_venues;
DROP POLICY IF EXISTS "saved_venues_service_role" ON public.saved_venues;
CREATE POLICY "saved_venues_select" ON public.saved_venues FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "saved_venues_insert" ON public.saved_venues FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "saved_venues_delete" ON public.saved_venues FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "saved_venues_service_role" ON public.saved_venues FOR ALL TO service_role USING (true) WITH CHECK (true);

-- event_expenses
DROP POLICY IF EXISTS "event_expenses_select" ON public.event_expenses;
DROP POLICY IF EXISTS "event_expenses_service_role" ON public.event_expenses;
CREATE POLICY "event_expenses_select" ON public.event_expenses FOR SELECT TO authenticated
  USING (event_id IN (SELECT e.id FROM public.events e WHERE e.collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "event_expenses_service_role" ON public.event_expenses FOR ALL TO service_role USING (true) WITH CHECK (true);

-- event_tasks
DROP POLICY IF EXISTS "event_tasks_select" ON public.event_tasks;
DROP POLICY IF EXISTS "event_tasks_service_role" ON public.event_tasks;
CREATE POLICY "event_tasks_select" ON public.event_tasks FOR SELECT TO authenticated
  USING (event_id IN (SELECT e.id FROM public.events e WHERE e.collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "event_tasks_service_role" ON public.event_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- recordings
DROP POLICY IF EXISTS "recordings_select" ON public.recordings;
DROP POLICY IF EXISTS "recordings_service_role" ON public.recordings;
CREATE POLICY "recordings_select" ON public.recordings FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()));
CREATE POLICY "recordings_service_role" ON public.recordings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- email_campaigns
DROP POLICY IF EXISTS "email_campaigns_select" ON public.email_campaigns;
DROP POLICY IF EXISTS "email_campaigns_service_role" ON public.email_campaigns;
CREATE POLICY "email_campaigns_select" ON public.email_campaigns FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()));
CREATE POLICY "email_campaigns_service_role" ON public.email_campaigns FOR ALL TO service_role USING (true) WITH CHECK (true);

-- event_analytics
DROP POLICY IF EXISTS "event_analytics_public" ON public.event_analytics;
DROP POLICY IF EXISTS "event_analytics_service_role" ON public.event_analytics;
CREATE POLICY "event_analytics_public" ON public.event_analytics FOR SELECT USING (true);
CREATE POLICY "event_analytics_service_role" ON public.event_analytics FOR ALL TO service_role USING (true) WITH CHECK (true);

-- event_activity
DROP POLICY IF EXISTS "event_activity_select" ON public.event_activity;
DROP POLICY IF EXISTS "event_activity_service_role" ON public.event_activity;
CREATE POLICY "event_activity_select" ON public.event_activity FOR SELECT TO authenticated
  USING (event_id IN (SELECT e.id FROM public.events e WHERE e.collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "event_activity_service_role" ON public.event_activity FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ticket_waitlist
DROP POLICY IF EXISTS "ticket_waitlist_select" ON public.ticket_waitlist;
DROP POLICY IF EXISTS "ticket_waitlist_service_role" ON public.ticket_waitlist;
CREATE POLICY "ticket_waitlist_select" ON public.ticket_waitlist FOR SELECT TO authenticated
  USING (tier_id IN (
    SELECT tt.id FROM public.ticket_tiers tt
    JOIN public.events e ON e.id = tt.event_id
    WHERE e.collective_id IN (SELECT get_user_collectives())
  ));
CREATE POLICY "ticket_waitlist_service_role" ON public.ticket_waitlist FOR ALL TO service_role USING (true) WITH CHECK (true);

-- guest_list
DROP POLICY IF EXISTS "guest_list_select" ON public.guest_list;
DROP POLICY IF EXISTS "guest_list_service_role" ON public.guest_list;
CREATE POLICY "guest_list_select" ON public.guest_list FOR SELECT TO authenticated
  USING (event_id IN (SELECT e.id FROM public.events e WHERE e.collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "guest_list_service_role" ON public.guest_list FOR ALL TO service_role USING (true) WITH CHECK (true);

-- external_events
DROP POLICY IF EXISTS "external_events_select" ON public.external_events;
DROP POLICY IF EXISTS "external_events_service_role" ON public.external_events;
CREATE POLICY "external_events_select" ON public.external_events FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()) OR collective_id IS NULL);
CREATE POLICY "external_events_service_role" ON public.external_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- promo_links
DROP POLICY IF EXISTS "promo_links_select" ON public.promo_links;
DROP POLICY IF EXISTS "promo_links_service_role" ON public.promo_links;
CREATE POLICY "promo_links_select" ON public.promo_links FOR SELECT TO authenticated
  USING (event_id IN (SELECT e.id FROM public.events e WHERE e.collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "promo_links_service_role" ON public.promo_links FOR ALL TO service_role USING (true) WITH CHECK (true);

-- promo_clicks
DROP POLICY IF EXISTS "promo_clicks_select" ON public.promo_clicks;
DROP POLICY IF EXISTS "promo_clicks_service_role" ON public.promo_clicks;
CREATE POLICY "promo_clicks_select" ON public.promo_clicks FOR SELECT TO authenticated
  USING (promo_link_id IN (
    SELECT pl.id FROM public.promo_links pl
    JOIN public.events e ON e.id = pl.event_id
    WHERE e.collective_id IN (SELECT get_user_collectives())
  ));
CREATE POLICY "promo_clicks_service_role" ON public.promo_clicks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- event_cards
DROP POLICY IF EXISTS "event_cards_select_public" ON public.event_cards;
DROP POLICY IF EXISTS "event_cards_select_collective" ON public.event_cards;
DROP POLICY IF EXISTS "event_cards_service_role" ON public.event_cards;
CREATE POLICY "event_cards_select_public" ON public.event_cards FOR SELECT
  USING (event_id IN (SELECT id FROM public.events WHERE is_published = true));
CREATE POLICY "event_cards_select_collective" ON public.event_cards FOR SELECT TO authenticated
  USING (event_id IN (SELECT e.id FROM public.events e WHERE e.collective_id IN (SELECT get_user_collectives())));
CREATE POLICY "event_cards_service_role" ON public.event_cards FOR ALL TO service_role USING (true) WITH CHECK (true);

-- playbook_templates
DROP POLICY IF EXISTS "playbook_templates_select" ON public.playbook_templates;
DROP POLICY IF EXISTS "playbook_templates_service_role" ON public.playbook_templates;
CREATE POLICY "playbook_templates_select" ON public.playbook_templates FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()) OR is_global = true);
CREATE POLICY "playbook_templates_service_role" ON public.playbook_templates FOR ALL TO service_role USING (true) WITH CHECK (true);

-- playbook_task_templates
DROP POLICY IF EXISTS "playbook_task_templates_select" ON public.playbook_task_templates;
DROP POLICY IF EXISTS "playbook_task_templates_service_role" ON public.playbook_task_templates;
CREATE POLICY "playbook_task_templates_select" ON public.playbook_task_templates FOR SELECT TO authenticated
  USING (template_id IN (
    SELECT id FROM public.playbook_templates
    WHERE collective_id IN (SELECT get_user_collectives()) OR is_global = true
  ));
CREATE POLICY "playbook_task_templates_service_role" ON public.playbook_task_templates FOR ALL TO service_role USING (true) WITH CHECK (true);

-- rate_limits
DROP POLICY IF EXISTS "rate_limits_service_role" ON public.rate_limits;
CREATE POLICY "rate_limits_service_role" ON public.rate_limits FOR ALL TO service_role USING (true) WITH CHECK (true);

-- audit_logs
DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_service_role" ON public.audit_logs;
CREATE POLICY "audit_logs_select" ON public.audit_logs FOR SELECT TO authenticated
  USING (collective_id IN (SELECT get_user_collectives()));
CREATE POLICY "audit_logs_service_role" ON public.audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- webhook_events
DROP POLICY IF EXISTS "webhook_events_service_role" ON public.webhook_events;
CREATE POLICY "webhook_events_service_role" ON public.webhook_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- waitlist_entries
DROP POLICY IF EXISTS "waitlist_entries_service_role" ON public.waitlist_entries;
CREATE POLICY "waitlist_entries_service_role" ON public.waitlist_entries FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Realtime
DO $func$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;         EXCEPTION WHEN duplicate_object THEN NULL; END $func$;
DO $func$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_events;  EXCEPTION WHEN duplicate_object THEN NULL; END $func$;
DO $func$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;       EXCEPTION WHEN duplicate_object THEN NULL; END $func$;
DO $func$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.event_activity; EXCEPTION WHEN duplicate_object THEN NULL; END $func$;
