-- ⚠ DRAFT PROVISIONING PROPOSAL — DO NOT APPLY AS-IS
-- NOC-29: event-assets storage bucket provisioning — deploy mechanism TBD
--
-- QA currently has no storage buckets. Flyer upload 400s with "Bucket
-- not found". This file proposes the SQL form of the provisioning
-- (Option 1 in Linear). Options 2 (Supabase CLI) + 3 (dashboard) are
-- process-only and don't land in this repo.
--
-- Caveat: SQL `DELETE FROM storage.buckets` is blocked by the
-- `storage.protect_delete()` trigger. Rollback can only drop the read
-- policy; bucket removal needs the dashboard or Storage REST API.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- OPTION 1 — SQL migration (this file)
-- ─────────────────────────────────────────────────────────────────────
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES (
--   'event-assets', 'event-assets', true, 10485760,
--   ARRAY['image/jpeg','image/png','image/webp','image/gif','image/svg+xml','image/avif']
-- ) ON CONFLICT (id) DO UPDATE SET
--   public = EXCLUDED.public,
--   file_size_limit = EXCLUDED.file_size_limit,
--   allowed_mime_types = EXCLUDED.allowed_mime_types;
--
-- DROP POLICY IF EXISTS "event-assets public read" ON storage.objects;
-- CREATE POLICY "event-assets public read" ON storage.objects
--   FOR SELECT TO public USING (bucket_id = 'event-assets');

-- ─────────────────────────────────────────────────────────────────────
-- OPTION 2 — Supabase CLI in deploy pipeline (no file here)
-- ─────────────────────────────────────────────────────────────────────
-- `supabase storage create event-assets --public --file-size-limit 10485760`
-- invoked via `npm run setup:storage` or Vercel predeploy hook.

-- ─────────────────────────────────────────────────────────────────────
-- OPTION 3 — Manual dashboard (no file here, just documented)
-- ─────────────────────────────────────────────────────────────────────
-- Bootstrap step in docs/COFOUNDER_ACCESS_GUIDE.md.

COMMIT;
