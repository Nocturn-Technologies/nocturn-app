-- Add is_approved column to users table
-- Collectives and promoters require manual approval
-- All other user types are auto-approved

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT true;

-- Index for quick filtering
CREATE INDEX IF NOT EXISTS idx_users_is_approved ON users (is_approved) WHERE is_approved = false;
