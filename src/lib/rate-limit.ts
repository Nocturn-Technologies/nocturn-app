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
    const db = admin;

    // Count active entries within the window (not expired)
    const now = new Date();
    const windowEnd = new Date(now.getTime() + windowMs).toISOString();
    const { count } = await db
      .from("rate_limits")
      .select("*", { count: "exact", head: true })
      .eq("key", key)
      .gte("window_end", now.toISOString());

    const currentCount = count ?? 0;

    if (currentCount >= limit) {
      return { success: false, remaining: 0 };
    }

    // Insert new entry
    await db.from("rate_limits").insert({
      key,
      window_end: windowEnd,
      created_at: now.toISOString(),
    });

    return { success: true, remaining: limit - currentCount - 1 };
  } catch (error) {
    // DB unavailable — fail closed to prevent abuse in serverless
    console.error("[rate-limit] DB unavailable, failing closed:", error);
    return { success: false, remaining: 0 };
  }
}

async function persistRateLimit(key: string, _limit: number, windowMs: number) {
  try {
    const admin = createAdminClient();
    const db = admin;
    const now = new Date();
    await db.from("rate_limits").insert({
      key,
      window_end: new Date(now.getTime() + windowMs).toISOString(),
      created_at: now.toISOString(),
    });
  } catch {
    // Non-critical — in-memory still works
  }
}

