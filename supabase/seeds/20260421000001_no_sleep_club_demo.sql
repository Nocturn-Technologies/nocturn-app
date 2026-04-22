-- Seed: No Sleep Club demo data (NOC-30)
--
-- Purpose: populate No Sleep Club with enough master + config + supporting
-- data to walk a pitch demo end-to-end without hitting empty states. Story
-- beats: one event 5 days out (urgency / lineup locked), one 3 weeks out
-- (planning / healthy forecast), one draft. Plus artists + venues in the
-- governed master tables so Discover has content.
--
-- Per docs/DB_Data_Governance.md:
-- - ZERO schema changes. Only INSERTs into governed tables with existing
--   enum values.
-- - All master-tier identity records use explicit UUIDs so re-runs are
--   idempotent (ON CONFLICT DO NOTHING).
-- - No transactional writes (orders/tickets/ticket_events/payment_events/
--   settlements). § 5 says those are append-only; Phase 2 will handle them
--   via a server-action seed that goes through fulfill_tickets_atomic() so
--   the governed invariants hold. Keeping this PR to config + master only.
-- - All party role + contact + event_status enum values verified against
--   pg_enum on 2026-04-21.
--
-- Apply to QA (never to prod) when NOC-30 ticket is approved.
-- Rollback: supabase/seeds/_rollback_20260421000001_no_sleep_club_demo.sql

BEGIN;

-- Existing references (read-only here, for clarity):
--   Collective:        901f830a-fccd-47ef-ba40-0c9d968a14ef  No Sleep Club
--   Collective party:  3cce7480-0977-49c4-aadc-6a25d254ab4e
--   Creator (Shawn):   7b58e719-933d-4c87-bdaa-1f02aa5ebc8a

-- ═══════════════════════════════════════════════════════════════════════
-- VENUES (master tier — parties + party_roles + venue_profiles)
-- § 3: one parties row per identity; § 2 Q2 new venue → parties+profile.
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO parties (id, type, display_name) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'venue', 'The Baby G'),
  ('d1000000-0000-0000-0000-000000000002', 'venue', 'Infinity Room')
ON CONFLICT (id) DO NOTHING;

INSERT INTO party_roles (party_id, role, collective_id) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'venue_operator', NULL),
  ('d1000000-0000-0000-0000-000000000002', 'venue_operator', NULL)
ON CONFLICT (party_id, role, collective_id) DO NOTHING;

INSERT INTO venue_profiles (party_id, slug, name, city, address, capacity, is_verified, is_active) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'the-baby-g',     'The Baby G',     'Toronto', '1608 Dundas St W',   250, false, true),
  ('d1000000-0000-0000-0000-000000000002', 'infinity-room',  'Infinity Room',  'Toronto', '66 Wellington St E', 180, false, true)
ON CONFLICT (party_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- ARTISTS (master tier — 5 DJs with realistic Toronto house aesthetics)
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO parties (id, type, display_name) VALUES
  ('d2000000-0000-0000-0000-000000000001', 'person', 'LockEight'),
  ('d2000000-0000-0000-0000-000000000002', 'person', 'Midnight Rivers'),
  ('d2000000-0000-0000-0000-000000000003', 'person', 'Jovane Kay'),
  ('d2000000-0000-0000-0000-000000000004', 'person', 'Silva Twin'),
  ('d2000000-0000-0000-0000-000000000005', 'person', 'Nala Vance')
ON CONFLICT (id) DO NOTHING;

INSERT INTO party_roles (party_id, role, collective_id) VALUES
  ('d2000000-0000-0000-0000-000000000001', 'artist', NULL),
  ('d2000000-0000-0000-0000-000000000002', 'artist', NULL),
  ('d2000000-0000-0000-0000-000000000003', 'artist', NULL),
  ('d2000000-0000-0000-0000-000000000004', 'artist', NULL),
  ('d2000000-0000-0000-0000-000000000005', 'artist', NULL)
ON CONFLICT (party_id, role, collective_id) DO NOTHING;

INSERT INTO artist_profiles (party_id, slug, bio, genre, default_fee, is_verified, is_active) VALUES
  ('d2000000-0000-0000-0000-000000000001', 'lockeight',
   'Toronto-based tech house selector. No Sleep Club resident.',
   ARRAY['tech house','minimal'], 250, false, true),
  ('d2000000-0000-0000-0000-000000000002', 'midnight-rivers',
   'Deep and melodic. Known for 3-hour b2b sets.',
   ARRAY['deep house','melodic techno'], 400, false, true),
  ('d2000000-0000-0000-0000-000000000003', 'jovane-kay',
   'Afro house curator. Amapiano crossover.',
   ARRAY['afro house','amapiano'], 350, false, true),
  ('d2000000-0000-0000-0000-000000000004', 'silva-twin',
   'Minimal techno — hypnotic, low-BPM, early-set specialist.',
   ARRAY['minimal','microhouse'], 200, false, true),
  ('d2000000-0000-0000-0000-000000000005', 'nala-vance',
   'Afrobeats meets UK garage. Peak-time energy.',
   ARRAY['afrobeats','uk garage'], 450, false, true)
ON CONFLICT (party_id) DO NOTHING;

-- Every seeded person gets a `demo+<slug>@trynocturn.com` email so it's
-- unambiguous when a real operator sees one in a contact card that this
-- row is demo data, not a live collaborator. Unique per party.
INSERT INTO party_contact_methods (party_id, type, value, is_primary) VALUES
  ('d2000000-0000-0000-0000-000000000001', 'email',      'demo+lockeight@trynocturn.com',                        true),
  ('d2000000-0000-0000-0000-000000000001', 'instagram',  '@lockeight',                                           false),
  ('d2000000-0000-0000-0000-000000000001', 'soundcloud', 'https://soundcloud.com/lockeight',                     false),
  ('d2000000-0000-0000-0000-000000000002', 'email',      'demo+midnightrivers@trynocturn.com',                   true),
  ('d2000000-0000-0000-0000-000000000002', 'instagram',  '@midnightrivers',                                      false),
  ('d2000000-0000-0000-0000-000000000003', 'email',      'demo+jovanekay@trynocturn.com',                        true),
  ('d2000000-0000-0000-0000-000000000003', 'instagram',  '@jovanekay',                                           false),
  ('d2000000-0000-0000-0000-000000000003', 'spotify',    'https://open.spotify.com/artist/jovanekay',            false),
  ('d2000000-0000-0000-0000-000000000004', 'email',      'demo+silvatwin@trynocturn.com',                        true),
  ('d2000000-0000-0000-0000-000000000004', 'instagram',  '@silvatwin.dj',                                        false),
  ('d2000000-0000-0000-0000-000000000005', 'email',      'demo+nalavance@trynocturn.com',                        true),
  ('d2000000-0000-0000-0000-000000000005', 'instagram',  '@nalavance',                                           false),
  ('d2000000-0000-0000-0000-000000000005', 'spotify',    'https://open.spotify.com/artist/nalavance',            false)
ON CONFLICT DO NOTHING;

-- No Sleep Club's own party gets a contact row too (Instagram) so the
-- Settings → Instagram field has something to display when Shawn demos.
INSERT INTO party_contact_methods (party_id, type, value, is_primary) VALUES
  ('3cce7480-0977-49c4-aadc-6a25d254ab4e', 'instagram', '@nosleep.club.to', true),
  ('3cce7480-0977-49c4-aadc-6a25d254ab4e', 'website',   'https://nosleep.club', false)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- NON-DJ MARKETPLACE PROFILES — one person/org per Discover → People role
-- Stored as `artist_profiles` rows (the universal marketplace table) with
-- `services[]` as the discriminator. Matches what searchProfiles returns
-- and what TYPE_LABELS in src/lib/marketplace-constants.ts recognises.
-- Every profile has `demo+<slug>@trynocturn.com` as its email so it's
-- unambiguous these are demo identities, not live collaborators.
-- ═══════════════════════════════════════════════════════════════════════

-- People (type=person)
INSERT INTO parties (id, type, display_name) VALUES
  ('d2000000-0000-0000-0000-000000000006', 'person',       'Kiara Lens'),          -- photographer
  ('d2000000-0000-0000-0000-000000000007', 'person',       'Reel North'),          -- videographer
  ('d2000000-0000-0000-0000-000000000008', 'person',       'Dara Pham'),           -- artist_manager
  ('d2000000-0000-0000-0000-000000000009', 'person',       'Ellis Wong'),          -- tour_manager
  ('d2000000-0000-0000-0000-00000000000a', 'person',       'Halle Rook'),          -- booking_agent
  ('d2000000-0000-0000-0000-00000000000b', 'person',       'Mercury One'),         -- mc_host
  ('d2000000-0000-0000-0000-00000000000c', 'person',       'Lucy Ford')            -- promoter
ON CONFLICT (id) DO NOTHING;

-- Organisations (type=organization — agencies, studios, sponsor brand)
INSERT INTO parties (id, type, display_name) VALUES
  ('d3000000-0000-0000-0000-000000000002', 'organization', 'Glyph Studio'),        -- graphic_designer
  ('d3000000-0000-0000-0000-000000000003', 'organization', 'Low End Sound'),       -- sound_production
  ('d3000000-0000-0000-0000-000000000004', 'organization', 'Chromaflare'),         -- lighting_production
  ('d3000000-0000-0000-0000-000000000005', 'organization', 'Doors & Lines Co.'),   -- event_staff
  ('d3000000-0000-0000-0000-000000000006', 'organization', 'Signal PR'),           -- pr_publicist
  ('d3000000-0000-0000-0000-000000000007', 'organization', 'Low Tide Drinks')      -- sponsor
ON CONFLICT (id) DO NOTHING;

-- All marketplace identities get the `artist` party_role (only enum value
-- that currently applies to service providers — see docs/DB_Data_Governance.md
-- Part 2.A). Scoped to collective_id = NULL = platform-wide.
INSERT INTO party_roles (party_id, role, collective_id) VALUES
  ('d2000000-0000-0000-0000-000000000006', 'artist', NULL),
  ('d2000000-0000-0000-0000-000000000007', 'artist', NULL),
  ('d2000000-0000-0000-0000-000000000008', 'artist', NULL),
  ('d2000000-0000-0000-0000-000000000009', 'artist', NULL),
  ('d2000000-0000-0000-0000-00000000000a', 'artist', NULL),
  ('d2000000-0000-0000-0000-00000000000b', 'artist', NULL),
  ('d2000000-0000-0000-0000-00000000000c', 'artist', NULL),
  ('d3000000-0000-0000-0000-000000000002', 'artist', NULL),
  ('d3000000-0000-0000-0000-000000000003', 'artist', NULL),
  ('d3000000-0000-0000-0000-000000000004', 'artist', NULL),
  ('d3000000-0000-0000-0000-000000000005', 'artist', NULL),
  ('d3000000-0000-0000-0000-000000000006', 'artist', NULL),
  ('d3000000-0000-0000-0000-000000000007', 'artist', NULL)
ON CONFLICT (party_id, role, collective_id) DO NOTHING;

-- artist_profiles rows — services[] drives the Discover role filter chip.
-- Values match PEOPLE_PRIMARY + PEOPLE_MORE in discover/page.tsx.
INSERT INTO artist_profiles (party_id, slug, bio, services, rate_range, is_verified, is_active) VALUES
  ('d2000000-0000-0000-0000-000000000006', 'kiara-lens',
   'Night photographer. Resident at warehouse parties + weekly editorials.',
   ARRAY['photographer'], '$400–800 / night', false, true),
  ('d2000000-0000-0000-0000-000000000007', 'reel-north',
   'Run-and-gun event video. Same-night recap reels, 48h turnaround on long-form.',
   ARRAY['videographer'], '$600–1,200 / event', false, true),
  ('d2000000-0000-0000-0000-000000000008', 'dara-pham',
   'Artist manager. Represents 4 Toronto-based house DJs. Full-service — bookings, contracts, ride-outs.',
   ARRAY['artist_manager'], '15% commission', false, true),
  ('d2000000-0000-0000-0000-000000000009', 'ellis-wong',
   'Tour manager — North American circuit. Comfortable with 20–200 cap rooms, solo or with crew.',
   ARRAY['tour_manager'], '$1,500 / weekend', false, true),
  ('d2000000-0000-0000-0000-00000000000a', 'halle-rook',
   'Booking agent. Specialises in melodic techno + deep house. Toronto, Montreal, NYC routes.',
   ARRAY['booking_agent'], '10% of fee', false, true),
  ('d2000000-0000-0000-0000-00000000000b', 'mercury-one',
   'MC / host — intro sets, crowd work, breakdowns. Comfortable on mic without breaking the vibe.',
   ARRAY['mc_host'], '$200–400 / set', false, true),
  ('d2000000-0000-0000-0000-00000000000c', 'lucy-ford',
   'Promoter. 3 years running house nights across the Dundas West strip. 400+ person mailing list.',
   ARRAY['promoter'], 'flat or % — flexible', false, true),
  ('d3000000-0000-0000-0000-000000000002', 'glyph-studio',
   'Design studio for nightlife. Flyers, IG templates, merch. Lead time 1–2 weeks.',
   ARRAY['graphic_designer'], '$300–1,500 / project', false, true),
  ('d3000000-0000-0000-0000-000000000003', 'low-end-sound',
   'Turnkey PA + engineering for 150–500 cap rooms. Funktion-One and d&b rigs available.',
   ARRAY['sound_production'], '$600–2,000 / night', false, true),
  ('d3000000-0000-0000-0000-000000000004', 'chromaflare',
   'Lighting + visuals. Intelligent fixtures, haze, LED mapping. Works with any venue rider.',
   ARRAY['lighting_production'], '$400–1,500 / event', false, true),
  ('d3000000-0000-0000-0000-000000000005', 'doors-and-lines',
   'Door + security + coat check staffing. Insured, licensed, experienced with QR + paper lists.',
   ARRAY['event_staff'], '$25–40 / hr per head', false, true),
  ('d3000000-0000-0000-0000-000000000006', 'signal-pr',
   'PR + press outreach for dance music. Blogs, local media, artist interviews.',
   ARRAY['pr_publicist'], '$500–2,000 / campaign', false, true),
  ('d3000000-0000-0000-0000-000000000007', 'low-tide-drinks',
   'RTD alcohol sponsor. Comps product + signage for 200+ cap house nights in Toronto.',
   ARRAY['sponsor'], 'in-kind + $500 fee', false, true)
ON CONFLICT (party_id) DO NOTHING;

-- One demo email per profile — makes it obvious in contact cards these
-- aren't live people. Demo address is reserved under trynocturn.com so
-- no real outbound email can accidentally go to a demo identity.
INSERT INTO party_contact_methods (party_id, type, value, is_primary) VALUES
  ('d2000000-0000-0000-0000-000000000006', 'email',     'demo+kiaralens@trynocturn.com',     true),
  ('d2000000-0000-0000-0000-000000000006', 'instagram', '@kiaralens.jpg',                    false),
  ('d2000000-0000-0000-0000-000000000007', 'email',     'demo+reelnorth@trynocturn.com',     true),
  ('d2000000-0000-0000-0000-000000000007', 'instagram', '@reelnorth.co',                     false),
  ('d2000000-0000-0000-0000-000000000008', 'email',     'demo+darapham@trynocturn.com',      true),
  ('d2000000-0000-0000-0000-000000000008', 'instagram', '@darapham',                         false),
  ('d2000000-0000-0000-0000-000000000009', 'email',     'demo+elliswong@trynocturn.com',     true),
  ('d2000000-0000-0000-0000-00000000000a', 'email',     'demo+hallerook@trynocturn.com',     true),
  ('d2000000-0000-0000-0000-00000000000a', 'instagram', '@hallerook.bookings',               false),
  ('d2000000-0000-0000-0000-00000000000b', 'email',     'demo+mercuryone@trynocturn.com',    true),
  ('d2000000-0000-0000-0000-00000000000b', 'instagram', '@mercuryone.mc',                    false),
  ('d2000000-0000-0000-0000-00000000000c', 'email',     'demo+lucyford@trynocturn.com',      true),
  ('d2000000-0000-0000-0000-00000000000c', 'instagram', '@lucyford.promotes',                false),
  ('d3000000-0000-0000-0000-000000000002', 'email',     'demo+glyphstudio@trynocturn.com',   true),
  ('d3000000-0000-0000-0000-000000000002', 'website',   'https://demo-glyph.studio',         false),
  ('d3000000-0000-0000-0000-000000000003', 'email',     'demo+lowendsound@trynocturn.com',   true),
  ('d3000000-0000-0000-0000-000000000003', 'website',   'https://demo-lowend.sound',         false),
  ('d3000000-0000-0000-0000-000000000004', 'email',     'demo+chromaflare@trynocturn.com',   true),
  ('d3000000-0000-0000-0000-000000000005', 'email',     'demo+doorsandlines@trynocturn.com', true),
  ('d3000000-0000-0000-0000-000000000006', 'email',     'demo+signalpr@trynocturn.com',      true),
  ('d3000000-0000-0000-0000-000000000006', 'website',   'https://demo-signalpr.agency',      false),
  ('d3000000-0000-0000-0000-000000000007', 'email',     'demo+lowtidedrinks@trynocturn.com', true),
  ('d3000000-0000-0000-0000-000000000007', 'website',   'https://demo-lowtide.drinks',       false)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- EVENT A — 5 days out, PUBLISHED, urgent sales story
--   "No Sleep Club × The Baby G"
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO events (
  id, collective_id, venue_party_id, title, slug, description,
  starts_at, ends_at, doors_at,
  venue_name, venue_address, city, capacity,
  status, is_published, is_free, min_age, vibe_tags,
  published_at
) VALUES (
  'e1000000-0000-0000-0000-000000000001',
  '901f830a-fccd-47ef-ba40-0c9d968a14ef',
  'd1000000-0000-0000-0000-000000000001',
  'No Sleep Club × The Baby G',
  'no-sleep-club-x-the-baby-g',
  'Three rooms of deep house + melodic techno in the Baby G warehouse. Doors 10PM. Last call 3AM.',
  (now() + interval '5 days'),  (now() + interval '5 days 4 hours'),  (now() + interval '5 days'),
  'The Baby G', '1608 Dundas St W', 'Toronto', 250,
  'published', true, false, 19,
  ARRAY['deep-melodic','underground','warehouse'],
  now() - interval '10 days'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO ticket_tiers (id, event_id, name, price, capacity, tickets_sold, is_active, sort_order) VALUES
  ('t1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Early Bird', 20.00,  50, 0, true, 0),
  ('t1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'GA',         30.00, 150, 0, true, 1),
  ('t1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', 'Door',       40.00,  50, 0, true, 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO event_artists (event_id, party_id, name, role, set_time, fee, sort_order) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000003', 'Jovane Kay',      'opener',    (now() + interval '5 days 30 minutes'),  350, 0),
  ('e1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000002', 'Midnight Rivers', 'support',   (now() + interval '5 days 90 minutes'),  400, 1),
  ('e1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'LockEight',       'headliner', (now() + interval '5 days 180 minutes'), 250, 2);

INSERT INTO event_expenses (event_id, category, description, amount, is_paid, created_by) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'talent',     'Jovane Kay — opener fee',       350,  true,  '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000001', 'talent',     'Midnight Rivers — support fee', 400,  true,  '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000001', 'talent',     'LockEight — headliner fee',     250,  false, '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000001', 'venue',      'Baby G warehouse rental',        500, false, '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000001', 'sound',      'Sound engineer + PA rental',     200, false, '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000001', 'marketing',  'Flyer photography',              150, true,  '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a');

-- Tasks mix: 5 done + 2 in-progress + 4 todo = 11 total, so the Playbook
-- progress bar reads ~45% and "next action" looks real.
INSERT INTO event_tasks (event_id, title, description, status, due_at, completed_at, created_by) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'Confirm headliner contract',  'LockEight contract signed + deposit sent',          'done',        (now() + interval '-14 days'), (now() + interval '-13 days'), '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000001', 'Book support + opener',       'Midnight Rivers + Jovane Kay confirmed',            'done',        (now() + interval '-10 days'), (now() + interval '-10 days'), '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000001', 'Lock venue + deposit',        'Baby G confirmed, deposit paid',                    'done',        (now() + interval '-12 days'), (now() + interval '-11 days'), '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000001', 'Finalize flyer',              'Deep-dark aesthetic, names + date + venue',         'done',        (now() + interval '-7 days'),  (now() + interval '-6 days'),  '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000001', 'Post lineup announcement',    'IG carousel, tag all three artists',                'done',        (now() + interval '-5 days'),  (now() + interval '-5 days'),  '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000001', 'Post set times reveal',       '1 week out schedule drop — stories + feed',         'in_progress', (now() - interval '2 hours'),  NULL,                          '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000001', '"Limited tickets" post',      'Scarcity push with remaining count',                'in_progress', (now() + interval '1 days'),   NULL,                          '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000001', 'Confirm sound + door staff',  'Day-of ops — arrival times, contact numbers',       'todo',        (now() + interval '3 days'),   NULL,                          '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000001', 'Print guest list',            'QR scanner tested on both phones',                  'todo',        (now() + interval '4 days'),   NULL,                          '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000001', 'Day-of checklist',            'Sound check 6PM, bar stock, guest list, scanner',   'todo',        (now() + interval '5 days'),   NULL,                          '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000001', 'Post-event recap + thanks',   'Within 24h. Tag artists + venue. Carousel.',        'todo',        (now() + interval '6 days'),   NULL,                          '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a');

-- ═══════════════════════════════════════════════════════════════════════
-- EVENT B — 21 days out, PUBLISHED, early planning story
--   "Cold Storage Vol. 2"
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO events (
  id, collective_id, venue_party_id, title, slug, description,
  starts_at, ends_at, doors_at,
  venue_name, venue_address, city, capacity,
  status, is_published, is_free, min_age, vibe_tags,
  published_at
) VALUES (
  'e1000000-0000-0000-0000-000000000002',
  '901f830a-fccd-47ef-ba40-0c9d968a14ef',
  'd1000000-0000-0000-0000-000000000002',
  'Cold Storage Vol. 2',
  'cold-storage-vol-2',
  'No Sleep Club returns to Infinity Room with a minimal/microhouse lineup. Intimate room, all-night dance.',
  (now() + interval '21 days'), (now() + interval '21 days 5 hours'), (now() + interval '21 days'),
  'Infinity Room', '66 Wellington St E', 'Toronto', 180,
  'published', true, false, 19,
  ARRAY['minimal','underground','intimate'],
  now() - interval '2 days'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO ticket_tiers (id, event_id, name, price, capacity, tickets_sold, is_active, sort_order) VALUES
  ('t1000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000002', 'Early Bird', 25.00,  40, 0, true, 0),
  ('t1000000-0000-0000-0000-000000000012', 'e1000000-0000-0000-0000-000000000002', 'GA',         35.00, 140, 0, true, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO event_artists (event_id, party_id, name, role, set_time, fee, sort_order) VALUES
  ('e1000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000004', 'Silva Twin',      'opener',    (now() + interval '21 days 30 minutes'),  200, 0),
  ('e1000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000001', 'LockEight',       'headliner', (now() + interval '21 days 150 minutes'), 300, 1);

INSERT INTO event_expenses (event_id, category, description, amount, is_paid, created_by) VALUES
  ('e1000000-0000-0000-0000-000000000002', 'talent',     'Silva Twin — opener fee',       200, false, '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000002', 'talent',     'LockEight — headliner fee',     300, false, '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000002', 'venue',      'Infinity Room rental',          400, false, '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000002', 'sound',      'Sound + lighting',              180, false, '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a');

INSERT INTO event_tasks (event_id, title, description, status, due_at, completed_at, created_by) VALUES
  ('e1000000-0000-0000-0000-000000000002', 'Confirm headliner',        'LockEight re-booked after Baby G success',        'done',        (now() + interval '-3 days'),  (now() + interval '-3 days'), '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000002', 'Lock venue',                'Infinity Room booked',                            'done',        (now() + interval '-2 days'),  (now() + interval '-2 days'), '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000002', 'Book remaining support',   'Need one more act — shortlist: Nala, Jovane',     'in_progress', (now() + interval '5 days'),   NULL,                         '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000002', 'Design flyer',              'Minimal aesthetic — matches Vol. 1 series',       'in_progress', (now() + interval '7 days'),   NULL,                         '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000002', 'Publish event page',        'Go live once flyer is ready',                     'todo',        (now() + interval '10 days'),  NULL,                         '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000002', 'Teaser post (no lineup)',   'Dark/moody image, date only',                     'todo',        (now() + interval '11 days'),  NULL,                         '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000002', 'Full lineup reveal',        'Tag everyone. Carousel.',                          'todo',        (now() + interval '14 days'),  NULL,                         '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a');

-- ═══════════════════════════════════════════════════════════════════════
-- EVENT C — 45 days out, DRAFT, placeholder showing pipeline depth
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO events (
  id, collective_id, title, slug, description,
  starts_at, status, is_published, is_free, min_age,
  vibe_tags
) VALUES (
  'e1000000-0000-0000-0000-000000000003',
  '901f830a-fccd-47ef-ba40-0c9d968a14ef',
  'No Sleep Club presents (TBA — summer series)',
  'no-sleep-club-summer-tba',
  'Save the date. Summer warehouse takeover. Lineup + venue dropping 4 weeks out.',
  (now() + interval '45 days'),
  'draft', false, false, 19,
  ARRAY['warehouse','peak-time']
) ON CONFLICT (id) DO NOTHING;

INSERT INTO event_tasks (event_id, title, description, status, due_at, created_by) VALUES
  ('e1000000-0000-0000-0000-000000000003', 'Scout venue options',      'Baby G summer availability + 2 alternates',   'in_progress', (now() + interval '7 days'),  '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a'),
  ('e1000000-0000-0000-0000-000000000003', 'Shortlist headliners',      'Reach out to 3 booking agents',               'todo',        (now() + interval '10 days'), '7b58e719-933d-4c87-bdaa-1f02aa5ebc8a');

-- ═══════════════════════════════════════════════════════════════════════
-- PLAYBOOK TEMPLATE (config tier — makes the Playbook picker show content)
-- Mirrors the LAUNCH_PROMOTE task list in src/app/actions/launch-playbook.ts
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO playbook_templates (id, collective_id, name, description, is_global) VALUES
  ('d3000000-0000-0000-0000-000000000001', NULL, 'Launch Promote',
   'Full 4-week promo ramp for a new event. 26 tasks across talent, marketing, logistics.',
   true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO playbook_task_templates (template_id, title, description, due_offset, sort_order) VALUES
  ('d3000000-0000-0000-0000-000000000001', 'Confirm headliner / lock in talent',  'Get verbal or written confirmation from main act',                 0,   0),
  ('d3000000-0000-0000-0000-000000000001', 'Invite team members to event chat',    'Get your crew in the loop from day one',                           0,   1),
  ('d3000000-0000-0000-0000-000000000001', 'Create or upload event poster',        'Design flyer or upload from designer',                            -24,  2),
  ('d3000000-0000-0000-0000-000000000001', 'Write event description and copy',      'Craft the story for your event page',                             -48,  3),
  ('d3000000-0000-0000-0000-000000000001', 'Publish event page',                    'Go live so tickets are available',                                -72,  4),
  ('d3000000-0000-0000-0000-000000000001', 'Teaser post (no lineup)',                'Dark/moody image, date only. Build intrigue.',                   -72,  5),
  ('d3000000-0000-0000-0000-000000000001', 'Lineup reveal — full flyer',             'Drop flyer, tag every artist',                                  -168,  6),
  ('d3000000-0000-0000-0000-000000000001', 'Share to personal + collective socials', 'Every team member shares for max reach',                        -168,  7),
  ('d3000000-0000-0000-0000-000000000001', 'Artist spotlight #1 (headliner)',        'Bio, music link, vibe',                                         -216,  8),
  ('d3000000-0000-0000-0000-000000000001', 'Set up promo codes for street team',     'Discount codes for promoters + ambassadors',                   -216,  9),
  ('d3000000-0000-0000-0000-000000000001', 'IG story / reel teaser (15-30s)',        'Short video — music, venue, past event clips',                 -264, 10),
  ('d3000000-0000-0000-0000-000000000001', 'Artist spotlight #2 (support)',          'Feature supporting artist',                                     -336, 11),
  ('d3000000-0000-0000-0000-000000000001', 'FAQ post',                                'Venue, dress code, age, parking',                              -384, 12),
  ('d3000000-0000-0000-0000-000000000001', 'Outreach to local blogs / pages',        'Press release or event details',                                -384, 13),
  ('d3000000-0000-0000-0000-000000000001', 'Early bird ending reminder',              'Scarcity push before tier change',                             -432, 14),
  ('d3000000-0000-0000-0000-000000000001', 'Set times reveal',                        'Schedule reveal helps attendees plan',                         -504, 15),
  ('d3000000-0000-0000-0000-000000000001', '1 week out countdown',                    'Builds excitement',                                             -576, 16),
  ('d3000000-0000-0000-0000-000000000001', '"Limited tickets" post',                   'Share actual counts if possible',                             -624, 17),
  ('d3000000-0000-0000-0000-000000000001', 'Confirm all vendors',                     'Sound, lights, security — arrival + contacts',                  -648, 18),
  ('d3000000-0000-0000-0000-000000000001', 'Day-of logistics checklist',              'Doors, sound check, guest list, scanner, bar stock',            -768, 19),
  ('d3000000-0000-0000-0000-000000000001', '"Tonight" hype post + story',              'Day-of social media',                                          -792, 20),
  ('d3000000-0000-0000-0000-000000000001', 'Print guest list / test QR scanner',      'Backup paper + working check-in tech',                          -792, 21),
  ('d3000000-0000-0000-0000-000000000001', 'Post-event thanks + recap teaser',        '24h post-event, while energy is fresh',                           24, 22),
  ('d3000000-0000-0000-0000-000000000001', 'Review financials + send settlement',     'Generate P&L, split revenue, send settlement',                    48, 23);

COMMIT;
