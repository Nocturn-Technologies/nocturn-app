/**
 * Canonical expense category registry.
 *
 * Previously three files diverged on what "valid expense categories" meant:
 * - `event-financials.ts` accepted the newer finance-UI set
 * - `settlements.ts` accepted a different legacy+new mix
 * - `budget-planner.ts` declared its own `ExpenseCategory` union
 *
 * Result: a "talent" expense created via the budget step wasn't readable
 * by all the places that rendered or categorized expenses; legacy values
 * (`dj`, `artist`, `promotion`, `miscellaneous`, `staff`, `supply`, `travel`)
 * were only accepted on SOME paths, so the same string could be valid on
 * write and invalid on edit.
 *
 * This registry is the single source of truth. `CANONICAL_EXPENSE_CATEGORIES`
 * drives the UI chip tray and the type system. `ACCEPTED_EXPENSE_CATEGORIES`
 * adds legacy aliases we still accept on write for backward compatibility —
 * displayed via `categoryLabel()` which maps anything unrecognized to
 * "Other" rather than leaking raw strings to operators.
 */

/**
 * Modern canonical categories. These drive:
 * - wizard/edit chip tray
 * - `ExpenseCategory` union type
 * - display labels
 *
 * Keep in sync with the wizard's chip definitions in
 * `src/app/(dashboard)/dashboard/events/new/page.tsx` + the edit form.
 */
export const CANONICAL_EXPENSE_CATEGORIES = [
  "talent",
  "flights",
  "hotel",
  "transport",
  "per_diem",
  "venue_rental",
  "bar_minimum",
  "deposit",
  "ads",
  "graphic_design",
  "photo",
  "video",
  "other",
] as const;

export type ExpenseCategory = (typeof CANONICAL_EXPENSE_CATEGORIES)[number];

/**
 * Legacy category aliases still valid on write. Stored as-is in the DB so
 * existing rows continue to round-trip. Readers should use `categoryLabel()`
 * which maps these to the canonical display string.
 *
 * Removal plan: after a migration pass that rewrites legacy rows to their
 * canonical equivalents, these can move to read-only.
 */
const LEGACY_EXPENSE_CATEGORIES = [
  "venue",         // replaced by `venue_rental`
  "production",    // replaced by `other`
  "sound",         // replaced by `other`
  "lighting",      // replaced by `other`
  "staffing",      // replaced by `other` (fka `staff`, `dj`)
  "security",      // replaced by `other`
  "marketing",     // replaced by `ads`
  "hospitality",   // replaced by `per_diem`
  "transportation",// replaced by `transport`
  "equipment",     // replaced by `other`
  "decor",         // replaced by `other`
  "insurance",     // replaced by `other`
  "permits",       // replaced by `other`
  "booking_fee",   // replaced by `other`
  // Ancient legacy
  "artist",
  "dj",
  "promotion",
  "staff",
  "miscellaneous",
  "supply",
  "travel",
] as const;

/**
 * All categories that pass server-side input validation. Includes both
 * canonical + legacy. Write-side gate for server actions.
 */
export const ACCEPTED_EXPENSE_CATEGORIES: readonly string[] = [
  ...CANONICAL_EXPENSE_CATEGORIES,
  ...LEGACY_EXPENSE_CATEGORIES,
];

export function isAcceptedExpenseCategory(c: unknown): c is string {
  return typeof c === "string" && ACCEPTED_EXPENSE_CATEGORIES.includes(c);
}

/**
 * Human-readable label for any category string — canonical, legacy, or unknown.
 * Unknown strings render as "Other" so the UI never leaks raw identifiers.
 */
const CATEGORY_LABELS: Record<string, string> = {
  talent: "Talent fee",
  flights: "Flights",
  hotel: "Hotel",
  transport: "Transport",
  per_diem: "Per diem",
  venue_rental: "Venue rental",
  bar_minimum: "Bar minimum",
  deposit: "Deposit",
  ads: "Ads",
  graphic_design: "Graphic design",
  photo: "Photo",
  video: "Video",
  other: "Other",
  // Legacy aliases
  venue: "Venue",
  production: "Production",
  sound: "Sound",
  lighting: "Lighting",
  staffing: "Staff",
  security: "Security",
  marketing: "Marketing",
  hospitality: "Hospitality",
  transportation: "Transport",
  equipment: "Equipment",
  decor: "Decor",
  insurance: "Insurance",
  permits: "Permits",
  booking_fee: "Booking fee",
  artist: "Artist",
  dj: "DJ",
  promotion: "Promotion",
  staff: "Staff",
  miscellaneous: "Misc",
  supply: "Supplies",
  travel: "Travel",
};

export function categoryLabel(category: string | null | undefined): string {
  if (!category) return "Other";
  return CATEGORY_LABELS[category] ?? "Other";
}

/**
 * Set of categories the settlement + finance P&L excludes from the
 * "itemized expenses" sum because they're already accounted for via
 * dedicated columns on the events table. Keeping this shared so
 * auto-settlement, settlements, and getEventFinancials can never drift.
 */
export const VENUE_CATEGORIES = new Set(["venue_rental", "deposit", "venue"]);

/**
 * Set of categories that represent headliner costs. When an event has
 * `event_artists.fee` rows, matching expense-row amounts are filtered to
 * prevent double-count (see per-artist pair logic in auto-settlement).
 */
export const HEADLINER_CATEGORIES = new Set([
  "talent",
  "flights",
  "hotel",
  "transport",
  "per_diem",
  // Legacy equivalents — an old event row with category='artist' should
  // also dedupe against event_artists.fee.
  "artist",
  "dj",
  "transportation",
]);
