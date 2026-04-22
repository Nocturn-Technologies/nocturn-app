-- Rollback for 20260421000001_no_sleep_club_demo.sql (NOC-30)
-- Per docs/DB_Data_Governance.md § 8 (even though this is seed data, not
-- schema, same principle — every destructive-if-kept change ships a way out).
--
-- Order of operations: delete in reverse-dependency order. events.id has
-- ON DELETE CASCADE on ticket_tiers / event_tasks / event_expenses /
-- event_artists so deleting events handles those children. venue_profiles
-- + artist_profiles cascade when parties are deleted.
--
-- Idempotent — DELETE by explicit UUID only touches rows this seed created.

BEGIN;

-- ─── Playbook template first (no FKs into it from seeded events) ─────
DELETE FROM playbook_task_templates WHERE template_id = 'd3000000-0000-0000-0000-000000000001';
DELETE FROM playbook_templates     WHERE id          = 'd3000000-0000-0000-0000-000000000001';

-- ─── Events (cascades to tiers, tasks, expenses, artists) ────────────
DELETE FROM events WHERE id IN (
  'e1000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000002',
  'e1000000-0000-0000-0000-000000000003'
);

-- ─── No Sleep Club's seeded contact rows (don't touch the collective) ─
DELETE FROM party_contact_methods
WHERE party_id = '3cce7480-0977-49c4-aadc-6a25d254ab4e'
  AND type IN ('instagram','website')
  AND value IN ('@nosleep.club.to','https://nosleep.club');

-- ─── Artists: contacts → profiles → roles → parties ──────────────────
DELETE FROM party_contact_methods WHERE party_id IN (
  'd2000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000002',
  'd2000000-0000-0000-0000-000000000003',
  'd2000000-0000-0000-0000-000000000004',
  'd2000000-0000-0000-0000-000000000005'
);
DELETE FROM artist_profiles WHERE party_id IN (
  'd2000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000002',
  'd2000000-0000-0000-0000-000000000003',
  'd2000000-0000-0000-0000-000000000004',
  'd2000000-0000-0000-0000-000000000005'
);
DELETE FROM party_roles WHERE party_id IN (
  'd2000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000002',
  'd2000000-0000-0000-0000-000000000003',
  'd2000000-0000-0000-0000-000000000004',
  'd2000000-0000-0000-0000-000000000005'
);
DELETE FROM parties WHERE id IN (
  'd2000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000002',
  'd2000000-0000-0000-0000-000000000003',
  'd2000000-0000-0000-0000-000000000004',
  'd2000000-0000-0000-0000-000000000005'
);

-- ─── Venues: profiles → roles → parties ──────────────────────────────
DELETE FROM venue_profiles WHERE party_id IN (
  'd1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000002'
);
DELETE FROM party_roles WHERE party_id IN (
  'd1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000002'
);
DELETE FROM parties WHERE id IN (
  'd1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000002'
);

COMMIT;
