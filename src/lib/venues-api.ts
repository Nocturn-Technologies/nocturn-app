// TODO: Replace with Google Places API when key is available
// This module abstracts venue search/detail so swapping in the real API
// only requires changing the implementation of these two functions.

import { MOCK_VENUES, type VenueResult } from "./mock-venues";

export type VenueType = "Club" | "Bar" | "Warehouse" | "Gallery" | "Rooftop" | "Live Music" | "Underground";
export type { VenueResult } from "./mock-venues";

const ALL_TYPES: VenueType[] = ["Club", "Bar", "Warehouse", "Gallery", "Rooftop", "Live Music", "Underground"];

/**
 * Search venues by query string and optional type filter.
 * Currently returns filtered mock data.
 * When Google Places is connected, this will call the Nearby Search / Text Search endpoint.
 */
export async function searchVenues(
  query: string,
  filter: VenueType | "All" = "All"
): Promise<VenueResult[]> {
  // Simulate network latency
  await new Promise((r) => setTimeout(r, 300));

  let results = [...MOCK_VENUES];

  // Filter by type
  if (filter !== "All" && ALL_TYPES.includes(filter)) {
    results = results.filter((v) => v.venue_type === filter);
  }

  // Filter by search query
  if (query.trim()) {
    const q = query.toLowerCase();
    results = results.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.neighbourhood.toLowerCase().includes(q) ||
        v.address.toLowerCase().includes(q) ||
        v.venue_type.toLowerCase().includes(q)
    );
  }

  // Sort by rating (descending) as default relevance proxy
  results.sort((a, b) => b.rating - a.rating);

  return results;
}

/**
 * Get full venue detail by place_id.
 * Currently looks up from mock data.
 * When Google Places is connected, this will call the Place Details endpoint.
 */
export async function getVenueDetail(placeId: string): Promise<VenueResult | null> {
  await new Promise((r) => setTimeout(r, 150));
  return MOCK_VENUES.find((v) => v.place_id === placeId) ?? null;
}
