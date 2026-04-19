import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";
import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const appUrl = "https://app.trynocturn.com";

  const staticPages: MetadataRoute.Sitemap = [
    { url: appUrl, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${appUrl}/legal/terms`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${appUrl}/legal/privacy`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
  ];

  const { data: events } = await supabase
    .from("events")
    .select("slug, updated_at, collective_id, collectives(slug)")
    .in("status", ["published", "completed"])
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(500);

  const eventPages: MetadataRoute.Sitemap = (events ?? []).map((e) => {
    const collective = e.collectives as unknown as { slug: string } | null;
    return {
      url: `${appUrl}/e/${collective?.slug ?? "unknown"}/${e.slug}`,
      lastModified: new Date(e.updated_at),
      changeFrequency: "daily" as const,
      priority: 0.8,
    };
  });

  return [...staticPages, ...eventPages];
}
