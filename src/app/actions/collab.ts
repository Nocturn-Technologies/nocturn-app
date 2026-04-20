"use server";

import { randomUUID } from "crypto";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

/**
 * Search for other collectives on Nocturn to collaborate with.
 */
export async function searchCollectives(query: string, myCollectiveId: string) {
  try {
    if (!myCollectiveId?.trim()) return [];

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const sb = createAdminClient();

    // Verify caller is a member of myCollectiveId
    const { count } = await sb
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", myCollectiveId)
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (!count) return [];

    let builder = sb
      .from("collectives")
      .select("id, name, slug, logo_url, city, bio")
      .neq("id", myCollectiveId)
      .order("name");

    if (query.trim()) {
      // Sanitize input to prevent PostgREST filter injection
      const sanitized = query.replace(/\\/g, "").replace(/[%_.,()'"`]/g, "").trim();
      if (sanitized) {
        const escaped = sanitized.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
        builder = builder.or(`name.ilike.%${escaped}%,city.ilike.%${escaped}%,slug.ilike.%${escaped}%`);
      }
    }

    const { data, error } = await builder.limit(20);
    if (error) {
      console.error("[searchCollectives] query error:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("[searchCollectives]", err);
    return [];
  }
}

/**
 * Start a collab chat with another collective.
 * Creates a channel visible to both collectives.
 * Channel name encodes both collective IDs so we can find existing channels.
 * Convention: "collab:{sortedId1}:{sortedId2}"
 */
export async function startCollabChat(myCollectiveId: string, partnerCollectiveId: string) {
  try {
    if (!myCollectiveId?.trim() || !partnerCollectiveId?.trim()) {
      return { error: "Collective IDs are required", channelId: null };
    }

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
      .is("deleted_at", null)
      .maybeSingle();

    if (!membership) return { error: "Not a member of this collective", channelId: null };

    // Only admins and promoters can create collab chats
    if (membership.role !== "admin" && membership.role !== "promoter") {
      return { error: "Only admins and promoters can start collab chats", channelId: null };
    }

    // Build a deterministic channel name encoding both collective IDs (sorted so direction doesn't matter)
    const [idA, idB] = [myCollectiveId, partnerCollectiveId].sort();
    const collabChannelName = `collab:${idA}:${idB}`;

    // Check if a collab channel already exists between these two collectives
    const { data: existing } = await sb
      .from("channels")
      .select("id")
      .eq("name", collabChannelName)
      .eq("type", "collab")
      .maybeSingle();

    if (existing) return { error: null, channelId: existing.id };

    // Fetch display names for both collectives
    const [{ data: myCollective }, { data: partner }] = await Promise.all([
      sb.from("collectives").select("name").eq("id", myCollectiveId).maybeSingle(),
      sb.from("collectives").select("name").eq("id", partnerCollectiveId).maybeSingle(),
    ]);

    if (!partner || !myCollective) return { error: "Collective not found", channelId: null };

    // Create the collab channel — collective_id is nullable, so we set it to the initiator's
    const { data: channel, error } = await sb
      .from("channels")
      .insert({
        collective_id: myCollectiveId,
        name: collabChannelName,
        type: "collab",
        created_by: user.id,
      })
      .select("id")
      .maybeSingle();

    if (error || !channel) return { error: "Failed to create collab channel", channelId: null };

    // Send a welcome message (no type column on messages — content only)
    await sb.from("messages").insert({
      channel_id: channel.id,
      user_id: user.id,
      content: `Started a collab chat between ${myCollective.name} and ${partner.name}. Let's make something happen! 🌙`,
    });

    return { error: null, channelId: channel.id };
  } catch (err) {
    console.error("[startCollabChat]", err);
    return { error: "Something went wrong", channelId: null };
  }
}

/**
 * Get collab channels where this collective is involved.
 * Channels use the naming convention "collab:{idA}:{idB}" where IDs are sorted.
 */
export async function getCollabChannels(collectiveId: string) {
  try {
    if (!collectiveId?.trim()) return [];

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const sb = createAdminClient();

    // Verify user is a member of this collective
    const { count: memberCount } = await sb
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", collectiveId)
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (!memberCount || memberCount === 0) return [];

    // Find all collab channels that embed this collective's ID in the name
    // Pattern: "collab:<idA>:<idB>" where either idA or idB equals collectiveId
    const { data, error } = await sb
      .from("channels")
      .select("*")
      .eq("type", "collab")
      .or(`name.ilike.collab:${collectiveId}:%,name.ilike.collab:%:${collectiveId}`);

    if (error) {
      console.error("[getCollabChannels] query error:", error.message);
    }

    return data ?? [];
  } catch (err) {
    console.error("[getCollabChannels]", err);
    return [];
  }
}

/**
 * Invite someone by email to collab on Nocturn.
 * Creates an invitation record with type 'collab'.
 * When they sign up, the chat thread activates.
 */
export async function inviteToCollab(myCollectiveId: string, email: string) {
  try {
    if (!myCollectiveId?.trim() || !email?.trim()) {
      return { error: "Collective ID and email are required" };
    }

    // Normalize + validate email format before anything touches the DB
    const normalizedEmail = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return { error: "Invalid email address" };
    }

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const sb = createAdminClient();

    // Verify user is a member of their collective AND has admin/owner role
    const { data: membership } = await sb
      .from("collective_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("collective_id", myCollectiveId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!membership) return { error: "Not a member of this collective" };

    if (membership.role !== "admin" && membership.role !== "owner") {
      return { error: "Only admins and owners can invite collab partners" };
    }

    // Check if already invited (filter by collective + email + collab role)
    const { data: existing } = await sb
      .from("invitations")
      .select("id, accepted_at")
      .eq("collective_id", myCollectiveId)
      .eq("email", normalizedEmail)
      .eq("role", "collab")
      .is("accepted_at", null)
      .maybeSingle();

    if (existing) {
      return { error: "Already invited" };
    }

    // Create invitation with a unique token
    const { error } = await sb.from("invitations").insert({
      collective_id: myCollectiveId,
      email: normalizedEmail,
      role: "collab",
      invited_by: user.id,
      token: randomUUID(),
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    if (error) return { error: "Failed to send invitation" };

    return { error: null };
  } catch (err) {
    console.error("[inviteToCollab]", err);
    return { error: "Something went wrong" };
  }
}
