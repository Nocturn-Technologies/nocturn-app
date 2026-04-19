-- Unified contacts table for CRM
-- Backs both Discover (industry contacts) and Reach (fan contacts)
CREATE TABLE IF NOT EXISTS contacts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collective_id          UUID NOT NULL REFERENCES collectives(id) ON DELETE CASCADE,
  contact_type           TEXT NOT NULL DEFAULT 'fan',  -- 'industry' | 'fan'
  -- Identity
  email                  TEXT,
  phone                  TEXT,
  full_name              TEXT,
  instagram              TEXT,
  -- Industry-specific (null for fans)
  role                   TEXT,  -- artist, venue, photographer, videographer, booking_agent, etc.
  -- Source tracking
  source                 TEXT NOT NULL DEFAULT 'manual', -- ticket | import | marketplace | artist_booking | manual
  source_detail          TEXT,  -- eventbrite_csv, posh_csv, instagram_list, quick_add, etc.
  -- Linked records (nullable)
  user_id                UUID REFERENCES users(id),
  artist_id              UUID REFERENCES artists(id),
  marketplace_profile_id UUID,
  -- CRM fields
  tags                   TEXT[] DEFAULT '{}',
  notes                  TEXT,
  follow_up_at           TIMESTAMPTZ,
  -- Computed / cached
  total_events           INTEGER DEFAULT 0,
  total_spend            NUMERIC(10,2) DEFAULT 0,
  first_seen_at          TIMESTAMPTZ DEFAULT now(),
  last_seen_at           TIMESTAMPTZ DEFAULT now(),
  -- Standard
  metadata               JSONB DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at             TIMESTAMPTZ,
  -- Dedupe: one email per collective
  CONSTRAINT uq_contact_email_collective UNIQUE (collective_id, email)
);

CREATE INDEX IF NOT EXISTS idx_contacts_collective_type ON contacts(collective_id, contact_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts(source);
CREATE INDEX IF NOT EXISTS idx_contacts_follow_up ON contacts(follow_up_at) WHERE follow_up_at IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);

-- Enable RLS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Policy: users can read contacts for collectives they belong to
CREATE POLICY "Members can view collective contacts" ON contacts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM collective_members
      WHERE collective_members.collective_id = contacts.collective_id
        AND collective_members.user_id = auth.uid()
        AND collective_members.deleted_at IS NULL
    )
  );

-- Service role bypasses RLS (server actions use admin client)
