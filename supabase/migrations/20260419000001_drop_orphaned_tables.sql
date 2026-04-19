-- Drop orphaned tables that have no active app code references.
-- Audited 2026-04-19: grepped all src/ .ts/.tsx files for .from("table_name").
--
-- Dropped:
--   segments           — segmentation system designed but never implemented
--   campaign_segments  — junction: email_campaigns ↔ segments (same unbuilt system)
--   segment_members    — junction: segments ↔ contacts (same unbuilt system)
--   split_items        — financial split tracking, no server action or API route references
--   transactions       — no .from("transactions") anywhere; Stripe webhook comments
--                        reference Stripe's own balance_transactions API, not this table
--
-- Not dropped (appear unused but are active):
--   event_analytics    — written via increment_analytics_counter RPC, not direct .from()
--   event_collectives  — reserved for planned co-host RLS feature (Phase 2)
--   webhook_events     — actively used in Stripe webhook deduplication

-- Drop junction tables first (they reference the parent tables)
DROP TABLE IF EXISTS public.campaign_segments CASCADE;
DROP TABLE IF EXISTS public.segment_members CASCADE;

-- Drop parent tables
DROP TABLE IF EXISTS public.segments CASCADE;
DROP TABLE IF EXISTS public.split_items CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;

-- Add missing index on messages(channel_id, created_at).
-- Current queries load all messages in a channel ordered by created_at with no limit.
-- Without this index, Postgres full-scans the messages table on every channel load.
CREATE INDEX IF NOT EXISTS idx_messages_channel_created
  ON public.messages (channel_id, created_at);
