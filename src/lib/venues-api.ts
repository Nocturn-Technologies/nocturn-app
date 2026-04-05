import { MOCK_VENUES, type VenueResult } from "./mock-venues";

export type VenueType = "Club" | "Bar" | "Warehouse" | "Gallery" | "Rooftop" | "Live Music" | "Underground";
export type { VenueResult } from "./mock-venues";

/**
 * Search venues via Google Places API (through our API route).
 * Falls back to mock data if the API call fails.
 */
export async function searchVenues(
  query: string,
  filter: VenueType | "All" = "All"
): Promise<VenueResult[]> {
  try {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (filter !== "All") params.set("filter", filter);

    const res = await fetch(`/api/venues-search?${params.toString()}`);
    if (!res.ok) throw new Error(`API ${res.status}`);

    const data = await res.json();
    if (data.venues && data.venues.length > 0) {
      return data.venues as VenueResult[];
    }
  } catch {
    // Fall through to mock data
  }

  // Fallback to mock data
  return searchMockVenues(query, filter);
}

function searchMockVenues(query: string, filter: VenueType | "All"): VenueResult[] {
  let results = [...MOCK_VENUES];

  if (filter !== "All") {
    results = results.filter((v) => v.venue_type === filter);
  }

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

  results.sort((a, b) => b.rating - a.rating);
  return results;
}
