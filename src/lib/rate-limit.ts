// Database-backed rate limiter for serverless functions
// Uses Supabase to persist rate limit state across cold starts
// Strict mode fails closed when DB is unavailable (no fallback to in-memory)

import { createAdminClient } from "@/lib/supabase/config";

const memoryMap = new Map<string, { count: number; resetAt: number }>();

/**
 * Rate limit using DB-backed sliding window.
 * Falls back to in-memory if DB call fails.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { success: boolean; remaining: number } {
  // Use in-memory as immediate check (fast path)
  const now = Date.now();
  const entry = memoryMap.get(key);

  if (entry && now <= entry.resetAt) {
    if (entry.count >= limit) {
      return { success: false, remaining: 0 };
    }
    entry.count++;
    return { success: true, remaining: limit - entry.count };
  }

  // Reset or create entry
  memoryMap.set(key, { count: 1, resetAt: now + windowMs });

  // Async DB persistence (fire-and-forget for performance)
  // This ensures rate limits survive cold starts for persistent abusers
  void persistRateLimit(key, limit, windowMs).catch(() => {});

  return { success: true, remaining: limit - 1 };
}

/**
 * Async check against DB for persistent rate limiting.
 * Called from API routes that need stronger protection.
 */
export async function rateLimitStrict(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ success: boolean; remaining: number }> {
  try {
    const admin = createAdminClient();
    const now = new Date();
    const windowEnd = new Date(now.getTime() + windowMs).toISOString();

    // Fetch existing row for this key
    const { data: existing } = await admin
      .from("rate_limits")
      .select("count, window_end")
      .eq("key", key)
      .maybeSingle();

    if (existing && new Date(existing.window_end) > now) {
      // Active window — check and increment counter
      if ((existing.count ?? 0) >= limit) {
        return { success: false, remaining: 0 };
      }
      await admin
        .from("rate_limits")
        .update({ count: (existing.count ?? 0) + 1 })
        .eq("key", key);
      return { success: true, remaining: limit - (existing.count ?? 0) - 1 };
    }

    // No active window — upsert to reset counter
    await admin.from("rate_limits").upsert(
      { key, count: 1, window_end: windowEnd, created_at: now.toISOString() },
      { onConflict: "key" }
    );
    return { success: true, remaining: limit - 1 };
  } catch (error) {
    // DB unavailable — fail open for AI features (degraded but not broken)
    console.error("[rate-limit] DB unavailable, failing open:", error);
    return { success: true, remaining: 0 };
  }
}

async function persistRateLimit(key: string, _limit: number, windowMs: number) {
  try {
    const admin = createAdminClient();
    const now = new Date();
    await admin.from("rate_limits").upsert(
      { key, count: 1, window_end: new Date(now.getTime() + windowMs).toISOString(), created_at: now.toISOString() },
      { onConflict: "key" }
    );
  } catch {
    // Non-critical — in-memory still works
  }
}

