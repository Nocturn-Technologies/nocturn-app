"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Invite a collective to co-host an event.
 */
export async function inviteCohost(eventId: string, collectiveId: string, revSharePct: number = 0) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const sb = admin();

  // Verify event ownership
  const { data: event } = await sb
    .from("events")
    .select("id, collective_id, title")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { error: "Event not found" };

  // Verify user is admin of the event's collective
  const { data: membership } = await sb
    .from("collective_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("collective_id", event.collective_id)
    .in("role", ["admin", "promoter"])
    .maybeSingle();

  if (!membership) return { error: "Only admins and promoters can invite co-hosts" };

  // Can't co-host your own event
  if (collectiveId === event.collective_id) {
    return { error: "Can't invite your own collective as co-host" };
  }

  // Check if already invited
  const { data: existing } = await sb
    .from("event_collectives")
    .select("id, status")
    .eq("event_id", eventId)
    .eq("collective_id", collectiveId)
    .maybeSingle();

  if (existing) {
    return { error: `This collective is already ${existing.status === "accepted" ? "a co-host" : "invited"}` };
  }

  // Create invitation
  const { error } = await sb.from("event_collectives").insert({
    event_id: eventId,
    collective_id: collectiveId,
    role: "co_host",
    revenue_share_pct: Math.min(100, Math.max(0, revSharePct)),
    status: "pending",
    invited_by: user.id,
  });

  if (error) return { error: error.message };

  // Send notification via collab chat if it exists
  try {
    const { data: collabChannel } = await sb
      .from("channels")
      .select("id")
      .or(`and(collective_id.eq.${event.collective_id},partner_collective_id.eq.${collectiveId}),and(collective_id.eq.${collectiveId},partner_collective_id.eq.${event.collective_id})`)
      .eq("type", "collab")
      .limit(1)
      .maybeSingle();

    if (collabChannel) {
      await sb.from("messages").insert({
        channel_id: collabChannel.id,
        user_id: user.id,
        content: `🎉 Co-host invite sent for "${event.title}"! Check your events page to accept.`,
        type: "system",
      });
    }
  } catch {
    // Chat notification is non-critical
  }

  return { error: null };
}

/**
 * Accept a co-host invitation.
 */
export async function acceptCohostInvite(eventCollectiveId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const sb = admin();

  // Get the invitation
  const { data: invite } = await sb
    .from("event_collectives")
    .select("id, event_id, collective_id, status")
    .eq("id", eventCollectiveId)
    .maybeSingle();

  if (!invite) return { error: "Invitation not found" };
  if (invite.status !== "pending") return { error: "Invitation already responded to" };

  // Verify user is admin of the invited collective
  const { data: membership } = await sb
    .from("collective_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("collective_id", invite.collective_id)
    .in("role", ["admin", "promoter"])
    .maybeSingle();

  if (!membership) return { error: "Only admins can accept co-host invitations" };

  const { error } = await sb
    .from("event_collectives")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", eventCollectiveId);

  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Decline a co-host invitation.
 */
export async function declineCohostInvite(eventCollectiveId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const sb = admin();

  const { error } = await sb
    .from("event_collectives")
    .update({ status: "declined" })
    .eq("id", eventCollectiveId);

  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Get co-hosts for an event.
 */
export async function getEventCohosts(eventId: string) {
  const sb = admin();

  const { data } = await sb
    .from("event_collectives")
    .select("id, collective_id, role, revenue_share_pct, status, collectives(name, slug, logo_url)")
    .eq("event_id", eventId)
    .order("created_at");

  return (data ?? []).map((d) => {
    const collective = d.collectives as unknown as { name: string; slug: string; logo_url: string | null };
    return {
      id: d.id,
      collectiveId: d.collective_id,
      collectiveName: collective?.name || "Unknown",
      collectiveSlug: collective?.slug || "",
      logoUrl: collective?.logo_url || null,
      role: d.role,
      revSharePct: Number(d.revenue_share_pct),
      status: d.status,
    };
  });
}

/**
 * Get pending co-host invitations for a collective.
 */
export async function getPendingCohostInvites(collectiveId: string) {
  const sb = admin();

  const { data } = await sb
    .from("event_collectives")
    .select("id, event_id, role, revenue_share_pct, status, events(title, starts_at, collectives(name))")
    .eq("collective_id", collectiveId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return (data ?? []).map((d) => {
    const event = d.events as unknown as { title: string; starts_at: string; collectives: { name: string } };
    return {
      id: d.id,
      eventId: d.event_id,
      eventTitle: event?.title || "Event",
      eventDate: event?.starts_at || "",
      hostCollective: event?.collectives?.name || "Unknown",
      revSharePct: Number(d.revenue_share_pct),
    };
  });
}
