import { NextRequest, NextResponse } from "next/server";

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

// Google Places Nearby Search (legacy — well-supported)
const NEARBY_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";
const PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";
const TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";

// Toronto centre
const TORONTO_LAT = 43.6532;
const TORONTO_LNG = -79.3832;
const SEARCH_RADIUS = 15000; // 15km covers greater Toronto

// Types to request from Google
const NIGHTLIFE_TYPES = ["night_club", "bar", "restaurant"];

interface PlaceResult {
  place_id: string;
  name: string;
  geometry: { location: { lat: number; lng: number } };
  rating?: number;
  user_ratings_total?: number;
  vicinity?: string;
  formatted_address?: string;
  types?: string[];
  photos?: { photo_reference: string }[];
  opening_hours?: { open_now?: boolean };
  business_status?: string;
}

function classifyVenueType(types: string[], name: string): string {
  const n = name.toLowerCase();
  if (n.includes("warehouse") || n.includes("loft") || n.includes("factory")) return "Warehouse";
  if (n.includes("gallery") || n.includes("art space")) return "Gallery";
  if (n.includes("rooftop") || n.includes("patio")) return "Rooftop";
  if (n.includes("underground")) return "Underground";
  if (types.includes("night_club")) return "Club";
  if (types.includes("bar")) return "Bar";
  if (n.includes("live") || n.includes("music hall") || n.includes("concert")) return "Live Music";
  return "Bar";
}

function getPhotoUrl(photoRef: string): string {
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photoRef}&key=${GOOGLE_API_KEY}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const filter = searchParams.get("filter") ?? "All";
  const lat = parseFloat(searchParams.get("lat") ?? String(TORONTO_LAT));
  const lng = parseFloat(searchParams.get("lng") ?? String(TORONTO_LNG));

  if (!GOOGLE_API_KEY) {
    return NextResponse.json({ venues: [], error: "Google API key not configured" }, { status: 500 });
  }

  try {
    let places: PlaceResult[] = [];

    if (query.trim()) {
      // Text search for specific queries
      const url = new URL(TEXT_SEARCH_URL);
      url.searchParams.set("query", `${query} nightclub bar venue Toronto`);
      url.searchParams.set("location", `${lat},${lng}`);
      url.searchParams.set("radius", String(SEARCH_RADIUS));
      url.searchParams.set("key", GOOGLE_API_KEY);

      const res = await fetch(url.toString());
      const data = await res.json();
      places = data.results ?? [];
    } else {
      // Nearby search for clubs and bars
      const fetches = NIGHTLIFE_TYPES.map(async (type) => {
        const url = new URL(NEARBY_SEARCH_URL);
        url.searchParams.set("location", `${lat},${lng}`);
        url.searchParams.set("radius", String(SEARCH_RADIUS));
        url.searchParams.set("type", type);
        url.searchParams.set("key", GOOGLE_API_KEY);

        const res = await fetch(url.toString());
        const data = await res.json();
        return (data.results ?? []) as PlaceResult[];
      });

      const allResults = await Promise.all(fetches);
      // Deduplicate by place_id
      const seen = new Set<string>();
      for (const batch of allResults) {
        for (const place of batch) {
          if (!seen.has(place.place_id) && place.business_status !== "CLOSED_PERMANENTLY") {
            seen.add(place.place_id);
            places.push(place);
          }
        }
      }
    }

    // Map to our venue format
    const venues = places.map((place) => {
      const venueType = classifyVenueType(place.types ?? [], place.name);
      return {
        place_id: place.place_id,
        name: place.name,
        venue_type: venueType,
        neighbourhood: (place.vicinity ?? place.formatted_address ?? "").split(",")[0] ?? "",
        address: place.formatted_address ?? place.vicinity ?? "",
        city: "Toronto",
        rating: place.rating ?? 0,
        review_count: place.user_ratings_total ?? 0,
        phone: "",
        website: "",
        capacity: null as number | null,
        latitude: place.geometry.location.lat,
        longitude: place.geometry.location.lng,
        photo_url: place.photos?.[0]?.photo_reference
          ? getPhotoUrl(place.photos[0].photo_reference)
          : null,
        hours: null as { day: string; open: string; close: string }[] | null,
      };
    });

    // Apply venue type filter
    const filtered = filter === "All"
      ? venues
      : venues.filter((v) => v.venue_type === filter);

    // Sort by rating desc
    filtered.sort((a, b) => b.rating - a.rating);

    return NextResponse.json({ venues: filtered.slice(0, 60) });
  } catch (err) {
    console.error("[venues-search] Google Places error:", err);
    return NextResponse.json({ venues: [], error: "Failed to search venues" }, { status: 500 });
  }
}
