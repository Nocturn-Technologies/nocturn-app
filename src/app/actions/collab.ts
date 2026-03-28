"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

/**
 * Search for other collectives on Nocturn to collaborate with.
 */
export async function searchCollectives(query: string, myCollectiveId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const sb = createAdminClient();

  let builder = sb
    .from("collectives")
    .select("id, name, slug, logo_url, city, description")
    .neq("id", myCollectiveId)
    .order("name");

  if (query.trim()) {
    // Sanitize input to prevent PostgREST filter injection
    const sanitized = query.replace(/[%_.,()]/g, "").trim();
    if (sanitized) {
      builder = builder.or(`name.ilike.%${sanitized}%,city.ilike.%${sanitized}%,slug.ilike.%${sanitized}%`);
    }
  }

  const { data } = await builder.limit(20);
  return data ?? [];
}

/**
 * Start a collab chat with another collective.
 * Creates a channel visible to both collectives.
 */
export async function startCollabChat(myCollectiveId: string, partnerCollectiveId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", channelId: null };

  const sb = createAdminClient();

  // Verify user is a member of their collective
  const { data: membership } = await sb
    .from("collective_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("collective_id", myCollectiveId)
    .maybeSingle();

  if (!membership) return { error: "Not a member of this collective", channelId: null };

  // Check if a collab channel already exists between these two
  const { data: existing } = await sb
    .from("channels")
    .select("id")
    .eq("collective_id", myCollectiveId)
    .eq("partner_collective_id", partnerCollectiveId)
    .eq("type", "collab")
    .maybeSingle();

  if (existing) return { error: null, channelId: existing.id };

  // Also check the reverse direction
  const { data: existingReverse } = await sb
    .from("channels")
    .select("id")
    .eq("collective_id", partnerCollectiveId)
    .eq("partner_collective_id", myCollectiveId)
    .eq("type", "collab")
    .maybeSingle();

  if (existingReverse) return { error: null, channelId: existingReverse.id };

  // Get partner collective name for the channel
  const { data: partner } = await sb
    .from("collectives")
    .select("name")
    .eq("id", partnerCollectiveId)
    .maybeSingle();

  const { data: myCollective } = await sb
    .from("collectives")
    .select("name")
    .eq("id", myCollectiveId)
    .maybeSingle();

  if (!partner || !myCollective) return { error: "Collective not found", channelId: null };

  // Create the collab channel (owned by initiator, partner linked)
  const { data: channel, error } = await sb
    .from("channels")
    .insert({
      collective_id: myCollectiveId,
      partner_collective_id: partnerCollectiveId,
      name: `${myCollective.name} × ${partner.name}`,
      type: "collab",
      metadata: {
        initiated_by: user.id,
        my_collective_name: myCollective.name,
        partner_collective_name: partner.name,
      },
    })
    .select("id")
    .single();

  if (error) return { error: error.message, channelId: null };

  // Send a welcome message
  await sb.from("messages").insert({
    channel_id: channel.id,
    user_id: user.id,
    content: `Started a collab chat between ${myCollective.name} and ${partner.name}. Let's make something happen! 🌙`,
    type: "system",
  });

  return { error: null, channelId: channel.id };
}

/**
 * Get collab channels where this collective is either owner or partner.
 */
export async function getCollabChannels(collectiveId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const sb = createAdminClient();

  // Channels where we're the owner
  const { data: owned } = await sb
    .from("channels")
    .select("*")
    .eq("collective_id", collectiveId)
    .eq("type", "collab");

  // Channels where we're the partner
  const { data: partnered } = await sb
    .from("channels")
    .select("*")
    .eq("partner_collective_id", collectiveId)
    .eq("type", "collab");

  return [...(owned ?? []), ...(partnered ?? [])];
}

/**
 * Invite someone by email to collab on Nocturn.
 * Creates an invitation record with type 'collab'.
 * When they sign up, the chat thread activates.
 */
export async function inviteToCollab(myCollectiveId: string, email: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const sb = createAdminClient();

  // Verify user is a member of their collective
  const { data: membership } = await sb
    .from("collective_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("collective_id", myCollectiveId)
    .maybeSingle();

  if (!membership) return { error: "Not a member of this collective" };

  // Check if already invited
  const { data: existing } = await sb
    .from("invitations")
    .select("id, status")
    .eq("collective_id", myCollectiveId)
    .eq("email", email.toLowerCase().trim())
    .eq("type", "collab")
    .maybeSingle();

  if (existing?.status === "pending") {
    return { error: "Already invited" };
  }

  // Create or update invitation
  if (existing) {
    await sb
      .from("invitations")
      .update({ status: "pending", invited_by: user.id, expires_at: new Date(Date.now() + 7 * 86400000).toISOString() })
      .eq("id", existing.id);
  } else {
    const { error } = await sb.from("invitations").insert({
      collective_id: myCollectiveId,
      email: email.toLowerCase().trim(),
      role: "collab",
      type: "collab",
      invited_by: user.id,
    });
    if (error) return { error: error.message };
  }

  return { error: null };
}
