"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { isValidUUID } from "@/lib/utils";
import { revalidatePath } from "next/cache";

export interface InquiryItem {
  id: string;
  message: string | null;
  inquiry_type: string;
  status: string;
  created_at: string;
  contact_name: string;
  contact_email: string | null;
  profile_display_name: string | null;
}

/**
 * Get inquiries sent BY the current user.
 *
 * NOTE: The `marketplace_inquiries` table was dropped in the full-schema
 * rebuild. Inquiries are now handled via the `marketplace-inquiry-email` API
 * route which sends an email directly. This stub returns an empty list so that
 * UI callers continue to compile and render gracefully.
 */
export async function getSentInquiries(): Promise<InquiryItem[]> {
  return [];
}

/**
 * Get inquiries sent TO the current user's marketplace profile.
 *
 * NOTE: Same as above — `marketplace_inquiries` table is gone. Returns empty
 * list so callers compile cleanly.
 */
export async function getReceivedInquiries(): Promise<InquiryItem[]> {
  return [];
}

/**
 * Accept an inquiry and open a collab chat channel.
 *
 * The `marketplace_inquiries` table no longer exists, so we can no longer look
 * up or mutate inquiry rows. This function now accepts an `inquiryId` that
 * callers may pass (kept for signature compatibility) but immediately creates a
 * collab channel from the current user's collective context instead of reading
 * inquiry metadata from the DB.
 *
 * The caller is expected to pass the required context (fromUserId, message,
 * inquiryType) via the second argument going forward; the function still
 * returns `{ error, channelId }` so existing UI compiles.
 */
export async function acceptInquiry(
  inquiryId: string,
  context?: {
    fromUserId?: string;
    message?: string | null;
    inquiryType?: string | null;
  }
): Promise<{
  error: string | null;
  channelId: string | null;
}> {
  try {
    if (!inquiryId || typeof inquiryId !== "string" || inquiryId.length > 100) {
      return { error: "Invalid inquiry ID", channelId: null };
    }

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", channelId: null };

    const sb = createAdminClient();

    // Get the current user's collective
    const { data: myMembership } = await sb
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (!myMembership?.collective_id) {
      return { error: "You must be in a collective to accept inquiries", channelId: null };
    }

    const { data: myCollective } = await sb
      .from("collectives")
      .select("name")
      .eq("id", myMembership.collective_id)
      .maybeSingle();

    const myCollectiveName = myCollective?.name || "Your collective";

    const fromUserId = context?.fromUserId ?? null;
    let senderName = "Someone";
    let channelId: string | null = null;

    if (fromUserId) {
      const { data: sender } = await sb
        .from("users")
        .select("id, full_name")
        .eq("id", fromUserId)
        .maybeSingle();

      senderName = sender?.full_name || "Someone";

      const { data: senderMembership } = await sb
        .from("collective_members")
        .select("collective_id")
        .eq("user_id", fromUserId)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();

      if (senderMembership?.collective_id) {
        if (!isValidUUID(myMembership.collective_id) || !isValidUUID(senderMembership.collective_id)) {
          return { error: "Invalid collective id on membership record", channelId: null };
        }
        const { data: existing } = await sb
          .from("channels")
          .select("id")
          .or(`and(collective_id.eq.${myMembership.collective_id},partner_collective_id.eq.${senderMembership.collective_id}),and(collective_id.eq.${senderMembership.collective_id},partner_collective_id.eq.${myMembership.collective_id})`)
          .eq("type", "collab")
          .limit(1)
          .maybeSingle();

        if (existing) {
          channelId = existing.id;
        } else {
          const { data: partnerCollective } = await sb
            .from("collectives")
            .select("name")
            .eq("id", senderMembership.collective_id)
            .maybeSingle();

          const partnerName = partnerCollective?.name || senderName;

          const { data: newChannel, error: channelErr } = await sb
            .from("channels")
            .insert({
              collective_id: myMembership.collective_id,
              partner_collective_id: senderMembership.collective_id,
              name: `${myCollectiveName} × ${partnerName}`,
              type: "collab",
              metadata: {
                initiated_by: user.id,
                from_inquiry_id: inquiryId,
                my_collective_name: myCollectiveName,
                partner_collective_name: partnerName,
              },
            })
            .select("id")
            .maybeSingle();

          if (channelErr || !newChannel) {
            return { error: "Failed to create chat channel", channelId: null };
          }
          channelId = newChannel.id;
        }
      } else {
        const { data: newChannel, error: channelErr } = await sb
          .from("channels")
          .insert({
            collective_id: myMembership.collective_id,
            partner_collective_id: null,
            name: `${myCollectiveName} × ${senderName}`,
            type: "collab",
            metadata: {
              initiated_by: user.id,
              from_inquiry_id: inquiryId,
              sender_user_id: fromUserId,
              sender_name: senderName,
            },
          })
          .select("id")
          .maybeSingle();

        if (channelErr || !newChannel) {
          return { error: "Failed to create chat channel", channelId: null };
        }
        channelId = newChannel.id;
      }
    } else {
      // No sender context — open a generic collab channel
      const { data: newChannel, error: channelErr } = await sb
        .from("channels")
        .insert({
          collective_id: myMembership.collective_id,
          partner_collective_id: null,
          name: `${myCollectiveName} × Inquiry`,
          type: "collab",
          metadata: {
            initiated_by: user.id,
            from_inquiry_id: inquiryId,
          },
        })
        .select("id")
        .maybeSingle();

      if (channelErr || !newChannel) {
        return { error: "Failed to create chat channel", channelId: null };
      }
      channelId = newChannel.id;
    }

    // Send welcome system message
    const welcomeContent = context?.message
      ? `${senderName} sent an inquiry: "${context.message}"`
      : `${senderName} sent a ${context?.inquiryType || "general"} inquiry. Start the conversation!`;

    const { error: msgErr } = await sb.from("messages").insert({
      channel_id: channelId,
      user_id: user.id,
      content: welcomeContent,
      type: "system",
    });

    if (msgErr) {
      console.error("[acceptInquiry] Failed to insert welcome message:", msgErr);
    }

    revalidatePath("/dashboard/inquiries");
    revalidatePath("/dashboard/chat");

    return { error: null, channelId };
  } catch (err) {
    console.error("[acceptInquiry]", err);
    return { error: "Something went wrong", channelId: null };
  }
}

/**
 * Reject an inquiry.
 *
 * NOTE: `marketplace_inquiries` table is gone. This is a no-op stub that
 * returns success so existing UI callers compile cleanly.
 */
export async function rejectInquiry(_inquiryId: string): Promise<{
  error: string | null;
}> {
  return { error: null };
}
