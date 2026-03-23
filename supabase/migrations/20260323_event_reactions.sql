-- Event reactions: anonymous emoji reactions on public event pages
-- No auth required — uses fingerprint hash to prevent spam

CREATE TABLE IF NOT EXISTS event_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (emoji IN ('🔥', '💯', '🙌', '🎉', '💜')),
  fingerprint TEXT NOT NULL, -- hashed browser fingerprint for dedup
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One reaction per emoji per fingerprint per event
CREATE UNIQUE INDEX idx_event_reactions_unique ON event_reactions(event_id, emoji, fingerprint);

-- Fast aggregate queries
CREATE INDEX idx_event_reactions_event ON event_reactions(event_id);

-- RLS: public read, insert only (no update/delete)
ALTER TABLE event_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read reactions" ON event_reactions
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert reactions" ON event_reactions
  FOR INSERT WITH CHECK (true);
