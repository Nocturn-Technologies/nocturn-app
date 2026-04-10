import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/config";

/**
 * POST /api/setup-storage
 * Creates required storage buckets if they don't exist.
 * Protected by CRON_SECRET (or run manually once).
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Require CRON_SECRET to be set
    if (!cronSecret) {
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    // Timing-safe comparison to prevent timing attacks
    const expected = Buffer.from(`Bearer ${cronSecret}`);
    const received = Buffer.from(authHeader ?? "");
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const results: Record<string, string> = {};

    // Bucket configuration.
    // NOTE: `recordings` is PRIVATE — it stores voice chat messages and call
    // recordings that must not be publicly accessible. Callers MUST use
    // `createSignedUrl()` (with a short expiry like 1 hour) instead of
    // `getPublicUrl()` to surface these files to the client.
    const buckets: Array<{
      name: string;
      public: boolean;
      allowedMimeTypes: string[];
      fileSizeLimit: number;
    }> = [
      {
        name: "marketplace",
        public: true,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"],
        fileSizeLimit: 10 * 1024 * 1024, // 10MB
      },
      {
        name: "recordings",
        public: false, // private — use createSignedUrl() to access
        allowedMimeTypes: ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg"],
        fileSizeLimit: 100 * 1024 * 1024, // 100MB
      },
    ];

    for (const cfg of buckets) {
      const { data: existing } = await admin.storage.getBucket(cfg.name);

      if (existing) {
        const { error: updateError } = await admin.storage.updateBucket(cfg.name, {
          public: cfg.public,
          allowedMimeTypes: cfg.allowedMimeTypes,
          fileSizeLimit: cfg.fileSizeLimit,
        });
        results[cfg.name] = updateError ? "update failed" : `exists, updated (public=${cfg.public})`;
      } else {
        const { error: createError } = await admin.storage.createBucket(cfg.name, {
          public: cfg.public,
          allowedMimeTypes: cfg.allowedMimeTypes,
          fileSizeLimit: cfg.fileSizeLimit,
        });
        results[cfg.name] = createError ? "create failed" : "created";
      }
    }

    const failures = Object.entries(results).filter(([, v]) => v.includes("failed"));
    if (failures.length > 0) {
      return NextResponse.json(
        { success: false, error: `Bucket operations failed: ${failures.map(([k]) => k).join(", ")}`, buckets: results },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, buckets: results });
  } catch (err) {
    console.error("[setup-storage]", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
