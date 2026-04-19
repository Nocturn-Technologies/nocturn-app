-- Channel members table for tracking who belongs to each chat channel
CREATE TABLE IF NOT EXISTS channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- admin, manager, member, artist, collaborator
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ,
  is_online BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

-- Indexes
CREATE INDEX idx_channel_members_channel_id ON channel_members(channel_id);
CREATE INDEX idx_channel_members_user_id ON channel_members(user_id);
CREATE INDEX idx_channel_members_online ON channel_members(channel_id, is_online) WHERE is_online = true;

-- RLS
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;

-- Members can see other members of channels they belong to
CREATE POLICY "Members can view channel members"
  ON channel_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM channel_members cm
      WHERE cm.channel_id = channel_members.channel_id
      AND cm.user_id = auth.uid()
    )
  );

-- Members can update their own row (for last_seen_at, is_online)
CREATE POLICY "Members can update own membership"
  ON channel_members FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admins can insert/delete members (handled via service role in server actions)
CREATE POLICY "Service role manages members"
  ON channel_members FOR ALL
  USING (auth.role() = 'service_role');

-- Enable realtime for presence
ALTER PUBLICATION supabase_realtime ADD TABLE channel_members;
