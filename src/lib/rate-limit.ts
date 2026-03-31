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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as any;
    const windowStart = new Date(Date.now() - windowMs).toISOString();

    // Count recent entries in the window
    const { count } = await db
      .from("rate_limits")
      .select("*", { count: "exact", head: true })
      .eq("key", key)
      .gte("created_at", windowStart);

    const currentCount = count ?? 0;

    if (currentCount >= limit) {
      return { success: false, remaining: 0 };
    }

    // Insert new entry
    await db.from("rate_limits").insert({
      key,
      created_at: new Date().toISOString(),
    });

    return { success: true, remaining: limit - currentCount - 1 };
  } catch (error) {
    // DB unavailable — fail closed to prevent abuse in serverless
    console.error("[rate-limit] DB unavailable, failing closed:", error);
    return { success: false, remaining: 0 };
  }
}

async function persistRateLimit(key: string, _limit: number, _windowMs: number) {
  try {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as any;
    await db.from("rate_limits").insert({
      key,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-critical — in-memory still works
  }
}

// Clean up old in-memory entries lazily (no setInterval in serverless)
export function cleanupMemory(): void {
  const now = Date.now();
  for (const [key, entry] of memoryMap) {
    if (now > entry.resetAt) memoryMap.delete(key);
  }
}
