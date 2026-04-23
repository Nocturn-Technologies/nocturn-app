-- Restore events.bar_minimum column.
--
-- Per Andrew's NOC-24 review: "bar_minimum is a venue contract term.
-- It's configuration, a planning input you set when you book the venue.
-- It belongs on the event, same as capacity."
--
-- Governance:
--   §1  Config tier
--   §2  Q6 — setting on existing config table → new column
--   §8  additive, backward-compatible, rollback included
--
-- Linear: NOC-33

BEGIN;

ALTER TABLE public.events
  ADD COLUMN bar_minimum NUMERIC(10,2);

COMMENT ON COLUMN public.events.bar_minimum IS
  'Venue contract minimum bar revenue. If actual bar_share total falls short, shortfall is a venue penalty computed at settlement. Never store the shortfall itself (§4).';

COMMIT;
