// Centralized date/time formatting (B02).
//
// Events store `starts_at` as TIMESTAMPTZ (UTC). Before this helper existed
// the app rendered raw `new Date(starts_at).toLocaleDateString()` in some
// places and custom formatters in others, which meant the same event surfaced
// with different dates on different routes (public page showed "Sat Apr 25,
// 10 PM" while operator dashboard showed "Sun Apr 26, 2 AM" for the same row).
//
// Until NOC-XX adds per-event `events.timezone`, we assume Toronto for every
// operator surface — matches where the first cohort of collectives run nights.
// Public pages should also render in the event's local TZ (also Toronto for
// now), so buyers see the same clock the operator sees.

export const DEFAULT_TIMEZONE = "America/Toronto";

/**
 * Format an ISO timestamp in a specific timezone with `Intl.DateTimeFormat`.
 * Never call `new Date(iso).toLocaleDateString()` directly on an ISO string
 * from the DB — it renders in the browser's local TZ, which is not what we
 * want for nightlife (a 10 PM show is 10 PM wherever you're viewing from).
 */
export function formatEventDateTime(
  iso: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
  timezone: string = DEFAULT_TIMEZONE,
): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    ...options,
  }).format(d);
}

/** "Sat Apr 25" — short weekday + month/day in the event's timezone. */
export function formatEventShortDate(iso: string | Date | null | undefined, timezone?: string): string {
  return formatEventDateTime(
    iso,
    { weekday: "short", month: "short", day: "numeric" },
    timezone,
  );
}

/** "Saturday, April 25, 2026" — full spelled-out date in the event's timezone. */
export function formatEventLongDate(iso: string | Date | null | undefined, timezone?: string): string {
  return formatEventDateTime(
    iso,
    { weekday: "long", month: "long", day: "numeric", year: "numeric" },
    timezone,
  );
}

/** "10:00 PM" — hour + minute in the event's timezone. */
export function formatEventTime(iso: string | Date | null | undefined, timezone?: string): string {
  return formatEventDateTime(
    iso,
    { hour: "numeric", minute: "2-digit" },
    timezone,
  );
}

/** "Apr 25" — compact date for card lists. */
export function formatEventCardDate(iso: string | Date | null | undefined, timezone?: string): string {
  return formatEventDateTime(
    iso,
    { month: "short", day: "numeric" },
    timezone,
  );
}

/** "25" (just the day number — for corner badges like hero date chip). */
export function formatEventDayNumber(iso: string | Date | null | undefined, timezone?: string): string {
  return formatEventDateTime(iso, { day: "numeric" }, timezone);
}

/** "APR" (month abbrev uppercase — for corner badges). */
export function formatEventMonthAbbr(iso: string | Date | null | undefined, timezone?: string): string {
  return formatEventDateTime(iso, { month: "short" }, timezone).toUpperCase();
}
