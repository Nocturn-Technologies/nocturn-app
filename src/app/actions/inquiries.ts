"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { revalidatePath } from "next/cache";

export async function acceptInquiry(inquiryId: string): Promise<{
  error: string | null;
  channelId: string | null;
}> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", channelId: null };

  const sb = createAdminClient();

  // Fetch the inquiry
  const { data: inquiry, error: fetchErr } = await (sb.from("marketplace_inquiries") as any)
    .select("id, status, from_user_id, to_profile_id, message, inquiry_type")
    .eq("id", inquiryId)
    .maybeSingle();

  if (fetchErr || !inquiry) return { error: "Inquiry not found", channelId: null };
  if (inquiry.status !== "pending") return { error: `Inquiry already ${inquiry.status}`, channelId: null };

  // Verify the current user owns the target profile
  const { data: profile } = await (sb.from("marketplace_profiles") as any)
    .select("id, user_id, display_name")
    .eq("id", inquiry.to_profile_id)
    .maybeSingle();

  if (!profile || profile.user_id !== user.id) {
    return { error: "Not authorized", channelId: null };
  }

  // Get the recipient's collective
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

  // Get the sender's info
  const { data: sender } = await sb
    .from("users")
    .select("id, full_name")
    .eq("id", inquiry.from_user_id)
    .maybeSingle();

  const senderName = sender?.full_name || "Someone";

  // Check if sender is in a collective
  const { data: senderMembership } = await sb
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", inquiry.from_user_id)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  // Get my collective name
  const { data: myCollective } = await sb
    .from("collectives")
    .select("name")
    .eq("id", myMembership.collective_id)
    .maybeSingle();

  const myCollectiveName = myCollective?.name || "Your collective";

  // Check if a channel already exists for this inquiry pair
  let channelId: string | null = null;

  if (senderMembership?.collective_id) {
    // Sender is in a collective — check for existing collab channel
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
      // Get partner collective name
      const { data: partnerCollective } = await sb
        .from("collectives")
        .select("name")
        .eq("id", senderMembership.collective_id)
        .maybeSingle();

      const partnerName = partnerCollective?.name || senderName;

      // Create collab channel
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
    // Sender is NOT in a collective — create a collab channel under our collective
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
          sender_user_id: inquiry.from_user_id,
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

  // Send welcome system message with the inquiry context
  const welcomeContent = inquiry.message
    ? `${senderName} sent an inquiry: "${inquiry.message}"`
    : `${senderName} sent a ${inquiry.inquiry_type || "general"} inquiry. Start the conversation!`;

  await sb.from("messages").insert({
    channel_id: channelId,
    user_id: user.id,
    content: welcomeContent,
    type: "system",
  });

  // Update inquiry status to accepted
  await (sb.from("marketplace_inquiries") as any)
    .update({ status: "accepted" })
    .eq("id", inquiryId);

  revalidatePath("/dashboard/inquiries");
  revalidatePath("/dashboard/chat");

  return { error: null, channelId };
}

export async function rejectInquiry(inquiryId: string): Promise<{
  error: string | null;
}> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const sb = createAdminClient();

  // Fetch and verify
  const { data: inquiry } = await (sb.from("marketplace_inquiries") as any)
    .select("id, status, to_profile_id")
    .eq("id", inquiryId)
    .maybeSingle();

  if (!inquiry) return { error: "Inquiry not found" };
  if (inquiry.status !== "pending") return { error: `Inquiry already ${inquiry.status}` };

  // Verify ownership
  const { data: profile } = await (sb.from("marketplace_profiles") as any)
    .select("user_id")
    .eq("id", inquiry.to_profile_id)
    .maybeSingle();

  if (!profile || profile.user_id !== user.id) {
    return { error: "Not authorized" };
  }

  await (sb.from("marketplace_inquiries") as any)
    .update({ status: "rejected" })
    .eq("id", inquiryId);

  revalidatePath("/dashboard/inquiries");

  return { error: null };
}
