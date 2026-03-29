// Supabase config — public values can be hardcoded, secrets MUST come from env vars

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// These are public (embedded in client JS anyway via NEXT_PUBLIC_ vars)
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Service role key — MUST come from environment variable, NEVER hardcoded
// This key bypasses all Row Level Security — treat it like a database password
// On the client side this is always empty (not prefixed with NEXT_PUBLIC_) — that's expected.
// The warning is deferred to createAdminClient() so it only fires when actually needed.
export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// ── Admin client factory (server-side only) ──────────────────────────
// Re-reads env var each cold start so a fixed key takes effect immediately.
// Cached per-instance for the lifetime of the serverless function.
let _adminClient: ReturnType<typeof createClient<Database>> | null = null;
let _adminClientKey: string | null = null;

export function createAdminClient() {
  const currentKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!currentKey) {
    console.error(
      "[CRITICAL] SUPABASE_SERVICE_ROLE_KEY is missing. All admin/server-side database operations will fail. Set this environment variable in .env.local (dev) or Vercel project settings (prod)."
    );
  }
  // Recreate if key changed (e.g. env var was fixed) or client doesn't exist
  if (!_adminClient || _adminClientKey !== currentKey) {
    _adminClient = createClient<Database>(SUPABASE_URL, currentKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    _adminClientKey = currentKey;
  }
  return _adminClient;
}
