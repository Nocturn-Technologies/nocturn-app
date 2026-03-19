// Hardcoded Supabase config — eliminates env var issues on Vercel
export const SUPABASE_URL = "https://bpzwbqtpyorppijdblhy.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwendicXRweW9ycHBpamRibGh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MTA3NzIsImV4cCI6MjA4OTI4Njc3Mn0.RAYfZJoeKaYQKpsDuLLywG3OSei8X6yJ2KQoNC5Hlp8";

// Service role key — server-side only (Next.js tree-shakes this from client bundles)
export const SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwendicXRweW9ycHBpamRibGh5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzcxMDc3MiwiZXhwIjoyMDg5Mjg2NzcyfQ.9u7sJYFWQ2w-KfkPAG6LSGNhFpfeObKkApzyTj-9ea4";
