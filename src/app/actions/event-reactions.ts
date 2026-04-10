"use server";

import { createAdminClient } from "@/lib/supabase/config";

const VALID_EMOJIS = new Set(["🔥", "💯", "🙌", "🎉", "💜"]);

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
      .is("deleted_at", null)
      .maybeSingle();

    if (eventError) {
      console.error("[addReaction] event query error:", eventError.message);
      return { error: "Failed to verify event" };
    }
    if (!event) return { error: "Event not found" };

    const { error } = await supabase
      .from("event_reactions")
      .insert({
        event_id: input.eventId,
        emoji: input.emoji,
        fingerprint: input.fingerprint.trim(),
      });

    if (error) {
      // Unique constraint violation means already reacted
      if (error.code === "23505") return { error: "Already reacted" };
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

    const { data, error } = await supabase
      .from("event_reactions")
      .select("emoji")
      .eq("event_id", eventId)
      .eq("fingerprint", fingerprint);

    if (error) {
      console.error("[getReactionsByFingerprint]", error);
      return [];
    }

    return (data ?? []).map((r) => r.emoji);
  } catch (err) {
    console.error("[getReactionsByFingerprint]", err);
    return [];
  }
}
