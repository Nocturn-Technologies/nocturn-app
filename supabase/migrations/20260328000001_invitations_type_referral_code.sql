-- Add type column to invitations (member vs collab)
-- Add referral_code to collectives for platform-level referral program

-- 1. Add type column to invitations
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'member';

-- Drop the old unique constraint and recreate with type included
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_collective_id_email_key;
ALTER TABLE invitations ADD CONSTRAINT invitations_collective_id_email_type_key UNIQUE (collective_id, email, type);

-- 2. Add referral_code to collectives
ALTER TABLE collectives ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

-- Generate referral codes for existing collectives that don't have one
UPDATE collectives
SET referral_code = UPPER(LEFT(REPLACE(slug, '-', ''), 6)) || SUBSTR(gen_random_uuid()::TEXT, 1, 4)
WHERE referral_code IS NULL;
