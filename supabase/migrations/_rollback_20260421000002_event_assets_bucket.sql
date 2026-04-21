-- Rollback for 20260421000002_event_assets_bucket.sql
-- Per docs/DB_Data_Governance.md § 8: every destructive migration ships
-- a rollback. The forward migration is additive (creates a bucket + a
-- policy), so this rollback is straightforward — but read the warning.
--
-- WARNING: deleting a Storage bucket via SQL is BLOCKED by Supabase
-- (storage.protect_delete trigger). The bucket itself must be removed
-- via the Supabase Dashboard (Storage → event-assets → Delete bucket)
-- or via the Storage API. This rollback drops only the read policy
-- and leaves the bucket inert — Andrew can finish the cleanup in the
-- dashboard if a full revert is needed.

-- 1. Drop the public-read policy on event-assets objects.
DROP POLICY IF EXISTS "event-assets public read" ON storage.objects;

-- 2. (Manual) To remove the bucket itself:
--      Supabase Dashboard → Storage → event-assets → Delete bucket
--    Or via the Storage REST API:
--      DELETE /storage/v1/bucket/event-assets
--    Direct DELETE FROM storage.buckets is blocked by storage.protect_delete().
