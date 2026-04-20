-- Marketplace tables for Discover feature
-- These tables were originally created via Supabase SQL editor.
-- This migration file ensures they're tracked in version control.

CREATE TABLE IF NOT EXISTS marketplace_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  user_type text NOT NULL,
  display_name text NOT NULL,
  slug text UNIQUE NOT NULL,
  bio text,
  avatar_url text,
  cover_photo_url text,
  city text,
  instagram_handle text,
  website_url text,
  soundcloud_url text,
  spotify_url text,
  genres text[] DEFAULT '{}',
  services text[] DEFAULT '{}',
  rate_range text,
  availability text,
  portfolio_urls text[] DEFAULT '{}',
  past_venues text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  is_verified boolean DEFAULT false,
  is_active boolean DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_marketplace_profiles_type ON marketplace_profiles(user_type);
CREATE INDEX IF NOT EXISTS idx_marketplace_profiles_city ON marketplace_profiles(city);
CREATE INDEX IF NOT EXISTS idx_marketplace_profiles_genres ON marketplace_profiles USING gin(genres);
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_profiles_user ON marketplace_profiles(user_id);

ALTER TABLE marketplace_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'marketplace_profiles' AND policyname = 'Anyone can view active profiles') THEN
    CREATE POLICY "Anyone can view active profiles"
      ON marketplace_profiles FOR SELECT USING (is_active = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'marketplace_profiles' AND policyname = 'Users can insert own profile') THEN
    CREATE POLICY "Users can insert own profile"
      ON marketplace_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'marketplace_profiles' AND policyname = 'Users can update own profile') THEN
    CREATE POLICY "Users can update own profile"
      ON marketplace_profiles FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Marketplace inquiries
CREATE TABLE IF NOT EXISTS marketplace_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid REFERENCES users(id) NOT NULL,
  to_profile_id uuid REFERENCES marketplace_profiles(id) NOT NULL,
  event_id uuid REFERENCES events(id),
  message text,
  inquiry_type text NOT NULL DEFAULT 'contact',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inquiries_to ON marketplace_inquiries(to_profile_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_from ON marketplace_inquiries(from_user_id);

ALTER TABLE marketplace_inquiries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'marketplace_inquiries' AND policyname = 'Sender can view own inquiries') THEN
    CREATE POLICY "Sender can view own inquiries"
      ON marketplace_inquiries FOR SELECT USING (auth.uid() = from_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'marketplace_inquiries' AND policyname = 'Receiver can view inquiries to them') THEN
    CREATE POLICY "Receiver can view inquiries to them"
      ON marketplace_inquiries FOR SELECT USING (
        auth.uid() = (SELECT user_id FROM marketplace_profiles WHERE id = to_profile_id)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'marketplace_inquiries' AND policyname = 'Authenticated users can create') THEN
    CREATE POLICY "Authenticated users can create"
      ON marketplace_inquiries FOR INSERT WITH CHECK (auth.uid() = from_user_id);
  END IF;
END $$;

-- Saved profiles (bookmarks)
CREATE TABLE IF NOT EXISTS marketplace_saved (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  profile_id uuid REFERENCES marketplace_profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, profile_id)
);

ALTER TABLE marketplace_saved ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'marketplace_saved' AND policyname = 'Users can manage own saves') THEN
    CREATE POLICY "Users can manage own saves"
      ON marketplace_saved FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
