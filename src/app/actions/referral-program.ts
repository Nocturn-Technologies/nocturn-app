"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { isValidUUID } from "@/lib/utils";

/**
 * Get or create a promo link for a collective's event.
 * Each collective member can have a unique referral link per event.
 */
export async function getReferralLink(eventId: string): Promise<{
  error: string | null;
  code: string | null;
  linkId: string | null;
}> {
  try {
    if (!eventId?.trim()) return { error: "Event ID is required", code: null, linkId: null };
    if (!isValidUUID(eventId)) return { error: "Invalid event ID format", code: null, linkId: null };

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", code: null, linkId: null };

    const admin = createAdminClient();

    // Verify user is a member of the event's collective
    const { data: event } = await admin
      .from("events")
      .select("collective_id")
      .eq("id", eventId)
      .maybeSingle();

    if (!event) return { error: "Event not found", code: null, linkId: null };

    const { count: memberCount } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", event.collective_id)
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (!memberCount || memberCount === 0) {
      return { error: "Not a member of this collective", code: null, linkId: null };
    }

    // Check if this user already has a promo link for this event
    const { data: existing } = await admin
      .from("promo_links")
      .select("id, code")
      .eq("event_id", eventId)
      .eq("created_by", user.id)
      .maybeSingle();

    if (existing) {
      return { error: null, code: existing.code, linkId: existing.id };
    }

    // Generate a new unique code for this user+event
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    const code = `REF${suffix}`;

    const { data: created, error: createError } = await admin
      .from("promo_links")
      .insert({
        event_id: eventId,
        created_by: user.id,
        code,
        label: "My referral link",
        clicks: 0,
      })
      .select("id, code")
      .maybeSingle();

    if (createError || !created) {
      console.error("[getReferralLink] Failed to create promo link:", createError);
      return { error: "Something went wrong", code: null, linkId: null };
    }

    return { error: null, code: created.code, linkId: created.id };
  } catch (err) {
    console.error("[getReferralLink]", err);
    return { error: "Something went wrong", code: null, linkId: null };
  }
}
