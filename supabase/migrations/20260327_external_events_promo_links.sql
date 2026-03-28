-- External events (not on Nocturn — Eventbrite, Posh, RA, etc.)
CREATE TABLE IF NOT EXISTS external_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promoter_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  external_url TEXT NOT NULL,
  platform TEXT, -- 'eventbrite', 'posh', 'ra', 'dice', 'shotgun', 'other'
  event_date TIMESTAMPTZ,
  venue_name TEXT,
  flyer_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Tracked promo links (works for both Nocturn + external events)
CREATE TABLE IF NOT EXISTS promo_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promoter_id UUID NOT NULL REFERENCES users(id),
  event_id UUID REFERENCES events(id),
  external_event_id UUID REFERENCES external_events(id),
  token TEXT UNIQUE NOT NULL,
  click_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT one_event_type CHECK (
    (event_id IS NOT NULL AND external_event_id IS NULL) OR
    (event_id IS NULL AND external_event_id IS NOT NULL)
  )
);

-- Click log for analytics
CREATE TABLE IF NOT EXISTS promo_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_link_id UUID NOT NULL REFERENCES promo_links(id),
  clicked_at TIMESTAMPTZ DEFAULT now(),
  referrer TEXT,
  user_agent TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_external_events_promoter ON external_events(promoter_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_promo_links_promoter ON promo_links(promoter_id);
CREATE INDEX IF NOT EXISTS idx_promo_links_token ON promo_links(token);
CREATE INDEX IF NOT EXISTS idx_promo_clicks_link ON promo_clicks(promo_link_id);

-- RLS
ALTER TABLE external_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_clicks ENABLE ROW LEVEL SECURITY;

-- RPC to atomically increment click count
CREATE OR REPLACE FUNCTION increment_promo_click(p_link_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE promo_links SET click_count = click_count + 1 WHERE id = p_link_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
