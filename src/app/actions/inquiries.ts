"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
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

/** Get inquiries sent BY the current user */
export async function getSentInquiries(): Promise<InquiryItem[]> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const sb = createAdminClient();

    const { data } = await sb.from("marketplace_inquiries")
      .select("id, message, inquiry_type, status, created_at, to_profile_id")
      .eq("from_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!data || data.length === 0) return [];

    // Enrich with profile display names
    const enriched: InquiryItem[] = [];
    for (const inq of data) {
      const { data: profile } = await sb.from("marketplace_profiles")
        .select("display_name, user_id")
        .eq("id", inq.to_profile_id)
        .maybeSingle();

      let contactName = profile?.display_name || "Unknown";
      let contactEmail: string | null = null;

      if (profile?.user_id) {
        const { data: u } = await sb
          .from("users")
          .select("full_name, email")
          .eq("id", profile.user_id)
          .maybeSingle();
        if (u) {
          contactName = u.full_name || contactName;
          contactEmail = u.email;
        }
      }

      enriched.push({
        id: inq.id,
        message: inq.message,
        inquiry_type: inq.inquiry_type,
        status: inq.status,
        created_at: inq.created_at ?? "",
        contact_name: contactName,
        contact_email: contactEmail,
        profile_display_name: profile?.display_name || null,
      });
    }

    return enriched;
  } catch (err) {
    console.error("[getSentInquiries]", err);
    return [];
  }
}

/** Get inquiries sent TO the current user's marketplace profile */
export async function getReceivedInquiries(): Promise<InquiryItem[]> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const sb = createAdminClient();

    // Get marketplace profile
    const { data: profile } = await sb.from("marketplace_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) return [];

    const { data } = await sb.from("marketplace_inquiries")
      .select("id, message, inquiry_type, status, created_at, from_user_id")
      .eq("to_profile_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!data || data.length === 0) return [];

    const enriched: InquiryItem[] = [];
    for (const inq of data) {
      const { data: sender } = await sb
        .from("users")
        .select("full_name, email")
        .eq("id", inq.from_user_id)
        .maybeSingle();

      enriched.push({
        id: inq.id,
        message: inq.message,
        inquiry_type: inq.inquiry_type,
        status: inq.status,
        created_at: inq.created_at ?? "",
        contact_name: sender?.full_name || "Unknown",
        contact_email: sender?.email || null,
        profile_display_name: null,
      });
    }

    return enriched;
  } catch (err) {
    console.error("[getReceivedInquiries]", err);
    return [];
  }
}

export async function acceptInquiry(inquiryId: string): Promise<{
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

  // Fetch the inquiry
  const { data: inquiry, error: fetchErr } = await sb.from("marketplace_inquiries")
    .select("id, status, from_user_id, to_profile_id, message, inquiry_type")
    .eq("id", inquiryId)
    .maybeSingle();

  if (fetchErr || !inquiry) return { error: "Inquiry not found", channelId: null };
  if (inquiry.status !== "pending") return { error: "Inquiry has already been processed", channelId: null };

  // Verify the current user owns the target profile
  const { data: profile } = await sb.from("marketplace_profiles")
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

  const { error: msgErr } = await sb.from("messages").insert({
    channel_id: channelId,
    user_id: user.id,
    content: welcomeContent,
    type: "system",
  });

  if (msgErr) {
    console.error("[acceptInquiry] Failed to insert welcome message:", msgErr);
  }

  // Update inquiry status to accepted
  const { error: statusErr } = await sb.from("marketplace_inquiries")
    .update({ status: "accepted" })
    .eq("id", inquiryId);

  if (statusErr) {
    console.error("[acceptInquiry] Failed to update inquiry status:", statusErr);
  }

  revalidatePath("/dashboard/inquiries");
  revalidatePath("/dashboard/chat");

  return { error: null, channelId };
  } catch (err) {
    console.error("[acceptInquiry]", err);
    return { error: "Something went wrong", channelId: null };
  }
}

export async function rejectInquiry(inquiryId: string): Promise<{
  error: string | null;
}> {
  try {
  if (!inquiryId || typeof inquiryId !== "string" || inquiryId.length > 100) {
    return { error: "Invalid inquiry ID" };
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const sb = createAdminClient();

  // Fetch and verify
  const { data: inquiry } = await sb.from("marketplace_inquiries")
    .select("id, status, to_profile_id")
    .eq("id", inquiryId)
    .maybeSingle();

  if (!inquiry) return { error: "Inquiry not found" };
  if (inquiry.status !== "pending") return { error: "Inquiry has already been processed" };

  // Verify ownership
  const { data: profile } = await sb.from("marketplace_profiles")
    .select("user_id")
    .eq("id", inquiry.to_profile_id)
    .maybeSingle();

  if (!profile || profile.user_id !== user.id) {
    return { error: "Not authorized" };
  }

  const { error: statusErr } = await sb.from("marketplace_inquiries")
    .update({ status: "rejected" })
    .eq("id", inquiryId);

  if (statusErr) {
    console.error("[rejectInquiry] Failed to update inquiry status:", statusErr);
    return { error: "Something went wrong" };
  }

  revalidatePath("/dashboard/inquiries");

  return { error: null };
  } catch (err) {
    console.error("[rejectInquiry]", err);
    return { error: "Something went wrong" };
  }
}
