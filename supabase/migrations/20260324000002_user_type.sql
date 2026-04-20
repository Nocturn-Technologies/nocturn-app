-- Add user_type column to users table
-- Defaults to 'collective' for backward compatibility
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type TEXT NOT NULL DEFAULT 'collective';

-- Add check constraint for valid types
ALTER TABLE users ADD CONSTRAINT users_user_type_check
  CHECK (user_type IN ('collective', 'artist', 'venue'));

-- Index for filtering by type
CREATE INDEX IF NOT EXISTS idx_users_user_type ON users (user_type);
