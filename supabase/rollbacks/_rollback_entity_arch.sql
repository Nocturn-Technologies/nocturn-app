-- Rollback partial entity architecture migration
-- Drops everything created before the backfill error, restoring columns we dropped

-- Restore dropped columns
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS soundcloud TEXT;
ALTER TABLE public.collectives ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE public.collectives ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE public.marketplace_profiles ADD COLUMN IF NOT EXISTS instagram_handle TEXT;
ALTER TABLE public.marketplace_profiles ADD COLUMN IF NOT EXISTS soundcloud_url TEXT;
ALTER TABLE public.marketplace_profiles ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE public.promo_codes ADD COLUMN IF NOT EXISTS times_used INTEGER DEFAULT 0;

-- Drop added columns on existing tables
ALTER TABLE public.users DROP COLUMN IF EXISTS party_id;
ALTER TABLE public.marketplace_profiles DROP COLUMN IF EXISTS party_id;
ALTER TABLE public.collective_members DROP COLUMN IF EXISTS party_id;
ALTER TABLE public.event_artists DROP COLUMN IF EXISTS party_id;
ALTER TABLE public.events DROP COLUMN IF EXISTS venue_party_id;

-- Restore channels collective_id NOT NULL
ALTER TABLE public.channels ALTER COLUMN collective_id SET NOT NULL;

-- Drop new tables and types
DROP TABLE IF EXISTS public.party_contact_methods CASCADE;
DROP TABLE IF EXISTS public.party_roles CASCADE;
DROP TABLE IF EXISTS public.parties CASCADE;
DROP TABLE IF EXISTS public.ticket_events CASCADE;
DROP TABLE IF EXISTS public.event_status_log CASCADE;
DROP TABLE IF EXISTS public.promo_code_usage CASCADE;
DROP TYPE IF EXISTS party_type CASCADE;
DROP TYPE IF EXISTS contact_method_type CASCADE;
DROP TYPE IF EXISTS party_role_type CASCADE;
DROP TYPE IF EXISTS ticket_event_type CASCADE;
DROP TYPE IF EXISTS event_status_type CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_parties() CASCADE;
