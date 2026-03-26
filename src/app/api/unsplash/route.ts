import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

// Curated nightlife search terms for better results
const NIGHTLIFE_QUERIES = [
  "nightclub party",
  "dj club",
  "concert crowd lights",
  "neon nightlife",
  "underground club",
  "music venue dark",
  "warehouse party",
  "dance floor lights",
  "club atmosphere",
  "night event lights",
];

export async function GET(req: NextRequest) {
  // Auth check — prevent unauthenticated API abuse
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!UNSPLASH_ACCESS_KEY) {
    return NextResponse.json(
      { error: "Unsplash not configured" },
      { status: 500 }
    );
  }

  const query = req.nextUrl.searchParams.get("q") || "";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1", 10) || 1;

  // If no custom query, use curated nightlife terms
  const searchQuery = query.trim()
    ? `${query} nightlife`
    : NIGHTLIFE_QUERIES[Math.floor(Math.random() * NIGHTLIFE_QUERIES.length)];

  const res = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&per_page=12&page=${page}&orientation=portrait&content_filter=high`,
    {
      headers: {
        Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
      },
      next: { revalidate: 3600 }, // Cache for 1 hour
    }
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to search Unsplash" },
      { status: res.status }
    );
  }

  const data = await res.json();

  const photos = (data.results || []).map(
    (p: {
      id: string;
      urls: { regular: string; small: string };
      user: { name: string; links: { html: string } };
      links: { download_location: string };
    }) => ({
      id: p.id,
      url: p.urls.regular,
      thumbUrl: p.urls.small,
      photographer: p.user.name,
      photographerUrl: p.user.links.html,
      downloadUrl: p.links.download_location,
    })
  );

  return NextResponse.json({ photos });
}

// Track download per Unsplash API guidelines
export async function POST(req: NextRequest) {
  if (!UNSPLASH_ACCESS_KEY) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const { downloadUrl } = await req.json();
  if (!downloadUrl || typeof downloadUrl !== "string" || !downloadUrl.startsWith("https://api.unsplash.com/")) {
    return NextResponse.json({ error: "Invalid downloadUrl" }, { status: 400 });
  }

  // Trigger download tracking (Unsplash requirement)
  await fetch(downloadUrl, {
    headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
  });

  return NextResponse.json({ ok: true });
}
