// Supabase config — public values can be hardcoded, secrets MUST come from env vars

// These are public (embedded in client JS anyway via NEXT_PUBLIC_ vars)
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://bpzwbqtpyorppijdblhy.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwendicXRweW9ycHBpamRibGh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MTA3NzIsImV4cCI6MjA4OTI4Njc3Mn0.RAYfZJoeKaYQKpsDuLLywG3OSei8X6yJ2KQoNC5Hlp8";

// Service role key — MUST come from environment variable, NEVER hardcoded
// This key bypasses all Row Level Security — treat it like a database password
export const SUPABASE_SERVICE_ROLE_KEY = (() => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    // In development, warn loudly. In production, this would crash (which is correct behavior).
    console.error(
      "⚠️ SUPABASE_SERVICE_ROLE_KEY is not set. Server actions requiring admin access will fail."
    );
    return "";
  }
  return key;
})();
