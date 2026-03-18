-- Create invitations table for member invitation flow
-- Run via Supabase MCP: apply_migration(project_id: 'bpzwbqtpyorppijdblhy', name: 'create_invitations_table', query: <contents>)

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collective_id UUID NOT NULL REFERENCES collectives(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  invited_by UUID REFERENCES auth.users(id),
  token UUID DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  UNIQUE(collective_id, email)
);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON invitations
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
