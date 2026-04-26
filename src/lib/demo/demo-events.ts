/**
 * Demo events for the pitch account (shawnqanun@gmail.com). These are
 * full-shape event rows so the list + cards render with nothing missing.
 */

const now = Date.now();
const day = 24 * 60 * 60 * 1000;
const iso = (daysAgo: number) => new Date(now - daysAgo * day).toISOString();

export type DemoEventRow = {
  id: string;
  title: string;
  slug: string;
  starts_at: string;
  status: "draft" | "published" | "completed" | "cancelled";
  flyer_url: string | null;
  venue_name: string | null;
  city: string | null;
};

export const DEMO_EVENT_ROWS: DemoEventRow[] = [
  {
    id: "demo-evt-upcoming-1",
    title: "Deep Frequencies Vol. 3",
    slug: "deep-frequencies-vol-3",
    starts_at: iso(-18),
    status: "published",
    flyer_url: null,
    venue_name: "The Velvet Underground",
    city: "Toronto",
  },
  {
    id: "demo-evt-upcoming-2",
    title: "House of Shadows",
    slug: "house-of-shadows",
    starts_at: iso(-32),
    status: "published",
    flyer_url: null,
    venue_name: "CODA",
    city: "Toronto",
  },
  {
    id: "demo-evt-draft-1",
    title: "Summer Rooftop Session",
    slug: "summer-rooftop-session",
    starts_at: iso(-48),
    status: "draft",
    flyer_url: null,
    venue_name: null,
    city: "Toronto",
  },
  {
    id: "demo-evt-past-1",
    title: "Nocturnal Sounds: Opening Night",
    slug: "nocturnal-sounds-opening",
    starts_at: iso(5),
    status: "completed",
    flyer_url: null,
    venue_name: "CODA",
    city: "Toronto",
  },
  {
    id: "demo-evt-past-2",
    title: "Warehouse Sessions 001",
    slug: "warehouse-sessions-001",
    starts_at: iso(21),
    status: "completed",
    flyer_url: null,
    venue_name: "Nocturne Bar",
    city: "Toronto",
  },
  {
    id: "demo-evt-past-3",
    title: "Basement Broadcast 004",
    slug: "basement-broadcast-004",
    starts_at: iso(45),
    status: "completed",
    flyer_url: null,
    venue_name: "The Velvet Underground",
    city: "Toronto",
  },
];
