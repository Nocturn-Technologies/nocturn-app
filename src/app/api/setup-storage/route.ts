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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Timing-safe comparison to prevent timing attacks
    const expected = Buffer.from(`Bearer ${cronSecret}`);
    const received = Buffer.from(authHeader ?? "");
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const results: Record<string, string> = {};

    // Buckets that need to exist with public access
    const publicBuckets = ["marketplace", "recordings"];

    for (const bucketName of publicBuckets) {
      const { data: existing } = await admin.storage.getBucket(bucketName);

      if (existing) {
        // Ensure it's public
        const { error: updateError } = await admin.storage.updateBucket(bucketName, {
          public: true,
          allowedMimeTypes: bucketName === "marketplace"
            ? ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"]
            : ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg"],
          fileSizeLimit: bucketName === "marketplace" ? 10 * 1024 * 1024 : 100 * 1024 * 1024, // 10MB media, 100MB recordings
        });
        results[bucketName] = updateError ? "update failed" : "exists, updated to public";
      } else {
        const { error: createError } = await admin.storage.createBucket(bucketName, {
          public: true,
          allowedMimeTypes: bucketName === "marketplace"
            ? ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"]
            : ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg"],
          fileSizeLimit: bucketName === "marketplace" ? 10 * 1024 * 1024 : 100 * 1024 * 1024,
        });
        results[bucketName] = createError ? "create failed" : "created";
      }
    }

    return NextResponse.json({ success: true, buckets: results });
  } catch (err) {
    console.error("[setup-storage]", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
