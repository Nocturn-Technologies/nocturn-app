-- QA (and any future Supabase branch / prod-rebuild) needs the
-- `event-assets` Storage bucket for flyer uploads. Supabase's post-#93
-- bootstrap didn't provision it, so `src/app/actions/ai-theme.ts`
-- `admin.storage.from("event-assets").upload(...)` was returning
-- "Bucket not found" and the UI surfaced that as a generic upload error.
--
-- Idempotent: ON CONFLICT lets this run on every fresh environment
-- without re-erroring. Applied to QA via Supabase MCP while debugging.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-assets',
  'event-assets',
  true,
  10485760,  -- 10 MB; matches MAX_FILE_BYTES in ai-theme.ts
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/svg+xml','image/avif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read policy — flyers render on the unauthenticated public event
-- page (`/e/{slug}/{eventSlug}`), so attendees need to see the images
-- without a session. Writes go through the service role (admin client)
-- in server actions, so no authenticated-insert policy is needed.
DROP POLICY IF EXISTS "event-assets public read" ON storage.objects;
CREATE POLICY "event-assets public read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'event-assets');
