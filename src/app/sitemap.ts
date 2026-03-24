import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";
import type { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Get all published events with their collective slugs
  const { data: events } = await supabase
    .from("events")
    .select("slug, starts_at, collectives(slug)")
    .eq("status", "published")
    .order("starts_at", { ascending: false });

  const eventUrls: MetadataRoute.Sitemap = (events ?? []).map((e) => {
    const collective = e.collectives as unknown as { slug: string };
    return {
      url: `https://app.trynocturn.com/e/${collective?.slug}/${e.slug}`,
      lastModified: new Date(e.starts_at),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    };
  });

  return [
    {
      url: "https://app.trynocturn.com",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    ...eventUrls,
  ];
}
