import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

/**
 * Server-side event tracking — logs to audit_logs table.
 * Use for key product events in server actions.
 */
export async function trackServerEvent(
  event: string,
  properties?: Record<string, string | number | boolean | null>
) {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await sb.from("audit_logs").insert({
      table_name: "analytics",
      record_id: crypto.randomUUID(),
      action: event,
      new_data: properties || {},
    });
  } catch {
    // Analytics should never break the app
  }
}
