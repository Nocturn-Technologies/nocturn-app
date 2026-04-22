-- ⚠ DRAFT MIGRATION PROPOSAL — DO NOT APPLY AS-IS
-- NOC-26: messages.user_id strategy for AI bot posts
--
-- Currently `user_id NOT NULL`; ai-chat.ts wants to insert with no human
-- author. Three options below. Andrew picks one, deletes the others,
-- applies, and I open the code PR that updates ai-chat.ts.
--
-- (Moot right now — chat is gated per NOC-25 — but this is the first
-- decision if/when chat returns.)

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- OPTION 1 — System party + users row (matches § 3 identity rules)
-- ─────────────────────────────────────────────────────────────────────
-- -- TIER: master (parties row is permanent identity)
-- INSERT INTO public.parties (id, type, display_name) VALUES
--   ('00000000-0000-0000-0000-000000000001', 'organization', 'Nocturn AI')
-- ON CONFLICT (id) DO NOTHING;
--
-- INSERT INTO public.party_roles (party_id, role) VALUES
--   ('00000000-0000-0000-0000-000000000001', 'platform_user')
-- ON CONFLICT (party_id, role, collective_id) DO NOTHING;
--
-- INSERT INTO public.users (id, party_id, email, full_name, is_approved) VALUES
--   ('00000000-0000-0000-0000-000000000000',
--    '00000000-0000-0000-0000-000000000001',
--    'ai@trynocturn.com', 'Nocturn AI', true)
-- ON CONFLICT (id) DO NOTHING;
--
-- -- NOT NULL stays. ai-chat.ts writes user_id = '00000000-…-0000'.

-- ─────────────────────────────────────────────────────────────────────
-- OPTION 2 — is_system boolean on messages
-- ─────────────────────────────────────────────────────────────────────
-- ALTER TABLE public.messages
--   ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;
--
-- -- ai-chat.ts writes user_id = triggering user's id + is_system=true.
-- -- Semantics awkward: the AI didn't speak for the user.

-- ─────────────────────────────────────────────────────────────────────
-- OPTION 3 — Drop NOT NULL (simplest, loses integrity)
-- ─────────────────────────────────────────────────────────────────────
-- ALTER TABLE public.messages ALTER COLUMN user_id DROP NOT NULL;

COMMIT;
