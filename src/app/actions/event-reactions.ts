"use server";

import { createAdminClient } from "@/lib/supabase/config";
import type { SupabaseClient } from "@supabase/supabase-js";

const VALID_EMOJIS = new Set(["🔥", "💯", "🙌", "🎉", "💜"]);

// event_reactions exists in the DB (via migration 20260323_event_reactions.sql) but
// is not yet reflected in the generated database.types.ts. Use the untyped escape
// hatch until types are regenerated post-migration.
function untypedFrom(sb: ReturnType<typeof createAdminClient>, table: string) {
  return (sb as unknown as SupabaseClient).from(table);
}

export async function addReaction(input: {
  eventId: string;
  emoji: string;
  fingerprint: string;
}) {
  try {
    if (!input.eventId?.trim()) return { error: "Event ID is required" };
    if (!input.emoji || !VALID_EMOJIS.has(input.emoji)) return { error: "Invalid emoji" };
    if (!input.fingerprint?.trim()) return { error: "Fingerprint is required" };

    const supabase = createAdminClient();

    // Verify the event exists and is public
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id")
      .eq("id", input.eventId)
      .maybeSingle();

    if (eventError) {
      console.error("[addReaction] event query error:", eventError.message);
      return { error: "Failed to verify event" };
    }
    if (!event) return { error: "Event not found" };

    const { error } = await untypedFrom(supabase, "event_reactions").insert({
      event_id: input.eventId,
      emoji: input.emoji,
      fingerprint: input.fingerprint.trim(),
    });

    if (error) {
      // Unique constraint violation means already reacted
      if ((error as { code: string }).code === "23505") return { error: "Already reacted" };
      console.error("[addReaction]", error);
      return { error: "Failed to add reaction" };
    }

    return { error: null };
  } catch (err) {
    console.error("[addReaction]", err);
    return { error: "Something went wrong" };
  }
}

export async function getReactionsByFingerprint(eventId: string, fingerprint: string): Promise<string[]> {
  try {
    if (!eventId?.trim() || !fingerprint?.trim()) return [];

    const supabase = createAdminClient();

    const { data, error } = await untypedFrom(supabase, "event_reactions")
      .select("emoji")
      .eq("event_id", eventId)
      .eq("fingerprint", fingerprint);

    if (error) {
      console.error("[getReactionsByFingerprint]", error);
      return [];
    }

    return ((data ?? []) as { emoji: string }[]).map((r) => r.emoji);
  } catch (err) {
    console.error("[getReactionsByFingerprint]", err);
    return [];
  }
}
